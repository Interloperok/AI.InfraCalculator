from __future__ import annotations

import math

# Capacity sizing module for LLM deployment (Methodology v2)
#
# Sizing methodology is based on the document:
# "Methodology for calculating the number of servers and GPUs for LLM-inference solutions"
#
# Sizing is performed under two independent constraints:
# 1. GPU memory (model weights and KV-cache) — sections 3-5 (разделы 3-5)
# 2. Compute throughput (tokens/sec, requests/sec) — section 6 (раздел 6)
# Final server count = max(servers_by_memory, servers_by_compute)


# ═══════════════════════════════════════════════════════════
# Section 2: workload definition (Раздел 2)
# ═══════════════════════════════════════════════════════════


def calc_Ssim(iu, pin, cin, eu, pex, cex, J):
    """
    Section 2.1 (Раздел 2.1) — peak number of concurrent sessions.

    Ssim = Nusers × Kpen × Ksim × J  (per segment, then summed)

    Parameters:
    - iu, pin, cin: internal users, penetration, concurrency
    - eu, pex, cex: external users, penetration, concurrency
    - J: number of concurrent sessions per user
    """
    return iu * pin * cin * J + eu * pex * cex * J


def calc_T(SP, Prp, MRT, A):
    """
    Section 2.2 (Раздел 2.2) — average total request+response length in tokens.

    T = SP + Prp + MRT + A
    """
    return SP + Prp + MRT + A


# ═══════════════════════════════════════════════════════════
# Section 3: GPU memory (Раздел 3)
# ═══════════════════════════════════════════════════════════


def calc_model_mem_gb(params_b, bytes_per_param, emp_model, safe_margin):
    """
    Section 3.1 (Раздел 3.1) — memory required for model weights (GiB).

    Mmodel = (P × 10⁹ × Bquant / 1024³) × EMPmodel + SM
    """
    return (params_b * 1e9 * bytes_per_param / (1024**3)) * emp_model + safe_margin


def calc_session_context_TS(SP, Prp, MRT, A, dialog_turns):
    """
    Section 3.2 (Раздел 3.2) — rough session context length (used for KV-cache).

    TS_prp5_s1 = SP + dialog_turns × (Prp + MRT + A)

    Assumes a dialog of dialog_turns messages (default 5).
    """
    return SP + dialog_turns * (Prp + MRT + A)


def calc_sl_pf(SP, Prp, MRT, dialog_turns):
    """
    Section 7.1 (Раздел 7.1) — input sequence length for the prefill phase.

    SL_pf = SP + N_prp × Prp + (N_prp − 1) × MRT

    Unlike SL (full session length used for KV-cache), SL_pf counts only
    the tokens that hit prefill: the system prompt, all user requests in
    the session (N_prp of them), and reasoning tokens of previous turns
    (N_prp − 1, excluding the last one which has not been generated yet).
    Used in TTFT and Th_pf.
    """
    n_prp = dialog_turns
    return SP + n_prp * Prp + max(0, n_prp - 1) * MRT


def calc_ts_agent(
    SP,
    SP_tools,
    C_rag_static,
    Prp,
    C_rag_dynamic,
    MRT,
    A,
    A_tool,
    n_prp,
    k_calls,
):
    """
    Appendix В.4 (Приложение В.4) — TS for agentic architectures (multi-call workloads).

    TS_agent = SP_eff + N_prp × K_calls × (Prp_eff + MRT + A_eff)

    Where (В.1-В.3):
      SP_eff = SP + SP_tools + C_rag_static
      Prp_eff = Prp + C_rag_dynamic
      A_eff = A + A_tool

    With K_calls = 1 and zero add-ons (SP_tools = C_rag_* = A_tool = 0)
    the formula reduces to (2.2) from ``calc_session_context_TS`` —
    backward compatible.

    Used in the KV-cache formula (instead of TS) for agentic scenarios:
    ReAct, Self-Refine, Multi-agent (CrewAI / LangGraph), Function calling.
    """
    SP_eff = SP + SP_tools + C_rag_static
    Prp_eff = Prp + C_rag_dynamic
    A_eff = A + A_tool
    return SP_eff + n_prp * k_calls * (Prp_eff + MRT + A_eff)


