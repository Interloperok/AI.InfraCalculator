from __future__ import annotations

import math

from core.sizing_math import (
    calc_FPS,
    calc_S_TP,
    calc_gpus_per_instance,
    calc_kv_free_per_instance_gb,
    calc_kv_per_session_gb,
    calc_l_text,
    calc_model_mem_gb,
    calc_n_gpu_ocr_online,
    calc_sl_dec_vlm,
    calc_sl_pf_llm_after_ocr,
    calc_t_llm_target,
    calc_t_ocr_cpu,
    calc_t_ocr_gpu,
    calc_th_decode_analyt,
    calc_th_decode_mem,
    calc_th_prefill_cb_compute,
    calc_th_prefill_cb_mem,
    select_th_decode,
    select_th_prefill,
)
from errors import ValidationAppError
from models import OCRSizingInput, OCRSizingOutput
from services.gpu_catalog_service import lookup_gpu_bandwidth_gbs, lookup_gpu_tflops


def run_ocr_sizing(inp: OCRSizingInput) -> OCRSizingOutput:
    """
    OCR + LLM two-pass online sizing (Приложение И.4.2).

    Pipeline:
      1. OCR stage — pages/sec на GPU (ocr_gpu) или CPU (ocr_cpu, out of GPU budget).
      2. SLA budget split: t_LLM^target = SLA_page − t_OCR − T_handoff.
      3. LLM stage tokens: L_text = chars_page / c_token; SL_pf^LLM = L_text + N_prompt^sys.
      4. LLM memory & throughput (§3, §6.1).
      5. BS_real* search: max BS satisfying t_page_llm ≤ t_LLM^target.
      6. Pool sums: N_GPU = N_OCR + N_LLM (GPU units).
    """
    pipeline = inp.pipeline.lower()
    if pipeline not in ("ocr_gpu", "ocr_cpu"):
        raise ValidationAppError(
            f"Неизвестный pipeline: '{inp.pipeline}'. Допустимо: 'ocr_gpu', 'ocr_cpu'."
        )

    # ── И.3.2 / И.3.3: OCR stage time and pool size ──
    eta_ocr_used: float | None = None
    r_ocr_used: float | None = None
    n_ocr_cores_used: int | None = None
    n_gpu_ocr_count: int

    if pipeline == "ocr_gpu":
        if inp.r_ocr_gpu is None or inp.r_ocr_gpu <= 0:
            raise ValidationAppError(
                "Для pipeline='ocr_gpu' обязательно задать r_ocr_gpu (pages/s/GPU)."
            )
        t_ocr = calc_t_ocr_gpu(inp.r_ocr_gpu)
        n_gpu_raw = calc_n_gpu_ocr_online(inp.c_peak, t_ocr, inp.eta_ocr)
        n_gpu_ocr_count = 0 if n_gpu_raw is math.inf else int(n_gpu_raw)
        eta_ocr_used = float(inp.eta_ocr)
        r_ocr_used = float(inp.r_ocr_gpu)
    else:  # ocr_cpu
        if inp.r_ocr_core is None or inp.n_ocr_cores is None:
            raise ValidationAppError(
                "Для pipeline='ocr_cpu' обязательны r_ocr_core и n_ocr_cores."
            )
        t_ocr = calc_t_ocr_cpu(inp.r_ocr_core, inp.n_ocr_cores)
        n_gpu_ocr_count = 0
        n_ocr_cores_used = int(inp.n_ocr_cores)
        r_ocr_used = float(inp.r_ocr_core) * int(inp.n_ocr_cores)

    # ── И.4.2: SLA budget split ──
    t_llm_target = calc_t_llm_target(inp.sla_page, t_ocr, inp.t_handoff)

    # ── И.3.4: LLM-stage token profile ──
    l_text = calc_l_text(inp.chars_page, inp.c_token)
    sl_pf_llm = calc_sl_pf_llm_after_ocr(l_text, inp.n_prompt_sys)
    sl_dec_llm = calc_sl_dec_vlm(inp.n_fields, inp.tok_field)
    sl_pf_llm_eff = sl_pf_llm * (1.0 - inp.eta_cache)

    sl_total = min(int(sl_pf_llm + sl_dec_llm), inp.max_context_window_TSmax)

    # ── §3.1: Model memory ──
    m_model = calc_model_mem_gb(
        inp.params_billions, inp.bytes_per_param, inp.emp_model, inp.safe_margin
    )

    # ── §3.2: KV per session ──
    m_kv = calc_kv_per_session_gb(
        inp.layers_L,
        inp.hidden_size_H,
        sl_total,
        inp.bytes_per_kv_state,
        inp.emp_kv,
        inp.num_kv_heads,
        inp.num_attention_heads,
    )

    # ── §4.1, §4.4: GPU per instance, S_TP_z ──
    gpus_per_instance = calc_gpus_per_instance(m_model, inp.gpu_mem_gb, inp.kavail)
    Z = inp.tp_multiplier_Z
    GPUcount_z = Z * gpus_per_instance
    kv_free_z = calc_kv_free_per_instance_gb(GPUcount_z, inp.gpu_mem_gb, inp.kavail, m_model)
    s_tp_z = calc_S_TP(kv_free_z, m_kv)
    if s_tp_z <= 0:
        raise ValidationAppError(
            "LLM-сессия не помещается в KV-память на инстанс. "
            "Уменьшите chars_page/N_prompt_sys или увеличьте память GPU."
        )

    # ── §6.1: Throughput ──
    p_active = float(inp.params_billions)
    FPS = calc_FPS(p_active)

    gpu_tflops = inp.gpu_flops_Fcount
    if gpu_tflops is None:
        gpu_tflops = lookup_gpu_tflops(inp.gpu_id, inp.gpu_mem_gb)
    fcount_model_flops = gpu_tflops * 1e12 * gpus_per_instance if gpu_tflops > 0 else 0.0

    bw_gpu = inp.bw_gpu_gbs
    if bw_gpu is None and inp.gpu_id:
        catalog_bw = lookup_gpu_bandwidth_gbs(inp.gpu_id)
        bw_gpu = catalog_bw if catalog_bw > 0 else None

    th_pf_compute_branch = calc_th_prefill_cb_compute(
        fcount_model_flops,
        inp.eta_prefill,
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        sl_pf_llm_eff,
    )

    th_dec_compute_instance = calc_th_decode_analyt(
        fcount_model_flops,
        inp.eta_decode,
        1.0,
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        sl_total,
        sl_dec_llm,
    )

    # ── И.4.2: BS_real* search constrained by t_LLM^target ──
    bs_real_star = 0
    t_page_at_star = float("inf")
    th_pf_at_star = 0.0
    th_dec_at_star = 0.0
    sla_failure_reason: str | None = None

    if t_llm_target <= 0:
        sla_failure_reason = (
            f"OCR + handoff ({t_ocr + inp.t_handoff:.3f}s) превышает SLA_page ({inp.sla_page}s) — "
            f"бюджет на LLM ≤ 0."
        )
    else:
        for bs in range(1, max(1, int(s_tp_z)) + 1):
            th_pf_cmp_per_session = th_pf_compute_branch / bs if bs > 0 else 0.0
            th_dec_cmp_per_session = th_dec_compute_instance / bs if bs > 0 else 0.0

            if bw_gpu and bw_gpu > 0:
                th_pf_mem_at_bs = calc_th_prefill_cb_mem(
                    c_pf=int(inp.c_pf or 256),
                    bw_gpu_gbs=bw_gpu,
                    eta_mem=inp.eta_mem,
                    p_effective_at_bs_plus_1=p_active,
                    b_quant=inp.bytes_per_param,
                    mkv_gb=m_kv,
                    bs_real=bs,
                    o_fixed_gb=inp.o_fixed,
                )
                th_dec_mem_at_bs = calc_th_decode_mem(
                    bw_gpu_gbs=bw_gpu,
                    eta_mem=inp.eta_mem,
                    params_billions=p_active,
                    b_quant=inp.bytes_per_param,
                    mkv_gb=m_kv,
                    bs_real=bs,
                    o_fixed_gb=inp.o_fixed,
                )
            else:
                th_pf_mem_at_bs = 0.0
                th_dec_mem_at_bs = 0.0

            th_pf_sel, _ = select_th_prefill(th_pf_cmp_per_session, th_pf_mem_at_bs)
            th_dec_sel, _ = select_th_decode(th_dec_cmp_per_session, th_dec_mem_at_bs)

            if th_pf_sel <= 0 or th_dec_sel <= 0:
                break

            t_page = (
                sl_pf_llm_eff / th_pf_sel
                + sl_dec_llm / th_dec_sel
                + inp.t_overhead_llm
            )

            if t_page <= t_llm_target:
                bs_real_star = bs
                t_page_at_star = t_page
                th_pf_at_star = th_pf_sel
                th_dec_at_star = th_dec_sel
            else:
                break

        if bs_real_star == 0:
            sla_failure_reason = (
                f"Даже при BS=1 LLM-стадия не укладывается в t_LLM^target "
                f"({t_llm_target:.3f}s)."
            )

    sla_pass = bs_real_star >= 1

    if not sla_pass:
        # Surface diagnostic at BS=1 even on failure
        bs_real_star_for_repl = 1
        if t_page_at_star == float("inf") and th_pf_compute_branch > 0 and th_dec_compute_instance > 0:
            th_pf_at_star = th_pf_compute_branch
            th_dec_at_star = th_dec_compute_instance
            t_page_at_star = (
                sl_pf_llm_eff / th_pf_at_star
                + sl_dec_llm / th_dec_at_star
                + inp.t_overhead_llm
            )
        n_repl_llm = inp.c_peak
    else:
        bs_real_star_for_repl = bs_real_star
        n_repl_llm = math.ceil(inp.c_peak / bs_real_star_for_repl)

    n_gpu_llm = n_repl_llm * Z * gpus_per_instance
    n_servers_llm = math.ceil(n_gpu_llm / inp.gpus_per_server)

    n_gpu_total = n_gpu_ocr_count + n_gpu_llm
    n_servers_total = math.ceil(n_gpu_total / inp.gpus_per_server)

    return OCRSizingOutput(
        pipeline_used=pipeline,
        t_ocr=round(t_ocr, 4) if t_ocr != float("inf") else float("inf"),
        eta_ocr_used=eta_ocr_used,
        r_ocr_used=r_ocr_used,
        n_ocr_cores_used=n_ocr_cores_used,
        n_gpu_ocr_online=n_gpu_ocr_count,
        l_text=round(l_text, 4),
        sl_pf_llm=round(sl_pf_llm, 4),
        sl_pf_llm_eff=round(sl_pf_llm_eff, 4),
        sl_dec_llm=sl_dec_llm,
        t_llm_target=round(t_llm_target, 4),
        t_handoff_used=float(inp.t_handoff),
        model_mem_gb=round(m_model, 4),
        kv_per_session_gb=round(m_kv, 4),
        gpus_per_instance=gpus_per_instance,
        s_tp_z=s_tp_z,
        instance_total_mem_gb=round(GPUcount_z * inp.gpu_mem_gb, 2),
        gpu_tflops_used=gpu_tflops,
        th_pf_llm=round(th_pf_at_star, 4),
        th_dec_llm=round(th_dec_at_star, 4),
        t_page_llm=round(t_page_at_star, 4) if t_page_at_star != float("inf") else float("inf"),
        bs_real_star=bs_real_star,
        sla_pass=sla_pass,
        sla_failure_reason=sla_failure_reason,
        n_repl_llm=n_repl_llm,
        n_gpu_llm_online=n_gpu_llm,
        n_servers_llm_online=n_servers_llm,
        n_gpu_total_online=n_gpu_total,
        n_servers_total_online=n_servers_total,
        sla_page_target=inp.sla_page,
        c_peak_used=inp.c_peak,
        lambda_online_used=inp.lambda_online,
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
    )
