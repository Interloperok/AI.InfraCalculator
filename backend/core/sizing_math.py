from __future__ import annotations

import math

# Модуль расчета мощностей для развертывания LLM (Методика v2)
#
# Методика расчета основана на документе:
# «Методика расчета количества серверов и GPU для LLM-inference решений»
#
# Расчет выполняется по двум независимым ограничениям:
# 1. По памяти GPU (веса модели и KV-кэш) — разделы 3-5
# 2. По вычислительной пропускной способности (tokens/sec, requests/sec) — раздел 6
# Итоговое количество серверов = max(серверы_по_памяти, серверы_по_compute)


# ═══════════════════════════════════════════════════════════
# Section 2: Определение нагрузки
# ═══════════════════════════════════════════════════════════


def calc_Ssim(iu, pin, cin, eu, pex, cex, J):
    """
    Раздел 2.1 — Пиковое кол-во одновременных сессий

    Ssim = Nusers × Kpen × Ksim × J  (для каждого сегмента, затем сумма)

    Параметры:
    - iu, pin, cin: внутренние пользователи, проникновение, одновременность
    - eu, pex, cex: внешние пользователи, проникновение, одновременность
    - J: количество одновременных сессий на пользователя
    """
    return iu * pin * cin * J + eu * pex * cex * J


def calc_T(SP, Prp, MRT, A):
    """
    Раздел 2.2 — Средняя общая длина запроса и ответа в токенах

    T = SP + Prp + MRT + A
    """
    return SP + Prp + MRT + A


# ═══════════════════════════════════════════════════════════
# Section 3: Память GPU
# ═══════════════════════════════════════════════════════════


def calc_model_mem_gb(params_b, bytes_per_param, emp_model, safe_margin):
    """
    Раздел 3.1 — Память, требуемая для весов модели (GiB)

    Mmodel = (P × 10⁹ × Bquant / 1024³) × EMPmodel + SM
    """
    return (params_b * 1e9 * bytes_per_param / (1024**3)) * emp_model + safe_margin


def calc_session_context_TS(SP, Prp, MRT, A, dialog_turns):
    """
    Раздел 3.2 — Прикидочная длина контекста в сессии (для KV-кэша)

    TS_prp5_s1 = SP + dialog_turns × (Prp + MRT + A)

    Предполагается диалог длиной в dialog_turns сообщений (по умолчанию 5).
    """
    return SP + dialog_turns * (Prp + MRT + A)


def calc_sl_pf(SP, Prp, MRT, dialog_turns):
    """
    Раздел 7.1 — Длина входной последовательности на этапе prefill

    SL_pf = SP + N_prp × Prp + (N_prp − 1) × MRT

    В отличие от SL (полная длина сессии — для KV-кэша), SL_pf считает
    только те токены, которые попадают на prefill: системный промпт,
    все запросы пользователя в сессии (N_prp штук) и reasoning-токены
    предыдущих ходов (N_prp − 1, без последнего, который ещё не сгенерён).
    Используется в TTFT и Th_pf.
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
    Приложение В.4 — TS для агентных архитектур (multi-call workloads)

    TS_agent = SP_eff + N_prp × K_calls × (Prp_eff + MRT + A_eff)

    Где (В.1-В.3):
      SP_eff = SP + SP_tools + C_rag_static
      Prp_eff = Prp + C_rag_dynamic
      A_eff = A + A_tool

    При K_calls = 1 и нулевых надбавках (SP_tools = C_rag_* = A_tool = 0)
    формула эквивалентна (2.2) из ``calc_session_context_TS`` —
    обратная совместимость.

    Используется в KV-кэш формуле (вместо TS) для агентных сценариев:
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
    Приложение В.4 (производное) — SL_pf для агентных архитектур

    SL_pf_agent = SP_eff + (N_prp × K_calls) × Prp_eff + (N_prp × K_calls − 1) × MRT

    Input-only длина для пиковой агентной сессии. При K_calls = 1 и
    нулевых надбавках эквивалентно ``calc_sl_pf``. Не включает A / A_tool —
    последовательно матчит соглашение из ``calc_sl_pf`` (предыдущие
    ответы не учитываются как prefill).
    """
    SP_eff = SP + SP_tools + C_rag_static
    Prp_eff = Prp + C_rag_dynamic
    total_calls = n_prp * k_calls
    return SP_eff + total_calls * Prp_eff + max(0, total_calls - 1) * MRT