def calc_sl_pf_agent(
    SP,
    SP_tools,
    C_rag_static,
    Prp,
    C_rag_dynamic,
    MRT,
    n_prp,
    k_calls,
):
    """
    Appendix В.4 (Приложение В.4) derived — SL_pf for agentic architectures.

    SL_pf_agent = SP_eff + (N_prp × K_calls) × Prp_eff + (N_prp × K_calls − 1) × MRT

    Input-only length for a peak agentic session. With K_calls = 1 and
    zero add-ons it is equivalent to ``calc_sl_pf``. Does not include
    A / A_tool — consistent with the convention in ``calc_sl_pf``
    (previous answers are not counted as prefill).
    """
    SP_eff = SP + SP_tools + C_rag_static
    Prp_eff = Prp + C_rag_dynamic
    total_calls = n_prp * k_calls
    return SP_eff + total_calls * Prp_eff + max(0, total_calls - 1) * MRT


def calc_SL(TS, TSmax):
    """
    Section 3.2 (Раздел 3.2) — context window sequence length.

    SL = min(TS, TSmax)
    """
    return min(TS, TSmax)


def calc_kv_per_session_gb(
    L,
    H,
    SL,
    bytes_state,
    emp_kv,
    num_kv_heads=32,
    num_attention_heads=32,
    head_dim=None,
):
    """
    Section 3.2 (Раздел 3.2) — KV-cache per session for MHA/GQA/MQA (GiB).

    Universal form (preferred, methodology §3.2):
        M_KV = 2 · L · N_kv · head_dim · SL · B_state · EMP_kv / 1024³

    Applies to MHA/GQA/MQA for ANY ratio of H, N_attention, head_dim.
    Correct for non-standard models (e.g. MoE Qwen3-30B-A3B, where
    N_attention · head_dim ≠ H). Activated when head_dim > 0.

    Fallback form (via H · N_kv/N_attention):
        M_KV = 2 · L · H · SL · B_state · EMP_kv · (N_kv/N_attention) / 1024³

    Used when head_dim is not provided. Equivalent to the universal form
    only when H = N_attention · head_dim (standard dense transformers).
    """
    if head_dim is not None and head_dim > 0 and num_kv_heads > 0:
        # Universal form via head_dim — methodology-preferred.
        return (2 * L * num_kv_heads * head_dim * SL * bytes_state * emp_kv) / (1024**3)

    # Fallback: H-based form (assumes H = N_attention · head_dim).
    kv_ratio = num_kv_heads / num_attention_heads if num_attention_heads > 0 else 1.0
    return (2 * L * H * SL * bytes_state * emp_kv * kv_ratio) / (1024**3)


def calc_kv_mla(L, SL, kv_lora_rank, qk_rope_head_dim, bytes_state, emp_kv):
    """
    Section 3.2 (Раздел 3.2) MLA branch — KV-cache for Multi-Head Latent Attention (GiB).

    MKV_MLA_s1 = L × SL × (kv_lora_rank + qk_rope_head_dim) × Bstate × EMPkv / 1024³

    Multi-Head Latent Attention (MLA, DeepSeek V2/V3/R1) compresses K and V
    into a shared latent representation + a small RoPE component, and stores
    one vector per token per layer (not two). Hence the absence of the factor 2.

    Architecture parameters:
      DeepSeek-V3 / R1:  kv_lora_rank=512, qk_rope_head_dim=64
      DeepSeek-V2:       kv_lora_rank=512, qk_rope_head_dim=64

    Returns 0.0 if both parameters are <= 0 (unavailable — caller must
    fall back to the standard formula).
    """
    if kv_lora_rank <= 0 and qk_rope_head_dim <= 0:
        return 0.0
    return L * SL * (kv_lora_rank + qk_rope_head_dim) * bytes_state * emp_kv / (1024**3)


# ═══════════════════════════════════════════════════════════
# Section 4: GPU and Tensor Parallelism (Раздел 4)
# ═══════════════════════════════════════════════════════════


def calc_gpus_per_instance(model_mem_gb, gpu_mem_gb, kavail):
    """
    Section 4.1 (Раздел 4.1) — minimum GPUs per model instance.

    GPUcount_model = ⌈ Mmodel / (GPUmemory × Kavail) ⌉
    """
    return max(1, math.ceil(model_mem_gb / (gpu_mem_gb * kavail)))


