from __future__ import annotations

import math

from core.sizing_math import (
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
    calc_kv_per_session_gb,
    calc_model_mem_gb,
    calc_servers_by_compute,
    calc_servers_by_memory,
    calc_session_context_TS,
    calc_sessions_per_server,
    calc_th_decode_analyt,
    calc_th_prefill_analyt,
    calc_th_server_comp,
    calc_ttft,
)
from errors import ValidationAppError
from models import SizingInput, SizingOutput
from services.gpu_catalog_service import lookup_gpu_price_usd, lookup_gpu_tflops


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
    MKV = calc_kv_per_session_gb(
        inp.layers_L,
        inp.hidden_size_H,
        SL,
        inp.bytes_per_kv_state,
        inp.emp_kv,
        inp.num_kv_heads,
        inp.num_attention_heads,
    )

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
    FPS = calc_FPS(inp.params_billions)
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

    # Приоритет: эмпирические значения > аналитические
    th_pf = inp.th_prefill_empir if inp.th_prefill_empir else th_pf_analyt
    th_dec = inp.th_decode_empir if inp.th_decode_empir else th_dec_analyt

    # ── Section 6.2: Cmodel — req/sec на 1 экземпляр ──
    # Используем SL (= min(TS, TSmax)), а не TS: prefill обрабатывает
    # не более SL токенов (ограничено контекстным окном модели).
    Cmodel = calc_Cmodel(SL, th_pf, Tdec, th_dec)

    # ── Section 6.3: Пропускная способность сервера по compute ──
    # Методика v3, изм.8: Th_server_comp = N_model_TP=Z × Cmodel
    # Используется NcountTP (с учётом TP-множителя Z) вместо Ncount_model.
    th_server = calc_th_server_comp(NcountTP, Cmodel)

    # ── Section 6.4: Серверы по compute ──
    servers_comp = calc_servers_by_compute(
        Ssim,
        inp.rps_per_session_R,
        inp.sla_reserve_KSLA,
        th_server,
    )
    if servers_comp is math.inf:
        raise ValidationAppError(
            "Пропускная способность сервера = 0. "
            "Проверьте TFLOPS GPU, throughput или кол-во экземпляров на сервер."
        )

    # ── Section 7: Проверка конфигурации по TTFT и e2eLatency ──
    # Изм.9: T_out удалён, используем Tdec (уже рассчитан в п.6.1)
    ttft_analyt = calc_ttft(SL, th_pf, th_dec)
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
        Tdec_tokens=Tdec,
        th_prefill=th_pf,
        th_decode=th_dec,
        Cmodel_rps=Cmodel,
        th_server_comp=th_server,
        servers_by_compute=servers_comp,
        # Section 7: SLA validation
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