def calc_SL(TS, TSmax):
    """
    Раздел 3.2 — Длина последовательности контекстного окна

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
    Раздел 3.2 — KV-кэш на 1 сессию для MHA/GQA/MQA (GiB).

    Универсальная форма (предпочтительна, методология §3.2):
        M_KV = 2 · L · N_kv · head_dim · SL · B_state · EMP_kv / 1024³

    Применяется к MHA/GQA/MQA при ЛЮБОМ соотношении H, N_attention, head_dim.
    Корректна для нестандартных моделей (например, MoE Qwen3-30B-A3B, где
    N_attention · head_dim ≠ H). Активируется при head_dim > 0.

    Резервная форма (через H · N_kv/N_attention):
        M_KV = 2 · L · H · SL · B_state · EMP_kv · (N_kv/N_attention) / 1024³

    Используется когда head_dim не задан. Эквивалентна универсальной форме
    только при H = N_attention · head_dim (стандартные dense-трансформеры).
    """
    if head_dim is not None and head_dim > 0 and num_kv_heads > 0:
        # Universal form via head_dim — methodology-preferred.
        return (2 * L * num_kv_heads * head_dim * SL * bytes_state * emp_kv) / (1024**3)

    # Fallback: H-based form (assumes H = N_attention · head_dim).
    kv_ratio = num_kv_heads / num_attention_heads if num_attention_heads > 0 else 1.0
    return (2 * L * H * SL * bytes_state * emp_kv * kv_ratio) / (1024**3)


def calc_kv_mla(L, SL, kv_lora_rank, qk_rope_head_dim, bytes_state, emp_kv):
    """
    Раздел 3.2 (MLA-ветвь) — KV-кэш для Multi-Head Latent Attention (GiB)

    MKV_MLA_s1 = L × SL × (kv_lora_rank + qk_rope_head_dim) × Bstate × EMPkv / 1024³

    Multi-Head Latent Attention (MLA, DeepSeek V2/V3/R1) сжимает K и V в
    общее латентное представление + небольшая RoPE-часть, и хранит один
    вектор на токен на слой (не два). Отсюда отсутствие множителя 2.

    Параметры архитектуры:
      DeepSeek-V3 / R1:  kv_lora_rank=512, qk_rope_head_dim=64
      DeepSeek-V2:       kv_lora_rank=512, qk_rope_head_dim=64

    Возвращает 0.0 если оба параметра <= 0 (недоступно — fallback на
    стандартную формулу должен делать вызывающий).
    """
    if kv_lora_rank <= 0 and qk_rope_head_dim <= 0:
        return 0.0
    return L * SL * (kv_lora_rank + qk_rope_head_dim) * bytes_state * emp_kv / (1024**3)


# ═══════════════════════════════════════════════════════════
# Section 4: GPU и Tensor Parallelism
# ═══════════════════════════════════════════════════════════


def calc_gpus_per_instance(model_mem_gb, gpu_mem_gb, kavail):
    """
    Раздел 4.1 — Мин. кол-во GPU на 1 экземпляр модели

    GPUcount_model = ⌈ Mmodel / (GPUmemory × Kavail) ⌉
    """
    return max(1, math.ceil(model_mem_gb / (gpu_mem_gb * kavail)))