def calc_instances_per_server(gpus_per_server, gpus_per_instance):
    """
    Section 4.2 (Раздел 4.2) — model instances per server (without TP factor).

    Ncount_model = ⌊ GPUcount_server / GPUcount_model ⌋
    """
    return max(0, gpus_per_server // gpus_per_instance)


def calc_kv_free_per_instance_gb(gpus_per_instance, gpu_mem_gb, kavail, model_mem_gb):
    """
    Section 4.3 (Раздел 4.3) — free GPU memory available for KV-cache per model instance (GiB).

    GPUmemoryForKV_model = GPUcount_model × GPUmemory × Kavail − Mmodel
    """
    return max(0.0, gpus_per_instance * gpu_mem_gb * kavail - model_mem_gb)


def calc_S_TP(kv_free_gb, kv_per_session_gb):
    """
    Section 4.4 (Раздел 4.4) — max theoretical concurrent sessions at given TP.

    S_TP=n = ⌊ GPUmemoryForKV_model / MKV_s1 ⌋
    """
    if kv_per_session_gb <= 0:
        return 0
    return int(kv_free_gb // kv_per_session_gb)


def calc_Kbatch(S_TP_z, S_TP_base, C):
    """
    Section 4.4 (Раздел 4.4) — throughput uplift factor from TP and Batch Size.

    Kbatch = (S_TP_z / S_TP_base) × ((S_TP_base + C) / (S_TP_z + C))

    With Z=1 → S_TP_z == S_TP_base → Kbatch = 1.0
    """
    if S_TP_base <= 0 or S_TP_z <= 0:
        return 1.0
    return (S_TP_z / S_TP_base) * ((S_TP_base + C) / (S_TP_z + C))


# ═══════════════════════════════════════════════════════════
# Section 5: servers by memory (Раздел 5)
# ═══════════════════════════════════════════════════════════


def calc_instances_per_server_tp(gpus_per_server, gpus_per_instance, Z):
    """
    Section 5.1 (Раздел 5.1) — model instances per server with TP factored in.

    NcountTP_model = ⌊ GPUcount_server / (Z × GPUcount_model) ⌋
    """
    total_gpus_per_instance_tp = Z * gpus_per_instance
    if total_gpus_per_instance_tp <= 0:
        return 0
    return gpus_per_server // total_gpus_per_instance_tp


def calc_sessions_per_server(NcountTP, S_TP_z):
    """
    Section 5.1 (Раздел 5.1) — concurrent sessions supported per server.

    Sserver = NcountTP_model × S_TP_z
    """
    return NcountTP * S_TP_z


def calc_servers_by_memory(Ssim, Sserver):
    """
    Section 5.2 (Раздел 5.2) — number of servers by memory.

    Servers_mem = ⌈ Ssim / Sserver ⌉
    """
    if Sserver <= 0:
        return math.inf
    return math.ceil(Ssim / Sserver)


# ═══════════════════════════════════════════════════════════
# Section 6: servers by compute throughput (Раздел 6)
# ═══════════════════════════════════════════════════════════


def calc_FPS(params_billions):
    """
    Section 6.1 (Раздел 6.1) — FLOP per token (baseline estimate).

    FPS = 2 × P × 10⁹

    Accepts either P_total (for dense) or P_active (for MoE — only
    active parameters participate in the forward pass per token).
    """
    return 2 * params_billions * 1e9


def calc_p_effective(p_dense, p_moe, n_experts, k_experts, bs_real=1):
    """
    Section 6.1 (Раздел 6.1) — effective parameter count read from HBM per decode step.

    P_effective(BS_real) = P_dense + P_moe × [1 − (1 − k/N_experts)^BS_real]

    For dense models (P_moe = 0) the formula degenerates to P_dense.
    For MoE at BS = 1 about k/N_experts experts are covered; for large
    BS the statistical coverage approaches the full sum (P_dense + P_moe).

    Used in the memory-bandwidth-bound decode formula (§6.1 H-7) —
    reflects the actual weight volume read from memory per forward
    pass of a batch.
    """
    if p_moe <= 0 or n_experts <= 0 or k_experts <= 0:
        return p_dense
    coverage = 1.0 - (1.0 - k_experts / n_experts) ** bs_real
    return p_dense + p_moe * coverage


def calc_Tdec(A, MRT):
    """
    Section 6.1 (Раздел 6.1) — tokens generated in the decode phase per request.

    Tdec = A + MRT
    """
    return A + MRT


def calc_th_prefill_analyt(Fcount_model_flops, eta_pf, Kbatch, FPS, L, H, SL):
    """
    Section 6.1 (Раздел 6.1) — analytical prefill throughput for static batching (tokens/sec).

    Th_pf_analyt ≈ (Fcount_model × η_pf × Kbatch) / (FPS + 4 × L × H × SL)

    Applies to engines with static batching (offline scripts,
    Triton without inflight, research harnesses): all batch requests
    start simultaneously, prefill parallelizes across the batch — hence
    the K_batch uplift.

    For continuous batching (vLLM, SGLang, TGI, Triton+inflight) use
    ``calc_th_prefill_cb_compute`` (without K_batch) and
    ``calc_th_prefill_cb_mem``, taking ``min(compute, mem)``.
    """
    denominator = FPS + 4 * L * H * SL
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_pf * Kbatch) / denominator


def calc_th_prefill_cb_compute(Fcount_model_flops, eta_pf, FPS, L, H, sl_pf_eff):
    """
    Section 6.1 (Раздел 6.1) — compute-bound prefill ceiling in continuous batching (tokens/sec).

    Th_pf^cb,compute(SL_pf) = F_count × η_pf / (FPS + 4 × L × H × SL_pf)

    Same shape as ``calc_th_prefill_analyt`` with K_batch = 1 — in
    continuous batching all prefill tokens are processed in one slice
    without static-batch uplift.
    """
    denominator = FPS + 4 * L * H * sl_pf_eff
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return Fcount_model_flops * eta_pf / denominator


def calc_th_prefill_cb_mem(
    c_pf,
    bw_gpu_gbs,
    eta_mem,
    p_effective_at_bs_plus_1,
    b_quant,
    mkv_gb,
    bs_real,
    o_fixed_gb=0.0,
):
    """
    Section 6.1 (Раздел 6.1) — memory-bandwidth-bound prefill ceiling in continuous batching (tokens/sec).

    Th_pf^cb,mem = (C_pf × BW_GPU × 10⁹ × η_mem)
                 / (P_eff(BS_real + 1) × 10⁹ × B_quant
                    + BS_real × M_KV × 1024³
                    + O_fixed × 1024³)

    C_pf — chunked-prefill step budget (vLLM max_num_batched_tokens minus
    the decode share). Typically 32-512 tokens. Dominates for BS_real ≥ 4
    on MoE with typical C_pf.

    Returns 0.0 if bw_gpu_gbs <= 0 or c_pf <= 0.
    """
    if bw_gpu_gbs is None or bw_gpu_gbs <= 0 or c_pf <= 0:
        return 0.0
    numerator = c_pf * bw_gpu_gbs * 1e9 * eta_mem
    denominator = (
        p_effective_at_bs_plus_1 * 1e9 * b_quant
        + bs_real * mkv_gb * (1024**3)
        + o_fixed_gb * (1024**3)
    )
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def select_th_prefill(th_compute, th_mem):
    """
    Section 6.1 (Раздел 6.1) — pick the binding prefill throughput in continuous batching.

    Th_pf^cb = min(Th_pf^cb,compute, Th_pf^cb,mem)

    Returns (value, mode), where mode ∈ {"compute", "memory", "compute_only",
    "memory_only", "none"} — analogous to ``select_th_decode``.
    """
    if th_compute <= 0 and th_mem <= 0:
        return 0.0, "none"
    if th_mem <= 0:
        return th_compute, "compute_only"
    if th_compute <= 0:
        return th_mem, "memory_only"
    if th_mem < th_compute:
        return th_mem, "memory"
    return th_compute, "compute"


def calc_th_decode_analyt(Fcount_model_flops, eta_dec, Kbatch, FPS, L, H, SL, Tdec):
    """
    Section 6.1 (Раздел 6.1) — analytical compute-bound decode throughput (tokens/sec).

    Th_dec_analyt ≈ (Fcount_model × η_dec × Kbatch) / (FPS + 4 × L × H × (SL + (Tdec−1)/2))
    """
    denominator = FPS + 4 * L * H * (SL + (Tdec - 1) / 2)
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_dec * Kbatch) / denominator


