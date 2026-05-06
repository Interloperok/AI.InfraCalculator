from __future__ import annotations

import math

from core.sizing_math import (
    calc_bs_real,
    calc_Cmodel,
    calc_FPS,
    calc_Kbatch,
    calc_SL,
    calc_Ssim,
    calc_T,
    calc_Tdec,
    calc_e2e_latency,
    calc_e2e_latency_load,
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
    calc_sessions_per_server,
    calc_sl_pf_agent,
    calc_ts_agent,
    calc_th_decode_analyt,
    calc_th_decode_mem,
    calc_th_prefill_analyt,
    calc_th_prefill_cb_compute,
    calc_th_prefill_cb_mem,
    calc_th_server_comp,
    calc_th_server_dec,
    calc_th_server_pf,
    calc_ttft,
    select_th_decode,
    select_th_prefill,
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
    Main sizing pipeline — Methodology v2.

    Sizing runs under two independent constraints:
    - GPU memory (sections 3-5)
    - compute throughput (section 6)
    Final: max(servers_by_memory, servers_by_compute)
    """

    # ── Section 2.1: Ssim — peak concurrent sessions ──
    Ssim = calc_Ssim(
        inp.internal_users,
        inp.penetration_internal,
        inp.concurrency_internal,
        inp.external_users,
        inp.penetration_external,
        inp.concurrency_external,
        inp.sessions_per_user_J,
    )

    # ── Section 2.2: T — total request+response length in tokens ──
    T = calc_T(
        inp.system_prompt_tokens_SP,
        inp.user_prompt_tokens_Prp,
        inp.reasoning_tokens_MRT,
        inp.answer_tokens_A,
    )

    # ── Section 3.1: Mmodel — memory for model weights ──
    Mmodel = calc_model_mem_gb(
        inp.params_billions,
        inp.bytes_per_param,
        inp.emp_model,
        inp.safe_margin,
    )

    # ── Section 2.2 (P8): TS and SL — session context length estimate ──
    # Use the agentic generalization: at K_calls=1 + zero tool/RAG fields,
    # reduces to the v2 (2.2) formula. With agentic params, includes tool
    # definitions, RAG context, multi-call amplification.
    k_calls = int(inp.k_calls or 1)
    sp_tools = float(inp.sp_tools or 0)
    c_rag_static = float(inp.c_rag_static or 0)
    c_rag_dynamic = float(inp.c_rag_dynamic or 0)
    a_tool = float(inp.a_tool or 0)
    TS = calc_ts_agent(
        SP=inp.system_prompt_tokens_SP,
        SP_tools=sp_tools,
        C_rag_static=c_rag_static,
        Prp=inp.user_prompt_tokens_Prp,
        C_rag_dynamic=c_rag_dynamic,
        MRT=inp.reasoning_tokens_MRT,
        A=inp.answer_tokens_A,
        A_tool=a_tool,
        n_prp=inp.dialog_turns,
        k_calls=k_calls,
    )
    SL = calc_SL(TS, inp.max_context_window_TSmax)

    # ── Section 3.2: KV-cache per session ──
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
            head_dim=int(inp.head_dim) if inp.head_dim else None,
        )
        if inp.num_kv_heads == 1:
            kv_arch_mode = "mqa"
        elif inp.num_kv_heads < inp.num_attention_heads:
            kv_arch_mode = "gqa"
        else:
            kv_arch_mode = "mha"

    # ── Section 4.1: GPUs per model instance ──
    GPUcount_model = calc_gpus_per_instance(Mmodel, inp.gpu_mem_gb, inp.kavail)

    # ── Section 4.2: instances per server (no TP factor) ──
    Ncount_model = calc_instances_per_server(inp.gpus_per_server, GPUcount_model)

    # ── Section 4.3: free memory for KV at the base TP ──
    kv_free_base = calc_kv_free_per_instance_gb(
        GPUcount_model,
        inp.gpu_mem_gb,
        inp.kavail,
        Mmodel,
    )

    # ── Section 4.4: concurrent sessions and Kbatch ──
    # KV-cache sharding under TP — methodology §4.4 H-6:
    #   - MLA (DeepSeek V2/V3/R1): latent c_t^KV replicated on every TP rank,
    #     so per-instance session memory = M_KV · GPUcount_inst.
    #     S_TP = floor(kv_free_inst / (GPUcount_inst · M_KV))
    #   - MHA/GQA/MQA: K/V sharded by min(GPUcount_inst, N_kv) heads,
    #     remaining ranks replicate. Per-instance session memory =
    #     M_KV · GPUcount_inst / min(GPUcount_inst, N_kv).
    #     S_TP = floor(kv_free_inst · min(GPUcount_inst, N_kv) / (M_KV · GPUcount_inst))
    # When GPUcount_inst ≤ N_kv (typical) the standard form reduces to
    # floor(kv_free / M_KV) — matches the legacy calc_S_TP. The replication
    # penalty kicks in for high-TP configurations or low-N_kv models.

    def _s_tp(kv_free_gb: float, gpu_count_inst: int) -> int:
        if MKV <= 0 or gpu_count_inst <= 0:
            return 0
        if is_mla:
            # MLA: latent replicated unconditionally.
            denom = gpu_count_inst * MKV
            return int(kv_free_gb // denom) if denom > 0 else 0
        # Standard: shard by min(GPUcount_inst, N_kv).
        n_kv = max(1, int(inp.num_kv_heads))
        shard = min(gpu_count_inst, n_kv)
        return int((kv_free_gb * shard) // (MKV * gpu_count_inst))

    S_TP_base = _s_tp(kv_free_base, GPUcount_model)

    # Computation for Z × GPUcount_model GPUs (with the TP multiplier)
    Z = inp.tp_multiplier_Z
    GPUcount_z = Z * GPUcount_model
    kv_free_z = calc_kv_free_per_instance_gb(
        GPUcount_z,
        inp.gpu_mem_gb,
        inp.kavail,
        Mmodel,
    )
    S_TP_z = _s_tp(kv_free_z, GPUcount_z)

    Kbatch = calc_Kbatch(S_TP_z, S_TP_base, inp.saturation_coeff_C)

    # ── Section 5.1 (P11): Pipeline / Expert parallelism extends footprint ──
    # Total per-instance GPU count = TP × PP × EP (Appendix Г.7).
    # PP/EP > 1 reduces instances_per_server proportionally because each
    # instance now occupies more GPUs.
    pp_deg = int(inp.pp_degree or 1)
    ep_deg = int(inp.ep_degree or 1)
    eta_tp_used = float(inp.eta_tp if inp.eta_tp is not None else 1.0)
    Z_combined = Z * pp_deg * ep_deg
    NcountTP = calc_instances_per_server_tp(inp.gpus_per_server, GPUcount_model, Z_combined)
    Sserver = calc_sessions_per_server(NcountTP, S_TP_z)

    # ── Section 5.2: Servers by memory ──
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

    # Determine Fcount_model — peak FLOPS per TP-model instance (methodology §6.1
    # row 70 "пиковая производительность GPU с учётом их количества на 1
    # экземпляр модели"). Per the xlsx (llm_calc/sizing.py:402) and the
    # reference Python implementation, this is `gpu_per_inst · flops_gpu`
    # where `gpu_per_inst = Z · GPUcount_model`. Earlier the web used
    # just `GPUcount_model` (per-instance pre-TP) — that understated
    # throughput by Z× for TP>1 deployments.
    gpu_tflops = inp.gpu_flops_Fcount
    if gpu_tflops is None:
        gpu_tflops = lookup_gpu_tflops(inp.gpu_id, inp.gpu_mem_gb)
    Fcount_model_flops = gpu_tflops * 1e12 * GPUcount_z if gpu_tflops > 0 else 0.0

    # Analytical throughput
    # P7: Engine mode determines prefill compute branch.
    #   - 'static' (offline / Triton w/o inflight): K_batch boost, uses SL.
    #   - 'continuous' (vLLM/SGLang/TGI default): K_batch=1, uses SL_pf_eff,
    #     and a separate mem-bound branch (computed inside iteration since
    #     it depends on BS_real and P_effective(BS_real+1)).
    engine_mode = inp.engine_mode or "continuous"

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

    # ── §Г (P11): Apply η_TP to nominal compute throughput branches ──
    # Communication overhead reduces effective throughput at TP > 1.
    # Default eta_tp_used=1.0 → no scaling. Scales the per-instance
    # compute branch for decode (th_dec_analyt). Prefill compute branch
    # (th_pf_compute_branch) is scaled later, after engine_mode resolves
    # the compute formula in §6.1 H-8/H-9.
    th_dec_analyt = th_dec_analyt * eta_tp_used

    # ── §6.1 H-7: Memory-bandwidth-bound decode (P1) — resolve bw_gpu ──
    bw_gpu = inp.bw_gpu_gbs
    if bw_gpu is None and inp.gpu_id:
        catalog_bw = lookup_gpu_bandwidth_gbs(inp.gpu_id)
        bw_gpu = catalog_bw if catalog_bw > 0 else None


    # ── §7.1 (P2 + P8): SL_pf for prefill / TTFT / Cmodel ──
    # Input-only sequence length (excludes answer / last-turn reasoning that
    # haven't been generated yet). Used in TTFT and Cmodel formulas.
    # P8: agentic generalization — reduces to calc_sl_pf at K_calls=1 + zero
    # tool/RAG fields.
    SL_pf = calc_sl_pf_agent(
        SP=inp.system_prompt_tokens_SP,
        SP_tools=sp_tools,
        C_rag_static=c_rag_static,
        Prp=inp.user_prompt_tokens_Prp,
        C_rag_dynamic=c_rag_dynamic,
        MRT=inp.reasoning_tokens_MRT,
        n_prp=inp.dialog_turns,
        k_calls=k_calls,
    )
    SL_pf_eff = SL_pf * (1.0 - inp.eta_cache)

    # ── §6.1 (P7): Prefill compute branch — BS-independent, computed once ──
    if engine_mode == "static":
        th_pf_compute_branch = calc_th_prefill_analyt(
            Fcount_model_flops, inp.eta_prefill, Kbatch, FPS,
            inp.layers_L, inp.hidden_size_H, SL,
        )
    else:
        # 'continuous' — K_batch=1, SL_pf_eff (post-prefix-cache)
        th_pf_compute_branch = calc_th_prefill_cb_compute(
            Fcount_model_flops, inp.eta_prefill, FPS,
            inp.layers_L, inp.hidden_size_H, SL_pf_eff,
        )
    # P11: η_TP scaling on prefill compute branch
    th_pf_compute_branch = th_pf_compute_branch * eta_tp_used

    # ── §6.4 (P4): Iterative servers-by-compute fixed-point ──
    # Couples BS_real ↔ Servers_count. As servers grow, BS_real shrinks,
    # per-session throughput rises (less compute / mem traffic per request),
    # which reduces required servers. Loop converges within 3-5 iterations
    # for typical workloads; max 10 to handle compute↔memory boundary
    # oscillations.
    #
    # Methodology §6.2 / §6.4 step 2 treats Th_pf as **constant** during the
    # iteration (formula written as `SL_pf/Th_pf` without (BS) argument);
    # only Th_dec is BS-dependent. This is also what the xlsx and the
    # reference Python implementation do. We compute Th_pf once at
    # BS_real^(0) (the initial BS at Servers_mem) and reuse it across
    # all 10 iterations.
    MAX_ITER = 10

    bs_real_init = (
        calc_bs_real(Ssim, NcountTP, servers_mem, bs_max=S_TP_z)
        if servers_mem > 0
        else 1
    )
    if is_moe_detailed:
        p_eff_pf_init = calc_p_effective(
            p_dense=float(inp.params_dense),
            p_moe=float(inp.params_moe),
            n_experts=int(inp.n_experts),
            k_experts=int(inp.k_experts),
            bs_real=bs_real_init + 1,
        )
    else:
        p_eff_pf_init = p_active

    if engine_mode == "continuous":
        th_pf_mem_at_init = calc_th_prefill_cb_mem(
            c_pf=int(inp.c_pf or 256),
            bw_gpu_gbs=bw_gpu if bw_gpu is not None else 0.0,
            eta_mem=inp.eta_mem,
            p_effective_at_bs_plus_1=p_eff_pf_init,
            b_quant=inp.bytes_per_param,
            mkv_gb=MKV,
            bs_real=bs_real_init,
            o_fixed_gb=inp.o_fixed,
        )
        th_pf_frozen, mode_prefill_bound_frozen = select_th_prefill(
            th_pf_compute_branch, th_pf_mem_at_init
        )
    else:
        # 'static' — K_batch formula already BS-independent.
        th_pf_mem_at_init = 0.0
        th_pf_frozen = th_pf_compute_branch
        mode_prefill_bound_frozen = "static"

    # Empirical prefill override wins regardless of engine_mode.
    if inp.th_prefill_empir:
        th_pf_frozen = float(inp.th_prefill_empir)
        mode_prefill_bound_frozen = "empirical"

    def _iteration_state(servers_in: int) -> dict:
        """Compute derived state for one iteration given a server count.

        Per methodology §6.2 / §6.4: Th_pf is frozen across iterations
        (computed once at BS_real_init); only Th_dec is BS-dependent.
        """
        bs_r = calc_bs_real(Ssim, NcountTP, servers_in, bs_max=S_TP_z)
        # P_effective grows with BS for MoE (broader expert coverage) —
        # used in the decode mem-branch denominator.
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
        # Decode: compute branch per-session, mem branch per-session at BS
        th_dec_cmp_session = th_dec_analyt / bs_r if bs_r > 0 else th_dec_analyt
        th_dec_mem_local = calc_th_decode_mem(
            bw_gpu_gbs=bw_gpu if bw_gpu is not None else 0.0,
            eta_mem=inp.eta_mem,
            params_billions=p_eff_local,
            b_quant=inp.bytes_per_param,
            mkv_gb=MKV,
            bs_real=bs_r,
            o_fixed_gb=inp.o_fixed,
        )
        # Decode: empirical override or selector + K_spec
        if inp.th_decode_empir:
            dec_sel = inp.th_decode_empir
            dec_mode = "empirical"
        else:
            dec_sel, dec_mode = select_th_decode(th_dec_cmp_session, th_dec_mem_local)
        th_dec_session = dec_sel * inp.k_spec

        # C_model with BS_real (uses SL_pf_eff per §7.1)
        cm = calc_Cmodel(SL_pf_eff, th_pf_frozen, Tdec, th_dec_session, bs_real=bs_r)
        th_srv = calc_th_server_comp(NcountTP, cm)
        # P8: amplified rps because each user-session triggers K_calls
        # LLM invocations. effective_R = R · K_calls.
        effective_R = inp.rps_per_session_R * k_calls
        sc = calc_servers_by_compute(
            Ssim, effective_R, inp.sla_reserve_KSLA, th_srv
        )
        return {
            "bs_real": bs_r,
            "p_effective": p_eff_local,
            "th_dec_compute_per_session": th_dec_cmp_session,
            "th_dec_mem": th_dec_mem_local,
            "th_dec": th_dec_session,
            "mode_decode_bound": dec_mode,
            "th_pf_compute": th_pf_compute_branch,
            "th_pf_mem": th_pf_mem_at_init,
            "th_pf": th_pf_frozen,
            "mode_prefill_bound": mode_prefill_bound_frozen,
            "cmodel": cm,
            "th_server_comp": th_srv,
            "servers_comp": sc,
        }

    # Methodology §6.4 step 3: iterate until Servers^(k+1) = Servers^(k);
    # typical 2-4 iterations, hard cap at MAX_ITER. Pure fixed-point loop —
    # no |Δ|≤1 looseness, no max-stability stickiness (those were prior web
    # additions that diverged from the xlsx and reference Python
    # implementations on 1-cycle-oscillation scenarios). For oscillating
    # scenarios that never satisfy `==`, the loop runs all 10 iterations
    # and takes whatever the final iteration produces — same as the
    # reference's fixed 10-iter loop.
    servers = servers_mem
    iteration_count = 0
    for i in range(MAX_ITER):
        iteration_count = i + 1
        state = _iteration_state(servers)
        if state["servers_comp"] is math.inf:
            raise ValidationAppError(
                "Пропускная способность сервера = 0. "
                "Проверьте TFLOPS GPU, throughput или кол-во экземпляров на сервер."
            )
        new_servers = max(servers_mem, state["servers_comp"])
        if i > 0 and new_servers == servers:
            break
        servers = new_servers
    # Final state at the converged servers count.
    state = _iteration_state(servers)

    BS_real = state["bs_real"]
    p_effective = state["p_effective"]
    th_dec_compute_per_session = state["th_dec_compute_per_session"]
    th_dec_mem = state["th_dec_mem"]
    th_dec = state["th_dec"]
    mode_decode_bound = state["mode_decode_bound"]
    th_pf_compute = state["th_pf_compute"]
    th_pf_mem = state["th_pf_mem"]
    th_pf = state["th_pf"]
    mode_prefill_bound = state["mode_prefill_bound"]
    Cmodel = state["cmodel"]
    th_server = state["th_server_comp"]
    servers_comp = state["servers_comp"]

    # ── Section 7 (P2 + P6): TTFT, e2eLatency at converged BS_real ──
    ttft_analyt = calc_ttft(SL_pf_eff, th_pf, th_dec, inp.t_overhead)
    gen_time_analyt = calc_generation_time(Tdec, th_dec)
    e2e_latency_analyt = calc_e2e_latency(ttft_analyt, gen_time_analyt)

    # P6: Loaded-latency form via Little's law. Captures queueing time
    # at sustained BS_real load; SLA validation uses max(analyt, load).
    e2e_latency_load = calc_e2e_latency_load(BS_real, Cmodel)
    e2e_latency_for_sla = max(e2e_latency_analyt, e2e_latency_load)

    ttft_sla_pass = None
    e2e_latency_sla_pass = None
    sla_passed = None

    if inp.ttft_sla is not None:
        ttft_sla_pass = inp.ttft_sla >= ttft_analyt
    if inp.e2e_latency_sla is not None:
        # P6: validate against the stricter form (analyt or load, whichever larger)
        e2e_latency_sla_pass = inp.e2e_latency_sla >= e2e_latency_for_sla

    checks = [value for value in (ttft_sla_pass, e2e_latency_sla_pass) if value is not None]
    if checks:
        sla_passed = all(checks)

    # ── Appendix Б (Приложение Б): recommendations when SLA fails ──
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

    # ── Section Ж (P10): PD-disaggregation pool sizing ──
    # Methodology Ж.2: Servers_total = Servers_pf + Servers_dec, where each
    # pool is sized independently per §6 with its own dominant coefficient.
    # Per-pool eta overrides (pd_eta_pf_pool, pd_eta_mem_pool) reflect that
    # a phase-specialized pool may have different calibration coefficients
    # than a co-located deployment (§E.1.1 decode-heavy / §E.1.2 prefill-heavy).
    eta_pf_pool_used = (
        float(inp.pd_eta_pf_pool) if inp.pd_eta_pf_pool is not None else float(inp.eta_prefill)
    )
    eta_mem_pool_used = (
        float(inp.pd_eta_mem_pool) if inp.pd_eta_mem_pool is not None else float(inp.eta_mem)
    )

    # Pool-specific prefill throughput. Compute branch is linear in η_pf;
    # mem branch is independent of η_pf. Empirical override (when set) is a
    # measured value that bypasses analytical scaling.
    if inp.th_prefill_empir:
        th_pf_pool = float(inp.th_prefill_empir)
    else:
        pf_scale = (
            eta_pf_pool_used / inp.eta_prefill if inp.eta_prefill > 0 else 1.0
        )
        th_pf_compute_scaled = th_pf_compute * pf_scale if th_pf_compute > 0 else 0.0
        if engine_mode == "continuous" and th_pf_mem > 0 and th_pf_compute_scaled > 0:
            th_pf_pool = min(th_pf_compute_scaled, th_pf_mem)
        elif th_pf_compute_scaled > 0:
            th_pf_pool = th_pf_compute_scaled
        else:
            th_pf_pool = th_pf_mem if engine_mode == "continuous" else 0.0

    # Pool-specific decode per-session throughput. Mem branch is linear in
    # η_mem; compute branch (per session) is independent of η_mem.
    if inp.th_decode_empir:
        th_dec_session_pool = float(th_dec)
    else:
        mem_scale = eta_mem_pool_used / inp.eta_mem if inp.eta_mem > 0 else 1.0
        th_dec_mem_scaled = th_dec_mem * mem_scale if th_dec_mem > 0 else 0.0
        if th_dec_mem_scaled > 0 and th_dec_compute_per_session > 0:
            sel = min(th_dec_compute_per_session, th_dec_mem_scaled)
        elif th_dec_mem_scaled > 0:
            sel = th_dec_mem_scaled
        elif th_dec_compute_per_session > 0:
            sel = th_dec_compute_per_session
        else:
            sel = 0.0
        th_dec_session_pool = sel * inp.k_spec

    # Per-server pool throughput (req/sec).
    th_server_pf_val = calc_th_server_pf(NcountTP, th_pf_pool, SL_pf_eff)
    th_server_dec_val = calc_th_server_dec(NcountTP, th_dec_session_pool, BS_real, Tdec)

    # Per-pool server counts. Reuse §6.4 K_SLA framework with effective_R
    # (P8 amplification by K_calls).
    effective_R = inp.rps_per_session_R * k_calls
    servers_pf_count = calc_servers_by_compute(
        Ssim, effective_R, inp.sla_reserve_KSLA, th_server_pf_val
    )
    servers_dec_count = calc_servers_by_compute(
        Ssim, effective_R, inp.sla_reserve_KSLA, th_server_dec_val
    )

    if servers_pf_count is math.inf or servers_dec_count is math.inf:
        servers_pf_int = None
        servers_dec_int = None
        servers_pd_total = None
    else:
        servers_pf_int = int(servers_pf_count)
        servers_dec_int = int(servers_dec_count)
        servers_pd_total = servers_pf_int + servers_dec_int

    # Recommendation surface: when classical co-located sizing wastes >30%,
    # tell the operator that PD-disaggregation could save servers.
    pd_recommendation = None
    if (
        not inp.use_pd_disagg
        and servers_pd_total is not None
        and servers_comp not in (0, math.inf)
        and servers_pd_total < 0.7 * servers_comp
    ):
        savings_pct = round((1 - servers_pd_total / servers_comp) * 100)
        pd_recommendation = (
            f"PD-дизагрегация (Приложение Ж) могла бы сократить compute-серверы "
            f"на ~{savings_pct}% ({servers_comp} → {servers_pd_total}). "
            f"Установите use_pd_disagg=true для расчёта с раздельными пулами."
        )

    # ── Section 8: final server count ──
    if inp.use_pd_disagg and servers_pd_total is not None:
        servers_final = max(servers_mem, servers_pd_total)
    else:
        servers_final = max(servers_mem, servers_comp)

    # ── Cost estimate (from GPU catalog price: custom catalog or gpu_data.json) ──
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

    # ── Section 9: Gateway quotas (LiteLLM / shared vLLM rate-limits) ──
    # Pure demand-side: independent of GPU/server count. Values are conservative
    # upper bounds suitable for setting tpm/rpm caps on a shared vLLM pool.
    # See models.SizingOutput field docstrings for formula details.
    user_request_rate_per_min = Ssim * inp.rps_per_session_R * inp.sla_reserve_KSLA * 60.0
    peak_rpm_val = user_request_rate_per_min * k_calls
    peak_tpm_input_val = user_request_rate_per_min * SL_pf
    peak_tpm_output_val = user_request_rate_per_min * Tdec
    peak_tpm_val = peak_tpm_input_val + peak_tpm_output_val
    k_sla = float(inp.sla_reserve_KSLA) if inp.sla_reserve_KSLA > 0 else 1.0
    sustained_rpm_val = peak_rpm_val / k_sla
    sustained_tpm_val = peak_tpm_val / k_sla
    max_parallel_requests_val = math.ceil(Ssim * k_sla)

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
        total_gpu_per_instance=GPUcount_model * Z_combined,
        total_gpu_count=servers_final * inp.gpus_per_server,
        eta_tp_used=eta_tp_used,
        pp_degree_used=pp_deg,
        ep_degree_used=ep_deg,
        kv_free_per_instance_tp_gb=round(kv_free_z, 4),
        # Section 5
        instances_per_server_tp=NcountTP,
        sessions_per_server=Sserver,
        servers_by_memory=servers_mem,
        # Section 6
        gpu_tflops_used=gpu_tflops,
        Fcount_model_tflops=gpu_tflops * GPUcount_z if gpu_tflops > 0 else 0.0,
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
        th_pf_compute=round(th_pf_compute, 4) if th_pf_compute > 0 else None,
        th_pf_mem=round(th_pf_mem, 4) if th_pf_mem > 0 else None,
        mode_prefill_bound=mode_prefill_bound,
        th_decode=th_dec,
        th_dec_compute=round(th_dec_analyt, 4) if th_dec_analyt > 0 else None,
        th_dec_mem=round(th_dec_mem, 4) if th_dec_mem > 0 else None,
        mode_decode_bound=mode_decode_bound,
        bw_gpu_gbs_used=round(bw_gpu, 2) if bw_gpu else None,
        Cmodel_rps=Cmodel,
        th_server_comp=th_server,
        servers_by_compute=servers_comp,
        # Section Ж (P10): PD-disaggregation
        pd_disagg_used=bool(inp.use_pd_disagg),
        th_server_pf=round(th_server_pf_val, 4) if th_server_pf_val > 0 else None,
        th_server_dec=round(th_server_dec_val, 4) if th_server_dec_val > 0 else None,
        servers_pf=servers_pf_int,
        servers_dec=servers_dec_int,
        servers_pd_total=servers_pd_total,
        pd_eta_pf_pool_used=round(eta_pf_pool_used, 4),
        pd_eta_mem_pool_used=round(eta_mem_pool_used, 4),
        pd_recommendation=pd_recommendation,
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
        e2e_latency_load=round(e2e_latency_load, 4)
        if e2e_latency_load != float("inf")
        else None,
        e2e_latency_for_sla=round(e2e_latency_for_sla, 4)
        if e2e_latency_for_sla != float("inf")
        else None,
        ttft_sla_target=inp.ttft_sla,
        e2e_latency_sla_target=inp.e2e_latency_sla,
        ttft_sla_pass=ttft_sla_pass,
        e2e_latency_sla_pass=e2e_latency_sla_pass,
        sla_passed=sla_passed,
        sla_recommendations=sla_recommendations,
        # Section 8
        servers_final=servers_final,
        # Section 9: Gateway quotas
        peak_rpm=round(peak_rpm_val, 2),
        peak_tpm_input=round(peak_tpm_input_val, 2),
        peak_tpm_output=round(peak_tpm_output_val, 2),
        peak_tpm=round(peak_tpm_val, 2),
        sustained_rpm=round(sustained_rpm_val, 2),
        sustained_tpm=round(sustained_tpm_val, 2),
        max_parallel_requests=max_parallel_requests_val,
        # Context
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
        cost_estimate_usd=cost_estimate_usd,
    )