def calc_instances_per_server(gpus_per_server, gpus_per_instance):
    """
    Раздел 4.2 — Кол-во экземпляров модели на 1 сервер (без TP-множителя)

    Ncount_model = ⌊ GPUcount_server / GPUcount_model ⌋
    """
    return max(0, gpus_per_server // gpus_per_instance)


def calc_kv_free_per_instance_gb(gpus_per_instance, gpu_mem_gb, kavail, model_mem_gb):
    """
    Раздел 4.3 — Свободная GPU-память под KV-кэш на 1 экземпляр модели (GiB)

    GPUmemoryForKV_model = GPUcount_model × GPUmemory × Kavail − Mmodel
    """
    return max(0.0, gpus_per_instance * gpu_mem_gb * kavail - model_mem_gb)


def calc_S_TP(kv_free_gb, kv_per_session_gb):
    """
    Раздел 4.4 — Макс. теоретическое кол-во параллельных сессий при данном TP

    S_TP=n = ⌊ GPUmemoryForKV_model / MKV_s1 ⌋
    """
    if kv_per_session_gb <= 0:
        return 0
    return int(kv_free_gb // kv_per_session_gb)


def calc_Kbatch(S_TP_z, S_TP_base, C):
    """
    Раздел 4.4 — Коэф. повышения пропускной способности за счёт TP и Batch Size

    Kbatch = (S_TP_z / S_TP_base) × ((S_TP_base + C) / (S_TP_z + C))

    При Z=1 → S_TP_z == S_TP_base → Kbatch = 1.0
    """
    if S_TP_base <= 0 or S_TP_z <= 0:
        return 1.0
    return (S_TP_z / S_TP_base) * ((S_TP_base + C) / (S_TP_z + C))


# ═══════════════════════════════════════════════════════════
# Section 5: Серверы по памяти
# ═══════════════════════════════════════════════════════════


def calc_instances_per_server_tp(gpus_per_server, gpus_per_instance, Z):
    """
    Раздел 5.1 — Кол-во экземпляров модели на 1 сервер с учётом TP

    NcountTP_model = ⌊ GPUcount_server / (Z × GPUcount_model) ⌋
    """
    total_gpus_per_instance_tp = Z * gpus_per_instance
    if total_gpus_per_instance_tp <= 0:
        return 0
    return gpus_per_server // total_gpus_per_instance_tp


def calc_sessions_per_server(NcountTP, S_TP_z):
    """
    Раздел 5.1 — Кол-во сессий, одновременно поддерживаемых сервером

    Sserver = NcountTP_model × S_TP_z
    """
    return NcountTP * S_TP_z


def calc_servers_by_memory(Ssim, Sserver):
    """
    Раздел 5.2 — Число серверов по памяти

    Servers_mem = ⌈ Ssim / Sserver ⌉
    """
    if Sserver <= 0:
        return math.inf
    return math.ceil(Ssim / Sserver)


# ═══════════════════════════════════════════════════════════
# Section 6: Серверы по вычислительной пропускной способности
# ═══════════════════════════════════════════════════════════


def calc_FPS(params_billions):
    """
    Раздел 6.1 — Число FLOP на 1 токен (базовая оценка)

    FPS = 2 × P × 10⁹

    Принимает либо P_total (для dense), либо P_active (для MoE — только
    активные параметры участвуют в forward pass на токен).
    """
    return 2 * params_billions * 1e9


def calc_p_effective(p_dense, p_moe, n_experts, k_experts, bs_real=1):
    """
    Раздел 6.1 — Эффективное число параметров, читаемых из HBM за decode-шаг.

    P_effective(BS_real) = P_dense + P_moe × [1 − (1 − k/N_experts)^BS_real]

    Для dense-моделей (P_moe = 0) формула вырождается в P_dense.
    Для MoE при BS = 1 покрывается ≈ k/N_experts экспертов; при больших
    BS статистическое покрытие приближается к полному (P_dense + P_moe).

    Используется в memory-bandwidth-bound decode-формуле (§6.1 H-7) —
    отражает фактический объём весов, читаемых из памяти за один forward
    pass batch-обработки.
    """
    if p_moe <= 0 or n_experts <= 0 or k_experts <= 0:
        return p_dense
    coverage = 1.0 - (1.0 - k_experts / n_experts) ** bs_real
    return p_dense + p_moe * coverage


def calc_Tdec(A, MRT):
    """
    Раздел 6.1 — Число токенов, генерируемых в фазе decode на 1 запрос

    Tdec = A + MRT
    """
    return A + MRT


def calc_th_prefill_analyt(Fcount_model_flops, eta_pf, Kbatch, FPS, L, H, SL):
    """
    Раздел 6.1 — Аналитический throughput фазы prefill для static batching (tokens/sec)

    Th_pf_analyt ≈ (Fcount_model × η_pf × Kbatch) / (FPS + 4 × L × H × SL)

    Применяется для движков со статическим батчингом (offline-скрипты,
    Triton без inflight, исследовательские harness): все запросы batch
    стартуют одновременно, prefill параллелится по batch — отсюда
    усиление K_batch.

    Для continuous batching (vLLM, SGLang, TGI, Triton+inflight) —
    использовать ``calc_th_prefill_cb_compute`` (без K_batch) и
    ``calc_th_prefill_cb_mem``, выбирая ``min(compute, mem)``.
    """
    denominator = FPS + 4 * L * H * SL
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_pf * Kbatch) / denominator


def calc_th_prefill_cb_compute(Fcount_model_flops, eta_pf, FPS, L, H, sl_pf_eff):
    """
    Раздел 6.1 — Compute-bound предел prefill в continuous batching (tokens/sec)

    Th_pf^cb,compute(SL_pf) = F_count × η_pf / (FPS + 4 × L × H × SL_pf)

    Совпадает по форме с ``calc_th_prefill_analyt`` при K_batch = 1 — в
    continuous batching все prefill-токены идут одной порцией без
    усиления статическим батчем.
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
    Раздел 6.1 — Memory-bandwidth-bound предел prefill в continuous batching (tokens/sec)

    Th_pf^cb,mem = (C_pf × BW_GPU × 10⁹ × η_mem)
                 / (P_eff(BS_real + 1) × 10⁹ × B_quant
                    + BS_real × M_KV × 1024³
                    + O_fixed × 1024³)

    C_pf — chunked-prefill step budget (vLLM max_num_batched_tokens минус
    decode-доля). Типично 32-512 токенов. Доминирует при BS_real ≥ 4 для
    MoE и типичных C_pf.

    Возвращает 0.0 если bw_gpu_gbs <= 0 или c_pf <= 0.
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
    Раздел 6.1 — выбор итоговой пропускной способности prefill в continuous batching.

    Th_pf^cb = min(Th_pf^cb,compute, Th_pf^cb,mem)

    Возвращает (value, mode), где mode ∈ {"compute", "memory", "compute_only",
    "memory_only", "none"} — аналогично ``select_th_decode``.
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
    Раздел 6.1 — Аналитический compute-bound throughput фазы decode (tokens/sec)

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
    Раздел 6.1 (H-7) — Memory-bandwidth-bound throughput фазы decode (tokens/sec).

    Th_dec_mem(BS_real) = (BW_GPU × 10⁹ × η_mem)
                        / (P_eff(BS_real) × 10⁹ × B_quant
                           + BS_real × M_KV × 1024³
                           + O_fixed × 1024³)

    Для P1: P_eff = params_billions (treated as P_active until P3 adds MoE
    accounting); BS_real = 1 (until P4 adds iterative coupling).

    Возвращает 0.0 если bw_gpu_gbs не задан — в таком случае mem-branch
    не вычисляется и th_dec остаётся compute-bound.
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
    Раздел 6.1 — выбор итоговой пропускной способности decode.

    Th_dec = min(Th_dec^compute, Th_dec^mem) когда оба определены;
    иначе единственное доступное значение.

    Возвращает (value, mode), где mode ∈ {"compute", "memory", "compute_only",
    "memory_only", "none"}:
      - "compute"      — оба ветви посчитаны, compute < mem (compute-bound)
      - "memory"       — оба ветви посчитаны, mem < compute (memory-bound)
      - "compute_only" — bw_gpu не задан, считаем только compute
      - "memory_only"  — compute = 0 (вырожденный случай)
      - "none"         — оба = 0 (ошибка/невалидный ввод)
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
    Раздел 6.2 — Среднее число запросов/сек на 1 экземпляр модели (v3)

    C_model(BS_real) = BS_real / (SL_pf^eff / Th_pf + T_dec / Th_dec_per_session)

    При BS_real = 1 эквивалентно прежней формуле v2 (1 / time_per_request).
    Th_dec_per_session — пропускная способность decode на одну сессию при
    данном BS_real (после деления compute-ветви на BS_real и применения
    K_spec). См. iter §6.4.
    """
    if th_pf <= 0 or th_dec_per_session <= 0 or bs_real <= 0:
        return 0.0
    time_per_request = sl_pf_eff / th_pf + Tdec / th_dec_per_session
    if time_per_request <= 0:
        return 0.0
    return bs_real / time_per_request


def calc_bs_real(ssim, ncount_per_server, servers, bs_max=None):
    """
    Раздел 6.2 / 6.4 — Реальный размер батча на экземпляр модели.

    BS_real = min(BS_max, ⌈Ssim / (Ncount·Servers)⌉)

    BS_max — потолок по памяти (S_TP_z). Если не задан, потолок не
    применяется. Минимум всегда 1 (вырожденный случай — 0 запросов).
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
    Раздел 6.3 — Итоговая пропускная способность одного сервера (req/sec)

    Th_server_comp = Ncount_model × Cmodel
    """
    return Ncount_model * Cmodel


def calc_ttft(sl_pf_eff, th_pf, th_dec, t_overhead=0.0):
    """
    Раздел 7.1 — Time To First Token (TTFT)

    TTFT_analyt = SL_pf^eff / Th_pf + 1 / Th_dec + T_overhead

    Где SL_pf^eff = SL_pf · (1 − η_cache) — эффективная длина prefill
    после префикс-кэширования. Резолвится вызывающим (sizing_service).
    T_overhead — постоянный per-request overhead (tokenization, proxy,
    admission), §7.1 / §Е.5.

    Изм. P2: заменяет SL на SL_pf и добавляет T_overhead. Поведение при
    sl_pf_eff = SL и t_overhead = 0 эквивалентно прежней формуле — миграция
    обратно совместима для каллеров, передающих позиционные аргументы.
    """
    if th_pf <= 0 or th_dec <= 0:
        return float("inf")
    return sl_pf_eff / th_pf + 1.0 / th_dec + t_overhead


def calc_generation_time(T_out, th_dec):
    """
    Раздел 7.2 — Время генерации всех токенов

    GenerationTime_analyt = T_out / Th_dec
    """
    if th_dec <= 0:
        return float("inf")
    return T_out / th_dec


def calc_e2e_latency(ttft, generation_time):
    """
    Раздел 7.2 — End-to-end Latency (per-request, BS-aware via th_dec_per_session)

    e2eLatency_analyt = TTFT_analyt + GenerationTime_analyt
    """
    return ttft + generation_time


def calc_e2e_latency_load(bs_real, cmodel_rps):
    """
    Раздел 7.2 — End-to-end Latency under sustained load (Little's law)

    e2eLatency_load(BS_real) = BS_real / C_model(BS_real)

    Среднее время пребывания запроса в системе при установившейся
    загрузке. Растёт с BS (очередь ожидания), тогда как
    e2eLatency_analyt растёт сублинейно через per-session th_dec.

    Для SLA-валидации используется max(analyt, load) — чтобы поймать
    «load-induced» нарушения, незаметные в формуле для одиночного запроса.
    """
    if cmodel_rps <= 0:
        return float("inf")
    return bs_real / cmodel_rps


def calc_servers_by_compute(Ssim, R, KSLA, th_server_comp):
    """
    Раздел 6.4 — Число серверов по пропускной способности

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
    Приложение Ж.2 — Throughput сервера в prefill-пуле (req/sec).

    Th_pf^server = NcountTP × Th_pf / SL_pf^eff

    В PD-дизагрегированной топологии prefill-пул выполняет только prefill-фазу
    (TTFT-bounded), и время на запрос на инстанс = SL_pf^eff / Th_pf. Отсюда
    C_model_pf = Th_pf / SL_pf^eff (req/sec на инстанс), а сервер с NcountTP
    инстансами выдаёт NcountTP × C_model_pf req/sec.
    """
    if sl_pf_eff <= 0 or th_pf <= 0 or NcountTP <= 0:
        return 0.0
    return NcountTP * th_pf / sl_pf_eff


def calc_th_server_dec(NcountTP, th_dec_per_session, bs_real, Tdec):
    """
    Приложение Ж.2 — Throughput сервера в decode-пуле (req/sec).

    Th_dec^server = NcountTP × BS_real × Th_dec_per_session / T_dec

    В PD-дизагрегированной топологии decode-пул обслуживает BS_real
    одновременных decode-сессий на инстанс; каждая сессия даёт
    Th_dec_per_session токенов/сек, на запрос нужно T_dec токенов. Отсюда
    C_model_dec = BS_real × Th_dec_per_session / T_dec (req/sec на инстанс),
    Th_dec^server = NcountTP × C_model_dec.
    """
    if Tdec <= 0 or th_dec_per_session <= 0 or bs_real <= 0 or NcountTP <= 0:
        return 0.0
    return NcountTP * bs_real * th_dec_per_session / Tdec


# ═══════════════════════════════════════════════════════════
# Section И: VLM / OCR pipeline (P9a — VLM single-pass online)
# ═══════════════════════════════════════════════════════════


def calc_v_tok(w_px, h_px, patch_eff, n_ch=1):
    """
    Приложение И.3.1 — Число визуальных токенов после vision-энкодера.

    V_tok = ⌈(W_px · H_px) / patch_eff²⌉ · n_ch

    Vision-энкодер делит изображение на патчи (после spatial-merge для
    Qwen2.5-VL / InternVL-2.5 эффективный размер patch_eff ≈ 28). Каждый
    патч → один эмбеддинг → один визуальный токен в LLM-декодере.
    Множитель n_ch для grayscale-моделей (1) или multi-stream RGB (редко >1).
    """
    if w_px <= 0 or h_px <= 0 or patch_eff <= 0 or n_ch <= 0:
        return 0
    return math.ceil((w_px * h_px) / (patch_eff * patch_eff)) * n_ch


def calc_sl_pf_vlm(v_tok, n_prompt_txt):
    """
    Приложение И.3.1 — Длина prefill для VLM (визуальные + текстовые токены).

    SL_pf^VLM = V_tok + N_prompt^txt

    Все визуальные токены попадают на prefill вместе с текстовой инструкцией
    (system prompt + task description). Decode-сторона генерирует только
    выходной JSON (см. ``calc_sl_dec_vlm``).
    """
    if v_tok < 0 or n_prompt_txt < 0:
        return 0
    return v_tok + n_prompt_txt


def calc_sl_dec_vlm(n_fields, tok_field):
    """
    Приложение И.3.1 — Число выходных токенов на страницу (decode).

    SL_dec^VLM = N_fields · tok_field

    N_fields — число извлекаемых полей в JSON-ответе.
    tok_field — среднее число токенов на одно поле (типично 30-100).
    """
    if n_fields <= 0 or tok_field <= 0:
        return 0
    return n_fields * tok_field


def calc_t_page_vlm(sl_pf_vlm_eff, th_pf_vlm, sl_dec_vlm, th_dec_vlm, t_ovh_vlm=0.0):
    """
    Приложение И.4.1 — Время обработки страницы VLM single-pass (сек).

    t_page^VLM(BS_real) = SL_pf^VLM,eff / Th_pf^VLM(BS_real)
                       + SL_dec^VLM / Th_dec^VLM(BS_real)
                       + T_ovh^VLM

    Где SL_pf^VLM,eff = SL_pf^VLM · (1 − η_cache^VLM); для VLM η_cache ≈ 0
    (визуальные токены уникальны для каждой страницы, prefix-cache не
    применим). T_ovh — per-page overhead (preprocessing, postprocessing).

    Throughput Th_pf^VLM и Th_dec^VLM зависят от BS_real (число одновременных
    страниц на инстанс) — резолвится вызывающим (vlm_sizing_service).
    Возвращает inf если throughput-значения нулевые.
    """
    if th_pf_vlm <= 0 or th_dec_vlm <= 0:
        return float("inf")
    return sl_pf_vlm_eff / th_pf_vlm + sl_dec_vlm / th_dec_vlm + t_ovh_vlm


# ── P9b: OCR + LLM two-pass online (Приложение И.3.2-И.3.4, И.4.2) ──


def calc_t_ocr_gpu(r_ocr_gpu):
    """
    Приложение И.3.2 — Время OCR-обработки страницы на 1 GPU (сек).

    t_OCR^GPU = 1 / R_OCR^GPU(engine, dpi)

    R_OCR^GPU калибруется (см. И.7.2): pages/sec на одной GPU при заданном
    OCR-движке (PaddleOCR-GPU, EasyOCR, Tesseract-GPU) и DPI документа.
    Зависимость от DPI приблизительно квадратичная: 300 → 600 DPI → ×4 время.
    """
    if r_ocr_gpu <= 0:
        return float("inf")
    return 1.0 / r_ocr_gpu


def calc_t_ocr_cpu(r_ocr_core, n_cores):
    """
    Приложение И.3.3 — Время OCR на CPU (сек).

    t_OCR^CPU = 1 / (R_OCR^core · n_cores)

    Tesseract-class движки. CPU-OCR не входит в GPU-сайзинг (N_GPU^OCR=0):
    размер CPU-парка определяется отдельно, на GPU переходит только
    LLM-стадия с уменьшенным latency-бюджетом.
    """
    if r_ocr_core <= 0 or n_cores <= 0:
        return float("inf")
    return 1.0 / (r_ocr_core * n_cores)


def calc_l_text(chars_page, c_token):
    """
    Приложение И.3.4 — Длина распознанного текста в токенах.

    L_text = chars_page / c_token

    c_token — символов на токен:
      3.5 — смешанный русско-английский текст
      4.0 — чистый английский
      2.8 — кириллица
    """
    if chars_page <= 0 or c_token <= 0:
        return 0.0
    return chars_page / c_token


def calc_sl_pf_llm_after_ocr(l_text, n_prompt_sys):
    """
    Приложение И.3.4 — Длина prefill для LLM-стадии после OCR.

    SL_pf^LLM = L_text + N_prompt^sys

    L_text — токены распознанного текста (см. ``calc_l_text``).
    N_prompt^sys — системный промпт для извлечения полей.
    """
    if l_text < 0 or n_prompt_sys < 0:
        return 0.0
    return l_text + n_prompt_sys


def calc_n_gpu_ocr_online(c_peak, t_ocr_gpu, eta_ocr):
    """
    Приложение И.4.2 — GPU в OCR-пуле для online-нагрузки.

    N_GPU^OCR,online = ⌈C_peak · t_OCR^GPU / η_OCR⌉

    Каждая GPU обрабатывает 1/t_OCR pages/s; для пиковой нагрузки C_peak
    одновременных страниц нужно C_peak · t_OCR / η_OCR GPU. η_OCR (0.7-0.85,
    И.4.2) учитывает простой пула на batching и data-loading.
    """
    if t_ocr_gpu == float("inf") or t_ocr_gpu <= 0 or eta_ocr <= 0:
        return math.inf
    return math.ceil(c_peak * t_ocr_gpu / eta_ocr)


def calc_t_llm_target(sla_page, t_ocr, t_handoff=0.0):
    """
    Приложение И.4.2 — SLA-бюджет на LLM-стадию после OCR (сек).

    t_LLM^target = SLA_page − t_OCR − T_handoff

    T_handoff — overhead на передачу OCR-вывода в LLM (network, serialization);
    типично 0 для in-process pipelines.

    Возвращает значение, которое может быть ≤ 0, если OCR + handoff превышают
    SLA — вызывающий должен распознать невыполнимый сценарий.
    """
    return sla_page - t_ocr - t_handoff


# ── P9c: Batch-mode sizing (Приложение И.5) ──


def calc_n_gpu_batch(d_pages, t_page_at_bs_max, w_seconds, eta_batch):
    """
    Приложение И.5 — GPU в batch-пуле для пакетной обработки.

    N_GPU^stage,batch = ⌈ D · t_page^stage / (W · η_batch) ⌉

    Где:
      D — объём обработки за окно (pages/window)
      t_page^stage — время страницы при BS = BS_max (steady-state, без SLA)
      W — длительность окна (сек, типично 28800 для 8-часового ночного окна)
      η_batch — утилизация в batch-режиме (0.85-0.95)

    Возвращает math.inf при невалидных входах (вызывающий должен распознать).
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
    Приложение И.1 — Достаточность окна W для batch-нагрузки на online-парке.

    W ≥ D · t_page^stage / (N_GPU^stage,online · η_batch)

    Если выполнено — batch-нагрузка размещается на онлайн-парке без
    дополнительных GPU. Иначе нужен раздельный batch-парк или расширение
    окна / снижение D.
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
    Приложение И.4.2 (multi-class) — Эффективная "стоимость" одной страницы класса.

    factor[c] = SL_pf^c · (1 − η_cache^c) + SL_dec^c / k_spec^c

    Tokens/page для класса c, учитывая:
      - prefix-cache hit rate (η_cache: SL_pf эффективно сокращается)
      - speculative decoding (k_spec: SL_dec эффективно сокращается)

    Используется в `Demand_pool = Σ_c λ^c · factor[c]` для агрегирования
    нагрузки нескольких классов документов на единый GPU-пул.
    """
    if sl_pf < 0 or sl_dec < 0:
        return 0.0
    eta = max(0.0, min(1.0, eta_cache))
    spec = max(1.0, k_spec)
    return sl_pf * (1.0 - eta) + sl_dec / spec


def calc_demand_pool(class_factors_with_lambda):
    """
    Приложение И.4.2 (multi-class) — Аггрегированная нагрузка пула, токены/сек.

    Demand_pool = Σ_{c ∈ classes} λ_online^c · factor[c]

    Принимает список кортежей [(λ_c, factor_c), ...]. Возвращает
    суммарный токен-поток в секунду — основу для сайзинга единого пула,
    обслуживающего смешанную нагрузку из разных классов документов.
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
    Приложение И.4.2 (multi-class) — Размер пула под смешанную нагрузку.

    N_GPU^pool = ⌈ Demand_pool · K_SLA / Th_pool^eff ⌉

    Demand_pool — токенов/сек на пул (см. ``calc_demand_pool``).
    Th_pool^eff — эффективная пропускная способность пула, токенов/сек/GPU
    (резолвится вызывающим из per-instance результатов одного из классов).
    K_SLA — коэф. запаса для SLA (по умолчанию 1.25).

    Возвращает math.inf при невалидных входах.
    """
    if th_pool_eff_tps_per_gpu <= 0:
        return math.inf
    if demand_pool_tps <= 0:
        return 0
    return math.ceil(demand_pool_tps * k_sla / th_pool_eff_tps_per_gpu)