def calc_th_decode_mem(
    bw_gpu_gbs,
    eta_mem,
    params_billions,
    b_quant,
    mkv_gb,
    bs_real=1,
    o_fixed_gb=0.0,
):
    """
    Section 6.1 (Раздел 6.1) H-7 — memory-bandwidth-bound decode throughput (tokens/sec).

    Th_dec_mem(BS_real) = (BW_GPU × 10⁹ × η_mem)
                        / (P_eff(BS_real) × 10⁹ × B_quant
                           + BS_real × M_KV × 1024³
                           + O_fixed × 1024³)

    For P1: P_eff = params_billions (treated as P_active until P3 adds MoE
    accounting); BS_real = 1 (until P4 adds iterative coupling).

    Returns 0.0 if bw_gpu_gbs is not provided — in that case the mem branch
    is skipped and th_dec stays compute-bound.
    """
    if bw_gpu_gbs is None or bw_gpu_gbs <= 0:
        return 0.0
    numerator = bw_gpu_gbs * 1e9 * eta_mem
    denominator = (
        params_billions * 1e9 * b_quant
        + bs_real * mkv_gb * (1024**3)
        + o_fixed_gb * (1024**3)
    )
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def select_th_decode(th_compute, th_mem):
    """
    Section 6.1 (Раздел 6.1) — pick the binding decode throughput.

    Th_dec = min(Th_dec^compute, Th_dec^mem) when both are defined;
    otherwise the only available value.

    Returns (value, mode), where mode ∈ {"compute", "memory", "compute_only",
    "memory_only", "none"}:
      - "compute"      — both branches computed, compute < mem (compute-bound)
      - "memory"       — both branches computed, mem < compute (memory-bound)
      - "compute_only" — bw_gpu not provided, only compute is computed
      - "memory_only"  — compute = 0 (degenerate case)
      - "none"         — both = 0 (error / invalid input)
    """
    if th_compute <= 0 and th_mem <= 0:
        return 0.0, "none"
    if th_mem <= 0:
        return th_compute, "compute_only"
    if th_compute <= 0:
        return th_mem, "memory_only"
    if th_mem < th_compute:
        return th_mem, "memory"
    return th_compute, "compute"


