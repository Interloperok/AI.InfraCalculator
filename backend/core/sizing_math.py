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


def calc_SL(TS, TSmax):
    """
    Раздел 3.2 — Длина последовательности контекстного окна

    SL = min(TS, TSmax)
    """
    return min(TS, TSmax)


def calc_kv_per_session_gb(L, H, SL, bytes_state, emp_kv, num_kv_heads=32, num_attention_heads=32):
    """
    Раздел 3.2 — KV-кэш на 1 сессию (GiB)

    MKV_s1 = 2 × L × H × SL × Bstate × EMPkv × (Nkv / Nattention) / 1024³
    """
    kv_ratio = num_kv_heads / num_attention_heads if num_attention_heads > 0 else 1.0
    return (2 * L * H * SL * bytes_state * emp_kv * kv_ratio) / (1024**3)


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
    Раздел 6.1 — Аналитический throughput фазы prefill (tokens/sec)

    Th_pf_analyt ≈ (Fcount_model × η_pf × Kbatch) / (FPS + 4 × L × H × SL)
    """
    denominator = FPS + 4 * L * H * SL
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_pf * Kbatch) / denominator


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
    Раздел 7.2 — End-to-end Latency

    e2eLatency_analyt = TTFT_analyt + GenerationTime_analyt
    """
    return ttft + generation_time


def calc_servers_by_compute(Ssim, R, KSLA, th_server_comp):
    """
    Раздел 6.4 — Число серверов по пропускной способности

    Servers_comp = ⌈ (Ssim × R × KSLA) / Th_server_comp ⌉
    """
    if th_server_comp <= 0:
        return math.inf
    return math.ceil((Ssim * R * KSLA) / th_server_comp)
