from __future__ import annotations

import math

from core.sizing_math import (
    calc_gpus_per_instance,
    calc_kv_free_per_instance_gb,
    calc_kv_per_session_gb,
    calc_model_mem_gb,
    calc_FPS,
    calc_S_TP,
    calc_sl_dec_vlm,
    calc_sl_pf_vlm,
    calc_t_page_vlm,
    calc_th_decode_analyt,
    calc_th_decode_mem,
    calc_th_prefill_cb_compute,
    calc_th_prefill_cb_mem,
    calc_v_tok,
    select_th_decode,
    select_th_prefill,
)
from errors import ValidationAppError
from models import VLMSizingInput, VLMSizingOutput
from services.gpu_catalog_service import lookup_gpu_bandwidth_gbs, lookup_gpu_tflops


def run_vlm_sizing(inp: VLMSizingInput) -> VLMSizingOutput:
    """
    VLM single-pass online sizing (Приложение И.4.1).

    Pipeline:
      1. Vision-token profile: V_tok, SL_pf^VLM, SL_dec^VLM (И.3.1).
      2. KV-cache and model memory (§3.1, §3.2).
      3. Per-instance GPU count and max sessions S_TP_z (§4.1, §4.4).
      4. Throughput Th_pf^VLM, Th_dec^VLM via continuous-batching formulas
         with η_vlm,pf for prefill (И.7.1).
      5. BS_real* search: max BS satisfying t_page^VLM(BS) ≤ SLA_page (И.4.1).
      6. Replicas N_repl_VLM = ⌈C_peak / BS_real*⌉, total GPUs and servers.
    """
    # ── И.3.1: Token profile ──
    v_tok = calc_v_tok(inp.w_px, inp.h_px, inp.patch_eff, inp.n_ch)
    sl_pf_vlm = calc_sl_pf_vlm(v_tok, inp.n_prompt_txt)
    sl_dec_vlm = calc_sl_dec_vlm(inp.n_fields, inp.tok_field)
    sl_pf_vlm_eff = sl_pf_vlm * (1.0 - inp.eta_cache_vlm)

    # KV-кэш считаем по полной длине сессии (prefill + decode), capped TSmax
    sl_total = min(sl_pf_vlm + sl_dec_vlm, inp.max_context_window_TSmax)

    # ── §3.1: Model memory ──
    m_model = calc_model_mem_gb(
        inp.params_billions, inp.bytes_per_param, inp.emp_model, inp.safe_margin
    )

    # ── §3.2: KV per session (стандартная MHA/GQA/MQA — MLA out of scope для P9a) ──
    m_kv = calc_kv_per_session_gb(
        inp.layers_L,
        inp.hidden_size_H,
        sl_total,
        inp.bytes_per_kv_state,
        inp.emp_kv,
        inp.num_kv_heads,
        inp.num_attention_heads,
    )

    # ── §4.1: GPU per instance ──
    gpus_per_instance = calc_gpus_per_instance(m_model, inp.gpu_mem_gb, inp.kavail)

    # ── §4.4: Max parallel sessions per instance under TP ──
    Z = inp.tp_multiplier_Z
    GPUcount_z = Z * gpus_per_instance
    kv_free_z = calc_kv_free_per_instance_gb(GPUcount_z, inp.gpu_mem_gb, inp.kavail, m_model)
    s_tp_z = calc_S_TP(kv_free_z, m_kv)
    if s_tp_z <= 0:
        raise ValidationAppError(
            "VLM session не помещается в KV-память на инстанс. "
            "Уменьшите изображение, число полей или увеличьте память GPU."
        )

    # ── §6.1: Throughput resolution ──
    p_active = float(inp.params_billions)  # MoE handling out of scope для P9a
    FPS = calc_FPS(p_active)

    gpu_tflops = inp.gpu_flops_Fcount
    if gpu_tflops is None:
        gpu_tflops = lookup_gpu_tflops(inp.gpu_id, inp.gpu_mem_gb)
    fcount_model_flops = gpu_tflops * 1e12 * gpus_per_instance if gpu_tflops > 0 else 0.0

    bw_gpu = inp.bw_gpu_gbs
    if bw_gpu is None and inp.gpu_id:
        catalog_bw = lookup_gpu_bandwidth_gbs(inp.gpu_id)
        bw_gpu = catalog_bw if catalog_bw > 0 else None

    # Prefill compute branch — continuous-batching (BS-independent, использует η_vlm,pf)
    th_pf_compute_branch = calc_th_prefill_cb_compute(
        fcount_model_flops,
        inp.eta_vlm_pf,
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        sl_pf_vlm_eff,
    )

    # Decode compute branch (instance-level, BS-independent here; per-session = / BS_real)
    th_dec_compute_instance = calc_th_decode_analyt(
        fcount_model_flops,
        inp.eta_decode,
        1.0,  # K_batch=1 для continuous mode
        FPS,
        inp.layers_L,
        inp.hidden_size_H,
        sl_total,
        sl_dec_vlm,
    )

    # ── И.4.1: BS_real* search ──
    # Iterate BS from 1 to s_tp_z, stop at max BS satisfying t_page ≤ SLA_page.
    # Throughputs scale per session (compute branch divided by BS); mem branch
    # recomputed at each BS via calc_th_*_cb_mem / calc_th_decode_mem.
    bs_real_star = 0
    t_page_at_star = float("inf")
    th_pf_at_star = 0.0
    th_dec_at_star = 0.0

    bs_max = max(1, int(s_tp_z))
    for bs in range(1, bs_max + 1):
        # Per-session throughput at this BS
        th_pf_cmp_per_session = th_pf_compute_branch / bs if bs > 0 else 0.0
        th_dec_cmp_per_session = th_dec_compute_instance / bs if bs > 0 else 0.0

        # Memory branches (recomputed at this BS)
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

        # Select min(compute_per_session, mem) per branch
        th_pf_sel, _ = select_th_prefill(th_pf_cmp_per_session, th_pf_mem_at_bs)
        th_dec_sel, _ = select_th_decode(th_dec_cmp_per_session, th_dec_mem_at_bs)

        if th_pf_sel <= 0 or th_dec_sel <= 0:
            break  # cannot serve at this BS

        t_page = calc_t_page_vlm(
            sl_pf_vlm_eff, th_pf_sel, sl_dec_vlm, th_dec_sel, inp.t_ovh_vlm
        )

        if t_page <= inp.sla_page:
            bs_real_star = bs
            t_page_at_star = t_page
            th_pf_at_star = th_pf_sel
            th_dec_at_star = th_dec_sel
        else:
            # Higher BS only makes t_page worse (less per-session throughput) → stop
            break

    sla_pass = bs_real_star >= 1

    # ── И.4.1: Replicas and GPU count ──
    if not sla_pass:
        # Even BS=1 violates SLA — use BS=1 to surface t_page diagnostic
        # but n_repl is undefined; conservative: 1 replica per peak page
        bs_real_star = 1
        # Recompute t_page at BS=1 for diagnostic (last loop value if any)
        if t_page_at_star == float("inf"):
            th_pf_at_star = th_pf_compute_branch
            th_dec_at_star = th_dec_compute_instance
            t_page_at_star = calc_t_page_vlm(
                sl_pf_vlm_eff,
                th_pf_at_star,
                sl_dec_vlm,
                th_dec_at_star,
                inp.t_ovh_vlm,
            )
        n_repl = inp.c_peak  # one instance per concurrent page
    else:
        n_repl = math.ceil(inp.c_peak / bs_real_star)

    # Total GPU = N_repl × Z × gpus_per_instance (gpus_per_instance baked into Z·g)
    n_gpu_online = n_repl * Z * gpus_per_instance
    n_servers_online = math.ceil(n_gpu_online / inp.gpus_per_server)

    return VLMSizingOutput(
        v_tok=v_tok,
        sl_pf_vlm=sl_pf_vlm,
        sl_pf_vlm_eff=round(sl_pf_vlm_eff, 4),
        sl_dec_vlm=sl_dec_vlm,
        model_mem_gb=round(m_model, 4),
        kv_per_session_gb=round(m_kv, 4),
        gpus_per_instance=gpus_per_instance,
        s_tp_z=s_tp_z,
        instance_total_mem_gb=round(GPUcount_z * inp.gpu_mem_gb, 2),
        gpu_tflops_used=gpu_tflops,
        th_pf_vlm=round(th_pf_at_star, 4),
        th_dec_vlm=round(th_dec_at_star, 4),
        t_page_vlm=round(t_page_at_star, 4) if t_page_at_star != float("inf") else float("inf"),
        bs_real_star=bs_real_star,
        sla_pass=sla_pass,
        sla_page_target=inp.sla_page,
        n_repl_vlm=n_repl,
        n_gpu_vlm_online=n_gpu_online,
        n_servers_vlm_online=n_servers_online,
        eta_vlm_pf_used=inp.eta_vlm_pf,
        c_peak_used=inp.c_peak,
        lambda_online_used=inp.lambda_online,
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
    )