def calc_Cmodel(sl_pf_eff, th_pf, Tdec, th_dec_per_session, bs_real=1):
    """
    Section 6.2 (Раздел 6.2) — average requests/sec per model instance (v3).

    C_model(BS_real) = BS_real / (SL_pf^eff / Th_pf + T_dec / Th_dec_per_session)

    With BS_real = 1 this is equivalent to the prior v2 formula
    (1 / time_per_request). Th_dec_per_session is the per-session decode
    throughput at the given BS_real (after dividing the compute branch
    by BS_real and applying K_spec). See iter §6.4.
    """
    if th_pf <= 0 or th_dec_per_session <= 0 or bs_real <= 0:
        return 0.0
    time_per_request = sl_pf_eff / th_pf + Tdec / th_dec_per_session
    if time_per_request <= 0:
        return 0.0
    return bs_real / time_per_request


def calc_bs_real(ssim, ncount_per_server, servers, bs_max=None):
    """
    Section 6.2 / 6.4 (Раздел 6.2 / 6.4) — actual batch size per model instance.

    BS_real = min(BS_max, ⌈Ssim / (Ncount·Servers)⌉)

    BS_max — memory ceiling (S_TP_z). If not provided, no ceiling is applied.
    Minimum is always 1 (degenerate case — 0 requests).
    """
    if servers <= 0 or ncount_per_server <= 0:
        return 1
    raw = math.ceil(ssim / (ncount_per_server * servers))
    capped = max(1, raw)
    if bs_max is not None and bs_max > 0:
        return min(int(bs_max), capped)
    return capped


def calc_th_server_comp(Ncount_model, Cmodel):
    """
    Section 6.3 (Раздел 6.3) — per-server throughput (req/sec).

    Th_server_comp = Ncount_model × Cmodel
    """
    return Ncount_model * Cmodel


def calc_ttft(sl_pf_eff, th_pf, th_dec, t_overhead=0.0):
    """
    Section 7.1 (Раздел 7.1) — Time To First Token (TTFT).

    TTFT_analyt = SL_pf^eff / Th_pf + 1 / Th_dec + T_overhead

    Where SL_pf^eff = SL_pf · (1 − η_cache) — effective prefill length
    after prefix-caching. Resolved by the caller (sizing_service).
    T_overhead is constant per-request overhead (tokenization, proxy,
    admission), §7.1 / §Е.5.

    P2 change: replaces SL with SL_pf and adds T_overhead. Behavior with
    sl_pf_eff = SL and t_overhead = 0 matches the prior formula —
    migration is backward compatible for callers passing positional args.
    """
    if th_pf <= 0 or th_dec <= 0:
        return float("inf")
    return sl_pf_eff / th_pf + 1.0 / th_dec + t_overhead


def calc_generation_time(T_out, th_dec):
    """
    Section 7.2 (Раздел 7.2) — total generation time across all tokens.

    GenerationTime_analyt = T_out / Th_dec
    """
    if th_dec <= 0:
        return float("inf")
    return T_out / th_dec


def calc_e2e_latency(ttft, generation_time):
    """
    Section 7.2 (Раздел 7.2) — end-to-end latency (per-request, BS-aware via th_dec_per_session).

    e2eLatency_analyt = TTFT_analyt + GenerationTime_analyt
    """
    return ttft + generation_time


