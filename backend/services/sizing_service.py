from __future__ import annotations

import math

from core.sizing_math import (
    calc_bs_real,
    calc_Cmodel,
    calc_FPS,
    calc_Kbatch,
    calc_S_TP,
    calc_SL,
    calc_Ssim,
    calc_T,
    calc_Tdec,
    calc_e2e_latency,
    calc_generation_time,
    calc_gpus_per_instance,
    calc_instances_per_server,
    calc_instances_per_server_tp,
    calc_kv_free_per_instance_gb,
    calc_kv_mla,
    calc_kv_per_session_gb,
    calc_model_mem_gb,
    calc_p_effective,
    calc_servers_by_compute,
    calc_servers_by_memory,
    calc_session_context_TS,
    calc_sessions_per_server,
    calc_sl_pf,
    calc_th_decode_analyt,
    calc_th_decode_mem,
    calc_th_prefill_analyt,
    calc_th_server_comp,
    calc_ttft,
    select_th_decode,
)
from errors import ValidationAppError
from models import SizingInput, SizingOutput
from services.gpu_catalog_service import (
    lookup_gpu_bandwidth_gbs,
    lookup_gpu_price_usd,
    lookup_gpu_tflops,
)


def run_sizing(inp: SizingInput) -> SizingOutput:
    """
    Главный pipeline расчёта — Методика v2

    Выполняет расчёт по двум независимым ограничениям:
    - по памяти GPU (разделы 3-5)
    - по вычислительной пропускной способности (раздел 6)
    Итог: max(серверы_по_памяти, серверы_по_compute)
    """

    # ── Section 2.1: Ssim — пиковое кол-во одновременных сессий ──
    Ssim = calc_Ssim(
        inp.internal_users,
        inp.penetration_internal,
        inp.concurrency_internal,
        inp.external_users,
        inp.penetration_external,
        inp.concurrency_external,
        inp.sessions_per_user_J,
    )

    # ── Section 2.2: T — общая длина запроса и ответа в токенах ──
    T = calc_T(
        inp.system_prompt_tokens_SP,
        inp.user_prompt_tokens_Prp,
        inp.reasoning_tokens_MRT,
        inp.answer_tokens_A,
    )

    # ── Section 3.1: Mmodel — память для весов модели ──
    Mmodel = calc_model_mem_gb(
        inp.params_billions,
        inp.bytes_per_param,
        inp.emp_model,
        inp.safe_margin,
    )

    # ── Section 2.2: TS и SL — оценка длины контекста сессии ──
    TS = calc_session_context_TS(
        inp.system_prompt_tokens_SP,
        inp.user_prompt_tokens_Prp,
        inp.reasoning_tokens_MRT,
        inp.answer_tokens_A,
        inp.dialog_turns,
    )
    SL = calc_SL(TS, inp.max_context_window_TSmax)

    # ── Section 3.2: KV-кэш на 1 сессию ──
    # P5: branch on Multi-Head Latent Attention (MLA, DeepSeek-V2/V3/R1).
    # When kv_lora_rank > 0, the model uses MLA — different formula. For
    # standard MHA/GQA/MQA, fall back to the v2 formula and detect arch
    # from N_kv vs N_attention ratio.
    is_mla = bool(inp.kv_lora_rank and inp.kv_lora_rank > 0)
    if is_mla:
        MKV = calc_kv_mla(
            L=inp.layers_L,
            SL=SL,
            kv_lora_rank=int(inp.kv_lora_rank),
            qk_rope_head_dim=int(inp.qk_rope_head_dim or 0),
            bytes_state=inp.bytes_per_kv_state,
            emp_kv=inp.emp_kv,
        )
        kv_arch_mode = "mla"
    else:
        MKV = calc_kv_per_session_gb(
            inp.layers_L,
            inp.hidden_size_H,
            SL,
            inp.bytes_per_kv_state,
            inp.emp_kv,
            inp.num_kv_heads,
            inp.num_attention_heads,
        )
        if inp.num_kv_heads == 1:
            kv_arch_mode = "mqa"
        elif inp.num_kv_heads < inp.num_attention_heads:
            kv_arch_mode = "gqa"
        else:
            kv_arch_mode = "mha"

    # ── Section 4.1: GPU на 1 экземпляр модели ──
    GPUcount_model = calc_gpus_per_instance(Mmodel, inp.gpu_mem_gb, inp.kavail)

    # ── Section 4.2: Экземпляры на сервер (без TP-множителя) ──
    Ncount_model = calc_instances_per_server(inp.gpus_per_server, GPUcount_model)

    # ── Section 4.3: Свободная память для KV на базовом TP ──
    kv_free_base = calc_kv_free_per_instance_gb(
        GPUcount_model,
        inp.gpu_mem_gb,
        inp.kavail,
        Mmodel,
    )

    # ── Section 4.4: Параллельные сессии и Kbatch ──
    S_TP_base = calc_S_TP(kv_free_base, MKV)

    # Расчёт для Z × GPUcount_model GPU (с TP-множителем)
    Z = inp.tp_multiplier_Z
    GPUcount_z = Z * GPUcount_model
    kv_free_z = calc_kv_free_per_instance_gb(
        GPUcount_z,
        inp.gpu_mem_gb,
        inp.kavail,
        Mmodel,
    )
    S_TP_z = calc_S_TP(kv_free_z, MKV)

    Kbatch = calc_Kbatch(S_TP_z, S_TP_base, inp.saturation_coeff_C)

    # ── Section 5.1: Пропускная способность сервера по памяти ──
    NcountTP = calc_instances_per_server_tp(inp.gpus_per_server, GPUcount_model, Z)
    Sserver = calc_sessions_per_server(NcountTP, S_TP_z)

    # ── Section 5.2: Серверы по памяти ──
    servers_mem = calc_servers_by_memory(Ssim, Sserver)
    if servers_mem is math.inf:
        raise ValidationAppError(
            "Невозможно разместить сессии по памяти. "
            "Увеличьте память GPU, уменьшите контекст или уменьшите KV/сессию."
        )

    # ── Section 6.1: Throughput per instance ──
    # P3 — MoE accounting: resolve P_active (for FPS, BS-independent).
    # P_effective is BS-dependent and lives in the §6.4 iteration loop.
    p_active = float(inp.params_active) if inp.params_active else float(inp.params_billions)
    is_moe_detailed = (
        inp.params_dense is not None
        and inp.params_moe is not None
        and inp.params_moe > 0
        and inp.n_experts is not None
        and inp.n_experts > 0
        and inp.k_experts is not None
        and inp.k_experts > 0
    )

    FPS = calc_FPS(p_active)
    Tdec = calc_Tdec(inp.answer_tokens_A, inp.reasoning_tokens_MRT)

    # Определяем Fcount_model (FLOPS для GPU, выделенных под 1 экземпляр модели)
    gpu_tflops = inp.gpu_flops_Fcount
    if gpu_tflops is None:
        gpu_tflops = lookup_gpu_tflops(inp.gpu_id, inp.gpu_mem_gb)
    Fcount_model_flops = gpu_tflops * 1e12 * GPUcount_model if gpu_tflops > 0 else 0.0

    # Аналитические throughput (с учётом Kbatch)
    th_pf_analyt = calc_th_prefill_analyt(
        Fcount_model_flops,
        inp.eta_prefill,
        Kbatch,
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        SL,
    )
    th_dec_analyt = calc_th_decode_analyt(
        Fcount_model_flops,
        inp.eta_decode,
        Kbatch,
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        SL,
        Tdec,
    )

    # ── §6.1 H-7: Memory-bandwidth-bound decode (P1) — resolve bw_gpu ──
    bw_gpu = inp.bw_gpu_gbs
    if bw_gpu is None and inp.gpu_id:
        catalog_bw = lookup_gpu_bandwidth_gbs(inp.gpu_id)
        bw_gpu = catalog_bw if catalog_bw > 0 else None

    # Empirical prefill override (BS-independent)
    th_pf = inp.th_prefill_empir if inp.th_prefill_empir else th_pf_analyt

    # ── §7.1 (P2): SL_pf for prefill / TTFT / Cmodel ──
    # Input-only sequence length (excludes answer / last-turn reasoning that
    # haven't been generated yet). Used in TTFT and Cmodel formulas.
    SL_pf = calc_sl_pf(
        inp.system_prompt_tokens_SP,
        inp.user_prompt_tokens_Prp,
        inp.reasoning_tokens_MRT,
        inp.dialog_turns,
    )
    SL_pf_eff = SL_pf * (1.0 - inp.eta_cache)

    # ── §6.4 (P4): Iterative servers-by-compute fixed-point ──
    # Couples BS_real ↔ Servers_count. As servers grow, BS_real shrinks,
    # per-session throughput rises (less compute / mem traffic per request),
    # which reduces required servers. Loop converges within 3-5 iterations
    # for typical workloads; max 10 to handle compute↔memory boundary
    # oscillations.
    MAX_ITER = 10

    def _iteration_state(servers_in: int) -> dict:
        """Compute derived state for one iteration given a server count."""
        bs_r = calc_bs_real(Ssim, NcountTP, servers_in, bs_max=S_TP_z)
        # P_effective grows with BS for MoE (broader expert coverage)
        if is_moe_detailed:
            p_eff_local = calc_p_effective(
                p_dense=float(inp.params_dense),
                p_moe=float(inp.params_moe),
                n_experts=int(inp.n_experts),
                k_experts=int(inp.k_experts),
                bs_real=bs_r,
            )
        else:
            p_eff_local = p_active
        # Compute branch is per-session at this BS (instance / BS)
        th_dec_cmp_session = th_dec_analyt / bs_r if bs_r > 0 else th_dec_analyt
        # Mem branch — formula already per-session at given BS
        th_dec_mem_local = calc_th_decode_mem(
            bw_gpu_gbs=bw_gpu if bw_gpu is not None else 0.0,
            eta_mem=inp.eta_mem,
            params_billions=p_eff_local,
            b_quant=inp.bytes_per_param,
            mkv_gb=MKV,
            bs_real=bs_r,
            o_fixed_gb=inp.o_fixed,
        )
        # Empirical override or selector + K_spec
        if inp.th_decode_empir:
            sel = inp.th_decode_empir
            mode = "empirical"
        else:
            sel, mode = select_th_decode(th_dec_cmp_session, th_dec_mem_local)
        th_dec_session = sel * inp.k_spec
        # C_model with BS_real (uses SL_pf_eff per §7.1)
        cm = calc_Cmodel(SL_pf_eff, th_pf, Tdec, th_dec_session, bs_real=bs_r)
        th_srv = calc_th_server_comp(NcountTP, cm)
        sc = calc_servers_by_compute(
            Ssim, inp.rps_per_session_R, inp.sla_reserve_KSLA, th_srv
        )
        return {
            "bs_real": bs_r,
            "p_effective": p_eff_local,
            "th_dec_compute_per_session": th_dec_cmp_session,
            "th_dec_mem": th_dec_mem_local,
            "th_dec": th_dec_session,
            "mode_decode_bound": mode,
            "cmodel": cm,
            "th_server_comp": th_srv,
            "servers_comp": sc,
        }

    servers = servers_mem
    state = _iteration_state(servers)
    iteration_count = 1
    for i in range(MAX_ITER):
        iteration_count = i + 1
        state = _iteration_state(servers)
        if state["servers_comp"] is math.inf:
            raise ValidationAppError(
                "Пропускная способность сервера = 0. "
                "Проверьте TFLOPS GPU, throughput или кол-во экземпляров на сервер."
            )
        new_servers = max(servers_mem, state["servers_comp"])
        # Convergence: |Δ| ≤ 1 vs previous iter. Take max for stability —
        # protects against 1-cycle oscillation near the compute/memory boundary.
        if i > 0 and abs(new_servers - servers) <= 1:
            servers = max(servers, new_servers)
            state = _iteration_state(servers)
            break
        servers = new_servers

    BS_real = state["bs_real"]
    p_effective = state["p_effective"]
    th_dec_compute_per_session = state["th_dec_compute_per_session"]
    th_dec_mem = state["th_dec_mem"]
    th_dec = state["th_dec"]
    mode_decode_bound = state["mode_decode_bound"]
    Cmodel = state["cmodel"]
    th_server = state["th_server_comp"]
    servers_comp = state["servers_comp"]

    # ── Section 7 (P2): TTFT + e2eLatency at converged BS_real ──
    ttft_analyt = calc_ttft(SL_pf_eff, th_pf, th_dec, inp.t_overhead)
    gen_time_analyt = calc_generation_time(Tdec, th_dec)
    e2e_latency_analyt = calc_e2e_latency(ttft_analyt, gen_time_analyt)

    ttft_sla_pass = None
    e2e_latency_sla_pass = None
    sla_passed = None

    if inp.ttft_sla is not None:
        ttft_sla_pass = inp.ttft_sla >= ttft_analyt
    if inp.e2e_latency_sla is not None:
        e2e_latency_sla_pass = inp.e2e_latency_sla >= e2e_latency_analyt

    checks = [value for value in (ttft_sla_pass, e2e_latency_sla_pass) if value is not None]
    if checks:
        sla_passed = all(checks)

    # ── Приложение Б: рекомендации при невыполнении SLA ──
    sla_recommendations = None
    if sla_passed is False:
        sla_recommendations = []
        ttft_fail = ttft_sla_pass is False
        e2e_fail = e2e_latency_sla_pass is False

        if ttft_fail and e2e_fail:
            sla_recommendations.extend(
                [
                    "1. Увеличить TP-множитель (Z) — штатный механизм, повышает Th_pf и Th_dec",
                    "2. Применить более агрессивную квантизацию (FP16→FP8/INT4)",
                    "5. Сменить на модель с меньшим числом параметров или MoE",
                    "6. Использовать более производительное оборудование (GPU с большей bandwidth)",
                ]
            )
        elif ttft_fail:
            sla_recommendations.extend(
                [
                    "3. Сократить длину контекста (SL): уменьшить системный промпт, глубину диалога, применить суммаризацию",
                    "1. Увеличить TP-множитель (Z) — повышает Th_pf",
                    "2. Применить более агрессивную квантизацию",
                ]
            )
        elif e2e_fail:
            sla_recommendations.extend(
                [
                    "4. Сократить объём генерации (T_out): ограничить max_tokens, уменьшить MRT",
                    "1. Увеличить TP-множитель (Z) — повышает Th_dec",
                    "2. Применить более агрессивную квантизацию",
                ]
            )

        sla_recommendations.append(
            "7. Пересмотреть целевые значения SLA, если техническая стоимость несоразмерна бизнес-ценности"
        )

    # ── Section 8: Итоговое количество серверов ──
    servers_final = max(servers_mem, servers_comp)

    # ── Cost estimate (from GPU catalog price: custom catalog или gpu_data.json) ──
    custom_catalog_list = None
    if getattr(inp, "custom_gpu_catalog", None) is not None:
        raw_catalog = inp.custom_gpu_catalog
        if isinstance(raw_catalog, list):
            custom_catalog_list = raw_catalog
        elif isinstance(raw_catalog, dict):
            custom_catalog_list = list(raw_catalog.values())

    price_per_gpu = lookup_gpu_price_usd(inp.gpu_id, inp.gpu_mem_gb, custom_catalog_list)
    cost_estimate_usd = (
        round(servers_final * inp.gpus_per_server * price_per_gpu, 2)
        if price_per_gpu is not None and price_per_gpu > 0
        else None
    )

    return SizingOutput(
        # Section 2
        Ssim_concurrent_sessions=Ssim,
        T_tokens_per_request=T,
        # Section 3
        model_mem_gb=Mmodel,
        TS_session_context=TS,
        SL_sequence_length=SL,
        kv_per_session_gb=MKV,
        kv_arch_mode=kv_arch_mode,
        # Section 4
        gpus_per_instance=GPUcount_model,
        instances_per_server=Ncount_model,
        kv_free_per_instance_gb=kv_free_base,
        S_TP_base=S_TP_base,
        S_TP_z=S_TP_z,
        Kbatch=Kbatch,
        instance_total_mem_gb=round(GPUcount_z * inp.gpu_mem_gb, 2),
        kv_free_per_instance_tp_gb=round(kv_free_z, 4),
        # Section 5
        instances_per_server_tp=NcountTP,
        sessions_per_server=Sserver,
        servers_by_memory=servers_mem,
        # Section 6
        gpu_tflops_used=gpu_tflops,
        Fcount_model_tflops=gpu_tflops * GPUcount_model if gpu_tflops > 0 else 0.0,
        FPS_flops_per_token=FPS,
        p_active_used=p_active,
        p_effective_used=round(p_effective, 4),
        is_moe_detailed=is_moe_detailed,
        BS_real=BS_real,
        iteration_count=iteration_count,
        th_dec_compute_per_session_at_bs=round(th_dec_compute_per_session, 4)
        if th_dec_compute_per_session > 0
        else None,
        Tdec_tokens=Tdec,
        th_prefill=th_pf,
        th_decode=th_dec,
        th_dec_compute=round(th_dec_analyt, 4) if th_dec_analyt > 0 else None,
        th_dec_mem=round(th_dec_mem, 4) if th_dec_mem > 0 else None,
        mode_decode_bound=mode_decode_bound,
        bw_gpu_gbs_used=round(bw_gpu, 2) if bw_gpu else None,
        Cmodel_rps=Cmodel,
        th_server_comp=th_server,
        servers_by_compute=servers_comp,
        # Section 7: SLA validation
        SL_pf_input_length=SL_pf,
        SL_pf_eff_after_cache=round(SL_pf_eff, 4),
        ttft_analyt=round(ttft_analyt, 4) if ttft_analyt != float("inf") else None,
        generation_time_analyt=round(gen_time_analyt, 4)
        if gen_time_analyt != float("inf")
        else None,
        e2e_latency_analyt=round(e2e_latency_analyt, 4)
        if e2e_latency_analyt != float("inf")
        else None,
        ttft_sla_target=inp.ttft_sla,
        e2e_latency_sla_target=inp.e2e_latency_sla,
        ttft_sla_pass=ttft_sla_pass,
        e2e_latency_sla_pass=e2e_latency_sla_pass,
        sla_passed=sla_passed,
        sla_recommendations=sla_recommendations,
        # Section 8
        servers_final=servers_final,
        # Context
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
        cost_estimate_usd=cost_estimate_usd,
    )