def calc_e2e_latency_load(bs_real, cmodel_rps):
    """
    Section 7.2 (Раздел 7.2) — end-to-end latency under sustained load (Little's law).

    e2eLatency_load(BS_real) = BS_real / C_model(BS_real)

    Average request residence time in the system at steady-state load.
    Grows with BS (queue waiting), whereas e2eLatency_analyt grows
    sub-linearly via the per-session th_dec.

    For SLA validation we use max(analyt, load) — to catch
    "load-induced" violations invisible in the single-request formula.
    """
    if cmodel_rps <= 0:
        return float("inf")
    return bs_real / cmodel_rps


def calc_servers_by_compute(Ssim, R, KSLA, th_server_comp):
    """
    Section 6.4 (Раздел 6.4) — number of servers by throughput.

    Servers_comp = ⌈ (Ssim × R × KSLA) / Th_server_comp ⌉
    """
    if th_server_comp <= 0:
        return math.inf
    return math.ceil((Ssim * R * KSLA) / th_server_comp)


# ═══════════════════════════════════════════════════════════
# Section Ж: PD-disaggregation (split prefill / decode pools)
# ═══════════════════════════════════════════════════════════


def calc_th_server_pf(NcountTP, th_pf, sl_pf_eff):
    """
    Appendix Ж.2 (Приложение Ж.2) — server throughput in the prefill pool (req/sec).

    Th_pf^server = NcountTP × Th_pf / SL_pf^eff

    In a PD-disaggregated topology the prefill pool runs only the prefill
    phase (TTFT-bounded), and per-request time per instance =
    SL_pf^eff / Th_pf. Hence C_model_pf = Th_pf / SL_pf^eff (req/sec per
    instance), and a server with NcountTP instances produces
    NcountTP × C_model_pf req/sec.
    """
    if sl_pf_eff <= 0 or th_pf <= 0 or NcountTP <= 0:
        return 0.0
    return NcountTP * th_pf / sl_pf_eff


def calc_th_server_dec(NcountTP, th_dec_per_session, bs_real, Tdec):
    """
    Appendix Ж.2 (Приложение Ж.2) — server throughput in the decode pool (req/sec).

    Th_dec^server = NcountTP × BS_real × Th_dec_per_session / T_dec

    In a PD-disaggregated topology the decode pool serves BS_real
    concurrent decode sessions per instance; each session yields
    Th_dec_per_session tokens/sec, and a request needs T_dec tokens.
    Hence C_model_dec = BS_real × Th_dec_per_session / T_dec (req/sec per
    instance), and Th_dec^server = NcountTP × C_model_dec.
    """
    if Tdec <= 0 or th_dec_per_session <= 0 or bs_real <= 0 or NcountTP <= 0:
        return 0.0
    return NcountTP * bs_real * th_dec_per_session / Tdec


# ═══════════════════════════════════════════════════════════
# Section И: VLM / OCR pipeline (P9a — VLM single-pass online)
# ═══════════════════════════════════════════════════════════


def calc_v_tok(w_px, h_px, patch_eff, n_ch=1):
    """
    Appendix И.3.1 (Приложение И.3.1) — visual token count after the vision encoder.

    V_tok = ⌈(W_px · H_px) / patch_eff²⌉ · n_ch

    The vision encoder splits the image into patches (after spatial-merge for
    Qwen2.5-VL / InternVL-2.5 the effective patch size patch_eff ≈ 28). Each
    patch → one embedding → one visual token in the LLM decoder.
    The n_ch multiplier handles grayscale models (1) or multi-stream RGB
    (rarely > 1).
    """
    if w_px <= 0 or h_px <= 0 or patch_eff <= 0 or n_ch <= 0:
        return 0
    return math.ceil((w_px * h_px) / (patch_eff * patch_eff)) * n_ch


def calc_sl_pf_vlm(v_tok, n_prompt_txt):
    """
    Appendix И.3.1 (Приложение И.3.1) — VLM prefill length (visual + text tokens).

    SL_pf^VLM = V_tok + N_prompt^txt

    All visual tokens hit prefill together with the text instruction
    (system prompt + task description). The decode side generates only
    the output JSON (see ``calc_sl_dec_vlm``).
    """
    if v_tok < 0 or n_prompt_txt < 0:
        return 0
    return v_tok + n_prompt_txt


def calc_sl_dec_vlm(n_fields, tok_field):
    """
    Appendix И.3.1 (Приложение И.3.1) — output tokens per page (decode).

    SL_dec^VLM = N_fields · tok_field

    N_fields — number of fields extracted into the JSON response.
    tok_field — average tokens per field (typically 30-100).
    """
    if n_fields <= 0 or tok_field <= 0:
        return 0
    return n_fields * tok_field


def calc_t_page_vlm(sl_pf_vlm_eff, th_pf_vlm, sl_dec_vlm, th_dec_vlm, t_ovh_vlm=0.0):
    """
    Appendix И.4.1 (Приложение И.4.1) — VLM single-pass per-page latency (sec).

    t_page^VLM(BS_real) = SL_pf^VLM,eff / Th_pf^VLM(BS_real)
                       + SL_dec^VLM / Th_dec^VLM(BS_real)
                       + T_ovh^VLM

    Where SL_pf^VLM,eff = SL_pf^VLM · (1 − η_cache^VLM); for VLM
    η_cache ≈ 0 (visual tokens are unique per page, prefix cache is not
    applicable). T_ovh — per-page overhead (preprocessing, postprocessing).

    Throughput Th_pf^VLM and Th_dec^VLM depend on BS_real (number of
    concurrent pages per instance) — resolved by the caller
    (vlm_sizing_service). Returns inf if any throughput value is zero.
    """
    if th_pf_vlm <= 0 or th_dec_vlm <= 0:
        return float("inf")
    return sl_pf_vlm_eff / th_pf_vlm + sl_dec_vlm / th_dec_vlm + t_ovh_vlm


# ── P9b: OCR + LLM two-pass online (Приложение И.3.2-И.3.4, И.4.2) ──


def calc_t_ocr_gpu(r_ocr_gpu):
    """
    Appendix И.3.2 (Приложение И.3.2) — OCR per-page time on a single GPU (sec).

    t_OCR^GPU = 1 / R_OCR^GPU(engine, dpi)

    R_OCR^GPU is calibrated (see И.7.2): pages/sec on one GPU at a given
    OCR engine (PaddleOCR-GPU, EasyOCR, Tesseract-GPU) and document DPI.
    DPI dependency is roughly quadratic: 300 → 600 DPI → ×4 time.
    """
    if r_ocr_gpu <= 0:
        return float("inf")
    return 1.0 / r_ocr_gpu


def calc_t_ocr_cpu(r_ocr_core, n_cores):
    """
    Appendix И.3.3 (Приложение И.3.3) — OCR time on CPU (sec).

    t_OCR^CPU = 1 / (R_OCR^core · n_cores)

    Tesseract-class engines. CPU-OCR is not part of GPU sizing
    (N_GPU^OCR=0): the CPU pool is sized separately, and only the LLM
    stage carries over to the GPU pool with a reduced latency budget.
    """
    if r_ocr_core <= 0 or n_cores <= 0:
        return float("inf")
    return 1.0 / (r_ocr_core * n_cores)


def calc_l_text(chars_page, c_token):
    """
    Appendix И.3.4 (Приложение И.3.4) — recognized text length in tokens.

    L_text = chars_page / c_token

    c_token — characters per token:
      3.5 — mixed Russian/English text
      4.0 — pure English
      2.8 — Cyrillic
    """
    if chars_page <= 0 or c_token <= 0:
        return 0.0
    return chars_page / c_token


def calc_sl_pf_llm_after_ocr(l_text, n_prompt_sys):
    """
    Appendix И.3.4 (Приложение И.3.4) — LLM-stage prefill length after OCR.

    SL_pf^LLM = L_text + N_prompt^sys

    L_text — tokens of recognized text (see ``calc_l_text``).
    N_prompt^sys — system prompt for field extraction.
    """
    if l_text < 0 or n_prompt_sys < 0:
        return 0.0
    return l_text + n_prompt_sys


def calc_n_gpu_ocr_online(c_peak, t_ocr_gpu, eta_ocr):
    """
    Appendix И.4.2 (Приложение И.4.2) — GPUs in the OCR pool for online load.

    N_GPU^OCR,online = ⌈C_peak · t_OCR^GPU / η_OCR⌉

    Each GPU processes 1/t_OCR pages/s; for a peak load of C_peak
    concurrent pages we need C_peak · t_OCR / η_OCR GPUs. η_OCR (0.7-0.85,
    И.4.2) accounts for pool idle time on batching and data loading.
    """
    if t_ocr_gpu == float("inf") or t_ocr_gpu <= 0 or eta_ocr <= 0:
        return math.inf
    return math.ceil(c_peak * t_ocr_gpu / eta_ocr)


def calc_t_llm_target(sla_page, t_ocr, t_handoff=0.0):
    """
    Appendix И.4.2 (Приложение И.4.2) — SLA budget for the LLM stage after OCR (sec).

    t_LLM^target = SLA_page − t_OCR − T_handoff

    T_handoff — overhead for handing OCR output to the LLM (network,
    serialization); typically 0 for in-process pipelines.

    May return ≤ 0 if OCR + handoff exceeds the SLA — caller must detect
    the infeasible scenario.
    """
    return sla_page - t_ocr - t_handoff


# ── P9c: Batch-mode sizing (Приложение И.5) ──


def calc_n_gpu_batch(d_pages, t_page_at_bs_max, w_seconds, eta_batch):
    """
    Appendix И.5 (Приложение И.5) — GPUs in the batch pool for window processing.

    N_GPU^stage,batch = ⌈ D · t_page^stage / (W · η_batch) ⌉

    Where:
      D — pages to process per window (pages/window)
      t_page^stage — per-page time at BS = BS_max (steady-state, no SLA)
      W — window length (seconds, typically 28800 for an 8-hour night window)
      η_batch — utilization in batch mode (0.85-0.95)

    Returns math.inf on invalid inputs (caller must detect).
    """
    if w_seconds <= 0 or eta_batch <= 0:
        return math.inf
    if t_page_at_bs_max == float("inf") or t_page_at_bs_max <= 0:
        return math.inf
    if d_pages <= 0:
        return 0
    return math.ceil(d_pages * t_page_at_bs_max / (w_seconds * eta_batch))


def calc_window_sufficient(w_seconds, d_pages, t_page_at_bs_max, n_gpu_online, eta_batch):
    """
    Appendix И.1 (Приложение И.1) — sufficiency of window W for batch load on the online pool.

    W ≥ D · t_page^stage / (N_GPU^stage,online · η_batch)

    If satisfied — batch load fits on the online pool without additional
    GPUs. Otherwise a separate batch pool or window/D adjustments are
    needed.
    """
    if n_gpu_online <= 0 or eta_batch <= 0 or w_seconds <= 0:
        return False
    if t_page_at_bs_max == float("inf") or t_page_at_bs_max <= 0:
        return False
    required_w = d_pages * t_page_at_bs_max / (n_gpu_online * eta_batch)
    return w_seconds >= required_w


# ── P9d: Multi-class workload aggregation (Приложение И.4.2 ext) ──


def calc_factor_class(sl_pf, sl_dec, eta_cache=0.0, k_spec=1.0):
    """
    Appendix И.4.2 multi-class — effective per-page "cost" for a class.

    factor[c] = SL_pf^c · (1 − η_cache^c) + SL_dec^c / k_spec^c

    Tokens/page for class c, accounting for:
      - prefix-cache hit rate (η_cache: SL_pf is effectively reduced)
      - speculative decoding (k_spec: SL_dec is effectively reduced)

    Used in `Demand_pool = Σ_c λ^c · factor[c]` to aggregate load from
    several document classes onto a single GPU pool.
    """
    if sl_pf < 0 or sl_dec < 0:
        return 0.0
    eta = max(0.0, min(1.0, eta_cache))
    spec = max(1.0, k_spec)
    return sl_pf * (1.0 - eta) + sl_dec / spec


def calc_demand_pool(class_factors_with_lambda):
    """
    Appendix И.4.2 multi-class — aggregated pool demand, tokens/sec.

    Demand_pool = Σ_{c ∈ classes} λ_online^c · factor[c]

    Accepts a list of tuples [(λ_c, factor_c), ...]. Returns the total
    token throughput per second — the basis for sizing a single pool
    serving mixed load from several document classes.
    """
    if not class_factors_with_lambda:
        return 0.0
    total = 0.0
    for lam, factor in class_factors_with_lambda:
        if lam <= 0 or factor <= 0:
            continue
        total += lam * factor
    return total


def calc_n_gpu_multiclass(demand_pool_tps, th_pool_eff_tps_per_gpu, k_sla=1.25):
    """
    Appendix И.4.2 multi-class — pool size for mixed load.

    N_GPU^pool = ⌈ Demand_pool · K_SLA / Th_pool^eff ⌉

    Demand_pool — tokens/sec for the pool (see ``calc_demand_pool``).
    Th_pool^eff — effective pool throughput, tokens/sec/GPU (resolved by
    the caller from per-instance results of one class).
    K_SLA — SLA safety factor (default 1.25).

    Returns math.inf on invalid inputs.
    """
    if th_pool_eff_tps_per_gpu <= 0:
        return math.inf
    if demand_pool_tps <= 0:
        return 0
    return math.ceil(demand_pool_tps * k_sla / th_pool_eff_tps_per_gpu)
