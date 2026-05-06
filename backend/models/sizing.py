from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Union

from core.methodology_constants import (
    C_SAT_DEFAULT,
    ETA_CACHE_DEFAULT,
    ETA_DEC_DEFAULT,
    ETA_MEM_DEFAULT,
    ETA_PF_DEFAULT,
    K_SPEC_DEFAULT,
    O_FIXED_DEFAULT,
    T_OVERHEAD_DEFAULT,
)
from pydantic import BaseModel, ConfigDict, Field, confloat, conint


class SizingInput(BaseModel):
    """Входные параметры для расчета серверов (Методика v2)

    Соответствует документу: «Методика расчета количества серверов и GPU для LLM-inference решений»
    """

    # ── Section 2.1: Users & behavior ──
    internal_users: conint(ge=0) = Field(
        ..., description="Количество внутренних пользователей (Nusers)"
    )
    penetration_internal: confloat(ge=0.0, le=1.0) = Field(
        ..., description="Коэф. проникновения внутр. (Kpen)"
    )
    concurrency_internal: confloat(ge=0.0, le=1.0) = Field(
        ..., description="Коэф. одновременности внутр. (Ksim)"
    )
    external_users: conint(ge=0) = Field(default=0, description="Количество внешних пользователей")
    penetration_external: confloat(ge=0.0, le=1.0) = Field(
        default=0.0, description="Коэф. проникновения внешн."
    )
    concurrency_external: confloat(ge=0.0, le=1.0) = Field(
        default=0.0, description="Коэф. одновременности внешн."
    )
    sessions_per_user_J: confloat(gt=0) = Field(
        default=1, description="Кол-во одновременных сессий на пользователя (J)"
    )

    # ── Section 2.2: Tokens ──
    system_prompt_tokens_SP: confloat(ge=0) = Field(
        default=1000, description="Токены системного промпта (SP)"
    )
    user_prompt_tokens_Prp: confloat(ge=0) = Field(
        default=200, description="Токены запроса пользователя (Prp)"
    )
    reasoning_tokens_MRT: confloat(ge=0) = Field(
        default=4096,
        description="Бюджет токенов на рассуждения (MRT). Если модель не использует — 0",
    )
    answer_tokens_A: confloat(ge=0) = Field(default=400, description="Токены ответа модели (A)")
    dialog_turns: conint(gt=0) = Field(
        default=5, description="Кол-во сообщений в диалоге для оценки длины сессии"
    )

    # ── Section 2.2 (P8): Agentic / RAG / tool-use overhead (Appendix В) ──
    # All optional with neutral defaults so TS_agent reduces to TS for
    # single-call workloads.
    k_calls: Optional[conint(ge=1)] = Field(
        default=1,
        description="Число LLM-вызовов на пользовательский запрос (Appendix В.4). "
        "1: single-turn / RAG (без агентного цикла). "
        "3-10: ReAct, Self-Refine. "
        "6-20: мультиагентные системы (CrewAI, LangGraph). "
        "Влияет на TS_agent (KV-кэш) и эффективную rps_per_session_R = R · K_calls.",
    )
    sp_tools: Optional[confloat(ge=0)] = Field(
        default=0,
        description="Tool definitions tokens (SP_tools, Appendix В.1). "
        "Размер описаний инструментов в системном промпте. "
        "ReAct с 10 инструментами: ~5000.",
    )
    c_rag_static: Optional[confloat(ge=0)] = Field(
        default=0,
        description="Статический RAG-контекст (C_rag_static, Appendix В.1). "
        "Загружается один раз при инициализации сессии.",
    )
    c_rag_dynamic: Optional[confloat(ge=0)] = Field(
        default=0,
        description="Динамический RAG-контекст (C_rag_dynamic, Appendix В.2). "
        "Подгружается под конкретный запрос. Типично 500-5000.",
    )
    a_tool: Optional[confloat(ge=0)] = Field(
        default=0,
        description="Дополнительные токены ответа для tool_call JSON (A_tool, Appendix В.3). "
        "Типично 50-200.",
    )

    # ── Section 3.1: Model ──
    params_billions: confloat(gt=0) = Field(..., description="Параметры модели в миллиардах (P_total)")
    params_active: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Активные параметры (B) — для MoE моделей. "
        "Dense: оставить None (= params_billions). "
        "DeepSeek-V3: 37; Qwen3-30B-A3B: 3; Mixtral 8x7B: 13. "
        "Используется в FPS = 2·P_active·1e9 (§6.1).",
    )
    params_dense: Optional[confloat(ge=0)] = Field(
        default=None,
        description="Плотная часть MoE модели (attention + embeddings + не-MoE слои), B. "
        "Только для MoE с детальной конфигурацией. P_total = P_dense + P_moe.",
    )
    params_moe: Optional[confloat(ge=0)] = Field(
        default=None,
        description="Сумма всех экспертов MoE модели, B. = P_total − P_dense. "
        "0 для dense.",
    )
    n_experts: Optional[conint(ge=1)] = Field(
        default=None,
        description="Общее число экспертов в MoE-слое. "
        "DeepSeek-V3: 256; Qwen3-MoE: 128; Mixtral: 8. None для dense.",
    )
    k_experts: Optional[conint(ge=1)] = Field(
        default=None,
        description="Число активируемых экспертов на токен (top-k). "
        "DeepSeek-V3: 8; Mixtral: 2. None для dense.",
    )
    bytes_per_param: confloat(gt=0) = Field(
        ..., description="Байт на параметр (Bquant): FP8→1, FP16→2, FP32→4"
    )
    safe_margin: confloat(ge=0.0) = Field(
        default=5.0,
        description="Безопасный отступ по памяти (SM, GiB). Учитывает буферы фреймворка, фрагментацию, CUDA-графы и пр.",
    )
    emp_model: confloat(ge=1.0) = Field(
        default=1.0, description="Коэф. поправки на практич. память модели (EMPmodel, 1.0-1.15)"
    )
    layers_L: conint(gt=0) = Field(..., description="Число слоёв модели (L)")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния (H)")

    # ── Section 3.2: KV-cache ──
    num_kv_heads: conint(gt=0) = Field(
        default=32, description="Количество голов KV-кэша (Nkv). Для GQA/MQA < num_attention_heads"
    )
    num_attention_heads: conint(gt=0) = Field(
        default=32, description="Количество голов внимания трансформера (Nattention)"
    )
    bytes_per_kv_state: confloat(gt=0) = Field(
        default=2, description="Байт на значение KV (Bstate): FP8→1, FP16→2, FP32→4"
    )
    emp_kv: confloat(ge=1.0) = Field(
        default=1.0, description="Коэф. поправки на практич. KV-кэш (EMPkv, 1.0-1.2)"
    )
    max_context_window_TSmax: conint(gt=0) = Field(
        ..., description="Макс. контекстное окно модели (TSmax)"
    )
    kv_lora_rank: Optional[conint(ge=0)] = Field(
        default=None,
        description="Латентная размерность KV для Multi-Head Latent Attention (MLA, "
        "DeepSeek-V2/V3/R1). Когда задано (>0), KV-кэш считается по MLA-формуле "
        "(§3.2): MKV = L·SL·(kv_lora_rank + qk_rope_head_dim)·B_state·EMP_kv. "
        "DeepSeek-V3: 512. None или 0 для стандартных MHA/GQA/MQA — используется "
        "формула с N_kv·H.",
    )
    qk_rope_head_dim: Optional[conint(ge=0)] = Field(
        default=None,
        description="Размерность RoPE-ключа MLA. DeepSeek-V3: 64. "
        "Используется только если kv_lora_rank > 0. None для не-MLA.",
    )

    # ── Section 4: Hardware & TP ──
    gpu_mem_gb: confloat(gt=0) = Field(..., description="Память GPU в GiB (GPUmemory)")
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU из каталога")
    bw_gpu_gbs: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Пропускная способность памяти GPU (BW_GPU, GB/s). "
        "Если не задано — берётся из каталога. Используется в memory-bandwidth-bound "
        "decode (§6.1).",
    )
    gpus_per_server: conint(gt=0) = Field(..., description="GPU на сервере (GPUcount_server)")
    kavail: confloat(gt=0.0, le=1.0) = Field(
        default=0.9, description="Коэф. доступной памяти GPU (Kavail, рек. 0.9)"
    )
    tp_multiplier_Z: conint(ge=1) = Field(
        default=1, description="Множитель Tensor Parallelism (Z): 1,2,4…"
    )
    pp_degree: Optional[conint(ge=1)] = Field(
        default=1,
        description="Pipeline Parallelism degree (Appendix Г.4). "
        "Модель разрезается по глубине; PP стадий выполняются последовательно. "
        "1 = no PP. PP > 1 расширяет per-instance footprint в PP раз; "
        "не снижает per-request latency (только инструмент memory-fit).",
    )
    ep_degree: Optional[conint(ge=1)] = Field(
        default=1,
        description="Expert Parallelism degree (Appendix Г.6). "
        "Только для MoE: распределение экспертов по GPU. "
        "1 = no EP (все эксперты на каждом GPU). "
        "Расширяет per-instance footprint в EP раз.",
    )
    eta_tp: Optional[confloat(gt=0.0, le=1.0)] = Field(
        default=1.0,
        description="Tensor Parallelism efficiency (η_TP, Appendix Г). "
        "Множитель на эффективный compute throughput из-за communication overhead. "
        "Типичные значения: NVLink 0.7-0.9, PCIe 0.4-0.6, "
        "InfiniBand 0.3-0.5. 1.0 = идеальная эффективность (по умолчанию).",
    )
    interconnect: Optional[str] = Field(
        default=None,
        description="GPU interconnect (informational, Appendix Г.7). "
        "Значения: 'nvlink', 'nvlink_sxm', 'pcie4', 'pcie5', 'infiniband', "
        "'roce'. Используется только для документирования конфигурации; "
        "для влияния на расчёт задайте eta_tp напрямую.",
    )

    # ── Section Ж (P10): PD-disaggregation (split prefill/decode pools) ──
    use_pd_disagg: Optional[bool] = Field(
        default=False,
        description="Включить PD-дизагрегацию (Приложение Ж). "
        "При True расчёт возвращает раздельные пулы: Servers_pf "
        "(prefill, под TTFT SLO) + Servers_dec (decode, под BW_GPU·η_mem·BS_real). "
        "Servers_total = Servers_pf + Servers_dec. "
        "При False (по умолчанию) — классическая совмещённая топология; "
        "если PD-дизагрегация дала бы экономию >30%, выводится pd_recommendation. "
        "Применимо к движкам NVIDIA Dynamo, vLLM 0.8+, SGLang, DistServe.",
    )
    pd_eta_pf_pool: Optional[confloat(gt=0.0, le=1.0)] = Field(
        default=None,
        description="η_pf для prefill-пула (Приложение Ж.2). "
        "Калибруется по prefill-heavy прогону §Е.1.2. "
        "При None используется inp.eta_prefill (общий калибровочный коэффициент). "
        "В реальных развёртываниях prefill-пул может иметь иную эффективность "
        "из-за специализации hardware (FLOPS-tuned).",
    )
    pd_eta_mem_pool: Optional[confloat(gt=0.0, le=1.0)] = Field(
        default=None,
        description="η_mem для decode-пула (Приложение Ж.2). "
        "Калибруется по decode-heavy прогону §Е.1.1. "
        "При None используется inp.eta_mem. "
        "Decode-пул может быть hardware-специализированным под высокую "
        "пропускную способность памяти (HBM-tuned).",
    )
    saturation_coeff_C: confloat(gt=0) = Field(
        default=C_SAT_DEFAULT,
        description="Коэф. насыщения от батча (C = tfix/tlin, прикидка 4-16). "
        "Дефолт калиброван по методологии §А.",
    )

    # ── Section 6: Compute ──
    gpu_flops_Fcount: Optional[confloat(gt=0)] = Field(
        None, description="Пиковые TFLOPS одного GPU (напр. 312 для A100)"
    )
    engine_mode: Optional[str] = Field(
        default="continuous",
        description="Inference engine batching mode (§6.1). "
        "'continuous' (vLLM, SGLang, TGI, Triton+inflight): prefill chunked into "
        "decode steps, K_batch=1, mem-bound branch via C_pf. "
        "'static' (offline-скрипты, Triton без inflight): legacy v2 K_batch формула. "
        "По умолчанию 'continuous' — соответствует современным движкам.",
    )
    c_pf: Optional[conint(gt=0)] = Field(
        default=256,
        description="Chunked-prefill step budget (tokens/forward, §6.1). "
        "vLLM: max_num_batched_tokens минус decode-доля. Типично 32-512. "
        "Используется только в continuous engine_mode.",
    )
    eta_prefill: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_PF_DEFAULT,
        description="Эффективность prefill (η_pf, 0.15-0.30). "
        "Дефолт калиброван по методологии §Е.5.",
    )
    eta_decode: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_DEC_DEFAULT,
        description="Эффективность decode (η_dec, 0.10-0.25). "
        "Дефолт калиброван по методологии §Е.5.",
    )
    eta_mem: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_MEM_DEFAULT,
        description="Эффективность memory-bandwidth decode (η_mem, 0.25-0.60). "
        "Используется в memory-bandwidth-bound decode (§6.1).",
    )
    o_fixed: confloat(ge=0.0) = Field(
        default=O_FIXED_DEFAULT,
        description="Per-forward memory overhead (GB). Dense BF16=0; "
        "MoE+FP8 на H100/H200 ≈ 8-10 GB. Используется в decode mem-bound (§6.2).",
    )
    eta_cache: confloat(ge=0.0, le=1.0) = Field(
        default=ETA_CACHE_DEFAULT,
        description="Доля prefill из prefix-cache (§3.1 H-5). "
        "Чат: 0.3-0.5; RAG: 0.1-0.3; агент: 0.5-0.8.",
    )
    k_spec: confloat(ge=1.0) = Field(
        default=K_SPEC_DEFAULT,
        description="Speculative decoding multiplier (§3.1 H-5). "
        "1.0 = выкл; EAGLE-3: 1.8-2.5; MTP: 1.5-1.8.",
    )
    th_prefill_empir: Optional[confloat(gt=0)] = Field(
        None, description="Эмпирич. throughput prefill (tokens/sec)"
    )
    th_decode_empir: Optional[confloat(gt=0)] = Field(
        None, description="Эмпирич. throughput decode (tokens/sec)"
    )

    # ── Section 6.4: SLA ──
    rps_per_session_R: confloat(gt=0) = Field(
        default=0.02, description="Запросов/сек на сессию (R, чат ≈ 0.017-0.033)"
    )
    sla_reserve_KSLA: confloat(gt=0) = Field(
        default=1.25, description="Коэф. запаса для SLA (KSLA, 1.25-2.0)"
    )

    # ── Section 7: SLA validation (TTFT & e2eLatency targets) ──
    ttft_sla: Optional[confloat(gt=0)] = Field(
        default=None, description="Целевой TTFT по SLA (сек). Если задан — выполняется проверка"
    )
    e2e_latency_sla: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Целевой e2eLatency по SLA (сек). Если задан — выполняется проверка",
    )
    t_overhead: confloat(ge=0.0) = Field(
        default=T_OVERHEAD_DEFAULT,
        description="TTFT per-request overhead (сек, §7.1) — tokenization + proxy + admission. "
        "vLLM+LiteLLM: 0.015-0.040; in-process: 0.005-0.015. "
        "Дефолт калиброван по методологии §Е.5.",
    )

    # ── Optional: пользовательский каталог GPU (для расчёта Cost Estimate по ценам из каталога) ──
    custom_gpu_catalog: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = Field(
        default=None,
        description="Пользовательский каталог GPU (массив или объект). Если задан — цена для Cost Estimate берётся из него.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "internal_users": 1000,
                "penetration_internal": 0.6,
                "concurrency_internal": 0.2,
                "external_users": 0,
                "penetration_external": 0.0,
                "concurrency_external": 0.0,
                "sessions_per_user_J": 1,
                "system_prompt_tokens_SP": 1000,
                "user_prompt_tokens_Prp": 200,
                "reasoning_tokens_MRT": 4096,
                "answer_tokens_A": 400,
                "dialog_turns": 5,
                "params_billions": 7,
                "bytes_per_param": 2,
                "safe_margin": 5.0,
                "emp_model": 1.0,
                "layers_L": 32,
                "hidden_size_H": 4096,
                "num_kv_heads": 32,
                "num_attention_heads": 32,
                "bytes_per_kv_state": 2,
                "emp_kv": 1.0,
                "max_context_window_TSmax": 32768,
                "gpu_mem_gb": 80,
                "gpus_per_server": 8,
                "kavail": 0.9,
                "tp_multiplier_Z": 1,
                "saturation_coeff_C": 8.0,
                "gpu_flops_Fcount": 312,
                "eta_prefill": 0.20,
                "eta_decode": 0.15,
                "rps_per_session_R": 0.02,
                "sla_reserve_KSLA": 1.25,
            }
        }
    )


class SizingOutput(BaseModel):
    """Результат расчета серверов (Методика v2)"""

    # ── Section 2: Load ──
    Ssim_concurrent_sessions: float = Field(
        ..., description="Пиковое кол-во одновременных сессий (Ssim)"
    )
    T_tokens_per_request: float = Field(..., description="Токены на запрос: SP + Prp + MRT + A")

    # ── Section 3: Memory ──
    model_mem_gb: float = Field(..., description="Память модели (Mmodel, GiB)")
    TS_session_context: float = Field(
        ..., description="Прикидочная длина контекста сессии в токенах (TS)"
    )
    SL_sequence_length: float = Field(
        ..., description="Длина последовательности (SL = min(TS, TSmax))"
    )
    kv_per_session_gb: float = Field(..., description="KV-кэш на 1 сессию (MKV_s1, GiB)")
    kv_arch_mode: Optional[str] = Field(
        default=None,
        description="Архитектура KV-кэша: 'mla' (Multi-Head Latent Attention — DeepSeek-V2/V3/R1, "
        "вычислено по kv_lora_rank+qk_rope), 'mqa' (multi-query, N_kv=1), "
        "'gqa' (grouped-query, N_kv < N_attention), 'mha' (full multi-head, N_kv = N_attention). "
        "Определяется автоматически из входных параметров модели.",
    )

    # ── Section 4: GPU & TP ──
    gpus_per_instance: int = Field(..., description="GPU на 1 экземпляр модели (GPUcount_model)")
    instances_per_server: int = Field(
        ..., description="Экземпляров модели на сервер без TP (Ncount_model)"
    )
    kv_free_per_instance_gb: float = Field(
        ..., description="Свободная память для KV на 1 экземпляр (GiB)"
    )
    S_TP_base: int = Field(
        ..., description="Макс. парал. сессий при базовом TP (S_TP=GPUcount_model)"
    )
    S_TP_z: int = Field(..., description="Макс. парал. сессий при Z×TP (S_TP=Z*GPUcount_model)")
    Kbatch: float = Field(..., description="Коэф. повышения пропускной способности (Kbatch)")
    instance_total_mem_gb: float = Field(
        ..., description="Полная GPU-память на инстанс с TP (Z×GPUcount_model×GPUmem, GiB)"
    )
    total_gpu_per_instance: Optional[int] = Field(
        default=None,
        description="Общее число GPU на инстанс с учётом всех видов параллелизма "
        "(Appendix Г.7): TP_min × Z × PP × EP.",
    )
    total_gpu_count: Optional[int] = Field(
        default=None,
        description="Общее число GPU в развёртывании (servers_final × GPUcount_server).",
    )
    eta_tp_used: Optional[float] = Field(
        default=None,
        description="Применённый множитель η_TP. При Z=1 не имеет эффекта; "
        "при Z>1 снижает effective compute throughput.",
    )
    pp_degree_used: Optional[int] = Field(
        default=None, description="Использованный pp_degree (echo, для подтверждения)."
    )
    ep_degree_used: Optional[int] = Field(
        default=None, description="Использованный ep_degree (echo)."
    )
    kv_free_per_instance_tp_gb: float = Field(
        ..., description="Свободная память для KV на инстанс с TP (GiB)"
    )

    # ── Section 5: Servers by memory ──
    instances_per_server_tp: int = Field(
        ..., description="Экземпляров модели на сервер с TP (NcountTP_model)"
    )
    sessions_per_server: int = Field(..., description="Сессий на сервер (Sserver)")
    servers_by_memory: int = Field(..., description="Серверов по памяти (Servers_mem)")

    # ── Section 6: Compute ──
    gpu_tflops_used: float = Field(
        ...,
        description="TFLOPS одного GPU (Half Precision / Tensor Core), использованные в расчёте",
    )
    Fcount_model_tflops: float = Field(
        ..., description="Суммарные TFLOPS на 1 экземпляр модели (gpu_tflops × GPUcount_model)"
    )
    FPS_flops_per_token: float = Field(..., description="FLOP на 1 токен (FPS = 2·P_active·10⁹)")
    p_active_used: Optional[float] = Field(
        default=None,
        description="Использованное число активных параметров (B). Из inp.params_active "
        "или fallback к params_billions. Используется в FPS.",
    )
    p_effective_used: Optional[float] = Field(
        default=None,
        description="P_effective(BS_real) — эффективное число параметров для memory traffic "
        "(§6.1 H-7). Вычислено при сошедшемся BS_real. Для MoE: "
        "P_dense + P_moe·[1−(1−k/N)^BS]. Для dense: = p_active_used.",
    )
    is_moe_detailed: bool = Field(
        default=False,
        description="True если все MoE-поля заданы (params_dense, params_moe, n_experts, k_experts) "
        "и применена формула P_effective(BS_real). False для dense / неполной MoE-конфигурации.",
    )
    BS_real: Optional[int] = Field(
        default=None,
        description="Реальный размер батча на экземпляр модели при сошедшемся числе "
        "серверов (§6.2/§6.4). BS_real = min(BS_max, ⌈Ssim/(Ncount·Servers)⌉).",
    )
    iteration_count: Optional[int] = Field(
        default=None,
        description="Число итераций фиксированной точки (§6.4) до сходимости. "
        "Типично 2-5; максимум 10.",
    )
    th_dec_compute_per_session_at_bs: Optional[float] = Field(
        default=None,
        description="Th_dec^compute / BS_real — per-session compute-bound throughput "
        "при сошедшемся BS_real. Используется для select_th_decode при v3 итерации.",
    )
    Tdec_tokens: float = Field(..., description="Токены decode фазы (Tdec = A + MRT)")
    th_prefill: float = Field(..., description="Throughput prefill (tokens/sec) — итоговый")
    th_pf_compute: Optional[float] = Field(
        default=None,
        description="Compute-bound предел prefill (§6.1). В continuous mode — Th_pf^cb,compute "
        "(K_batch=1); в static mode — Th_pf^analyt с K_batch.",
    )
    th_pf_mem: Optional[float] = Field(
        default=None,
        description="Memory-bandwidth-bound предел prefill (§6.1). Только для continuous mode "
        "при наличии bw_gpu_gbs. None в static mode или без bw.",
    )
    mode_prefill_bound: Optional[str] = Field(
        default=None,
        description="Что лимитирует prefill: 'static' (legacy K_batch формула, без mem-ветви), "
        "'compute' / 'memory' / 'compute_only' / 'memory_only' / 'empirical' (использован "
        "inp.th_prefill_empir) / 'none'.",
    )
    th_decode: float = Field(..., description="Throughput decode (tokens/sec) — итоговый, после min(compute, mem)")
    th_dec_compute: Optional[float] = Field(
        default=None,
        description="Compute-bound предел throughput decode (tokens/sec, §6.1).",
    )
    th_dec_mem: Optional[float] = Field(
        default=None,
        description="Memory-bandwidth-bound предел throughput decode (tokens/sec, §6.1 H-7). "
        "None если bw_gpu не известен (см. mode_decode_bound).",
    )
    mode_decode_bound: Optional[str] = Field(
        default=None,
        description="Что лимитирует decode: 'compute' / 'memory' / 'compute_only' "
        "(bw_gpu не задан — расчёт только compute) / 'memory_only' / 'empirical' (использован inp.th_decode_empir) / 'none'.",
    )
    bw_gpu_gbs_used: Optional[float] = Field(
        default=None,
        description="Использованная пропускная способность памяти GPU (GB/s). "
        "Из inp.bw_gpu_gbs или из каталога по gpu_id; None если недоступна.",
    )
    Cmodel_rps: float = Field(..., description="Запросов/сек на 1 экземпляр модели (Cmodel)")
    th_server_comp: float = Field(..., description="Пропускная способность сервера (req/sec)")
    servers_by_compute: int = Field(..., description="Серверов по вычислениям (Servers_comp)")

    # ── Section Ж (P10): PD-disaggregation outputs ──
    pd_disagg_used: Optional[bool] = Field(
        default=None,
        description="Применён ли расчёт PD-дизагрегации (Приложение Ж). "
        "При True servers_final учитывает Servers_pf + Servers_dec; "
        "при False классическая совмещённая топология.",
    )
    th_server_pf: Optional[float] = Field(
        default=None,
        description="Throughput сервера в prefill-пуле (req/sec, Приложение Ж.2). "
        "Th_pf^server = NcountTP × Th_pf / SL_pf^eff. "
        "Вычисляется всегда для what-if сравнения.",
    )
    th_server_dec: Optional[float] = Field(
        default=None,
        description="Throughput сервера в decode-пуле (req/sec, Приложение Ж.2). "
        "Th_dec^server = NcountTP × BS_real × Th_dec_per_session / T_dec. "
        "Вычисляется всегда для what-if сравнения.",
    )
    servers_pf: Optional[int] = Field(
        default=None,
        description="Серверы в prefill-пуле (Приложение Ж.2). "
        "Servers_pf = ⌈(Ssim · R_eff · K_SLA) / Th_pf^server⌉.",
    )
    servers_dec: Optional[int] = Field(
        default=None,
        description="Серверы в decode-пуле (Приложение Ж.2). "
        "Servers_dec = ⌈(Ssim · R_eff · K_SLA) / Th_dec^server⌉.",
    )
    servers_pd_total: Optional[int] = Field(
        default=None,
        description="Сумма обоих пулов (Приложение Ж.2): Servers_pf + Servers_dec. "
        "Сравнивается с servers_by_compute для оценки экономии.",
    )
    pd_eta_pf_pool_used: Optional[float] = Field(
        default=None,
        description="Применённый η_pf для prefill-пула (echo). "
        "Из inp.pd_eta_pf_pool или fallback к inp.eta_prefill.",
    )
    pd_eta_mem_pool_used: Optional[float] = Field(
        default=None,
        description="Применённый η_mem для decode-пула (echo). "
        "Из inp.pd_eta_mem_pool или fallback к inp.eta_mem.",
    )
    pd_recommendation: Optional[str] = Field(
        default=None,
        description="Рекомендация перейти на PD-дизагрегацию, если совмещённая топология "
        "тратит >30% compute. Заполняется только при use_pd_disagg=False.",
    )

    # ── Section 7: SLA validation ──
    SL_pf_input_length: Optional[float] = Field(
        default=None,
        description="Длина входной последовательности на prefill "
        "(SL_pf = SP + N_prp·Prp + (N_prp−1)·MRT, §7.1). "
        "Отличается от SL — используется в TTFT и Th_pf.",
    )
    SL_pf_eff_after_cache: Optional[float] = Field(
        default=None,
        description="SL_pf после учёта prefix-cache: SL_pf · (1 − η_cache). "
        "При η_cache = 0 равно SL_pf.",
    )
    ttft_analyt: Optional[float] = Field(None, description="Расчётный TTFT (сек)")
    generation_time_analyt: Optional[float] = Field(
        None, description="Расчётное время генерации (сек)"
    )
    e2e_latency_analyt: Optional[float] = Field(
        None,
        description="Расчётный e2eLatency для одного запроса (сек, §7.2). "
        "Per-request форма: TTFT + GenerationTime, аккаунтит BS_real через per-session Th_dec.",
    )
    e2e_latency_load: Optional[float] = Field(
        default=None,
        description="e2eLatency под установившейся нагрузкой (сек, §7.2). "
        "По закону Литтла: BS_real / C_model(BS_real). Захватывает queueing-эффект.",
    )
    e2e_latency_for_sla: Optional[float] = Field(
        default=None,
        description="Эффективный e2eLatency для SLA-валидации (сек). "
        "= max(e2e_latency_analyt, e2e_latency_load). Используется в e2e_latency_sla_pass.",
    )
    ttft_sla_target: Optional[float] = Field(None, description="Целевой TTFT по SLA (сек)")
    e2e_latency_sla_target: Optional[float] = Field(
        None, description="Целевой e2eLatency по SLA (сек)"
    )
    ttft_sla_pass: Optional[bool] = Field(None, description="TTFT проходит SLA?")
    e2e_latency_sla_pass: Optional[bool] = Field(None, description="e2eLatency проходит SLA?")
    sla_passed: Optional[bool] = Field(None, description="Все SLA проверки пройдены?")
    sla_recommendations: Optional[List[str]] = Field(
        None, description="Рекомендации при невыполнении SLA (Приложение Б)"
    )

    # ── Section 8: Final ──
    servers_final: int = Field(..., description="Итоговое количество серверов")

    # ── Context ──
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU")
    gpu_mem_gb: float = Field(..., description="Память GPU (GiB)")
    gpus_per_server: int = Field(..., description="GPU на сервере (GPUcount_server)")

    # ── Cost (optional, from GPU catalog price) ──
    cost_estimate_usd: Optional[float] = Field(
        None, description="Оценка стоимости инфраструктуры (USD): серверы × GPU/сервер × цена GPU"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "Ssim_concurrent_sessions": 120.0,
                "T_tokens_per_request": 5696.0,
                "model_mem_gb": 14.99,
                "TS_session_context": 24480.0,
                "SL_sequence_length": 24480.0,
                "kv_per_session_gb": 11.95,
                "gpus_per_instance": 1,
                "instances_per_server": 8,
                "kv_free_per_instance_gb": 57.01,
                "S_TP_base": 4,
                "S_TP_z": 4,
                "Kbatch": 1.0,
                "instance_total_mem_gb": 80.0,
                "kv_free_per_instance_tp_gb": 57.01,
                "instances_per_server_tp": 8,
                "sessions_per_server": 32,
                "servers_by_memory": 4,
                "gpu_tflops_used": 312.0,
                "Fcount_model_tflops": 312.0,
                "FPS_flops_per_token": 14000000000.0,
                "Tdec_tokens": 4496.0,
                "th_prefill": 2322.0,
                "th_decode": 1670.0,
                "Cmodel_rps": 0.076,
                "th_server_comp": 0.605,
                "servers_by_compute": 5,
                "servers_final": 5,
                "gpu_mem_gb": 80,
                "gpus_per_server": 8,
            }
        }
    )


class WhatIfScenario(BaseModel):
    """Сценарий для анализа 'что если'"""

    name: str = Field(..., description="Название сценария")
    overrides: dict = Field(default_factory=dict, description="Переопределения параметров")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Double users",
                "overrides": {
                    "internal_users": 2000,
                },
            }
        }
    )


class WhatIfRequest(BaseModel):
    """Запрос для анализа сценариев"""

    base: SizingInput = Field(..., description="Базовые параметры")
    scenarios: List[WhatIfScenario] = Field(..., description="Список сценариев")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "base": {
                    "internal_users": 1000,
                    "penetration_internal": 0.6,
                    "concurrency_internal": 0.2,
                    "sessions_per_user_J": 1,
                    "system_prompt_tokens_SP": 1000,
                    "user_prompt_tokens_Prp": 200,
                    "reasoning_tokens_MRT": 4096,
                    "answer_tokens_A": 400,
                    "dialog_turns": 5,
                    "params_billions": 7,
                    "bytes_per_param": 2,
                    "safe_margin": 5.0,
                    "emp_model": 1.0,
                    "layers_L": 32,
                    "hidden_size_H": 4096,
                    "bytes_per_kv_state": 2,
                    "emp_kv": 1.0,
                    "max_context_window_TSmax": 32768,
                    "gpu_mem_gb": 80,
                    "gpus_per_server": 8,
                    "kavail": 0.9,
                    "tp_multiplier_Z": 1,
                    "saturation_coeff_C": 8.0,
                    "gpu_flops_Fcount": 312,
                    "eta_prefill": 0.20,
                    "eta_decode": 0.15,
                    "rps_per_session_R": 0.02,
                    "sla_reserve_KSLA": 1.25,
                },
                "scenarios": [
                    {
                        "name": "Double users",
                        "overrides": {"internal_users": 2000},
                    },
                    {
                        "name": "Bigger model 13B",
                        "overrides": {"params_billions": 13},
                    },
                ],
            }
        }
    )


class WhatIfResponseItem(BaseModel):
    """Элемент ответа для анализа сценариев"""

    name: str = Field(..., description="Название сценария")
    output: SizingOutput = Field(..., description="Результат расчета")


# ═══════════════════════════════════════════════════════════
#  Auto-Optimize: подбор оптимальной конфигурации
# ═══════════════════════════════════════════════════════════


class OptimizationMode(str, Enum):
    """Режим оптимизации"""

    min_servers = "min_servers"
    min_cost = "min_cost"
    max_performance = "max_performance"
    best_sla = "best_sla"
    balanced = "balanced"


class AutoOptimizeInput(BaseModel):
    """Входные параметры для автоподбора конфигурации.

    Пользователь задаёт модель, нагрузку, токены и SLA.
    Система перебирает комбинации GPU, TP, gpus_per_server, квантизации
    и возвращает top-N оптимальных конфигураций.
    """

    # ── Model ──
    params_billions: confloat(gt=0) = Field(..., description="Параметры модели в миллиардах (P)")
    layers_L: conint(gt=0) = Field(..., description="Число слоёв модели (L)")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния (H)")
    safe_margin: confloat(ge=0.0) = Field(
        default=5.0, description="Безопасный отступ по памяти (SM, GiB)"
    )
    emp_model: confloat(ge=1.0) = Field(default=1.0, description="Коэф. поправки на память модели")

    # ── Users & behavior ──
    internal_users: conint(ge=0) = Field(..., description="Внутренние пользователи")
    penetration_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэф. проникновения")
    concurrency_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэф. одновременности")
    external_users: conint(ge=0) = Field(default=0, description="Внешние пользователи")
    penetration_external: confloat(ge=0.0, le=1.0) = Field(
        default=0.0, description="Коэф. проникновения внешн."
    )
    concurrency_external: confloat(ge=0.0, le=1.0) = Field(
        default=0.0, description="Коэф. одновременности внешн."
    )
    sessions_per_user_J: confloat(gt=0) = Field(default=1, description="Сессий на пользователя")

    # ── Tokens ──
    system_prompt_tokens_SP: confloat(ge=0) = Field(default=1000, description="Системный промпт")
    user_prompt_tokens_Prp: confloat(ge=0) = Field(default=200, description="Запрос пользователя")
    reasoning_tokens_MRT: confloat(ge=0) = Field(default=4096, description="Рассуждения")
    answer_tokens_A: confloat(ge=0) = Field(default=400, description="Ответ модели")
    dialog_turns: conint(gt=0) = Field(default=5, description="Ходов диалога")

    # ── KV-cache ──
    num_kv_heads: conint(gt=0) = Field(default=32, description="Кол-во голов KV-кэша (Nkv)")
    num_attention_heads: conint(gt=0) = Field(
        default=32, description="Кол-во голов внимания (Nattention)"
    )
    bytes_per_kv_state: confloat(gt=0) = Field(default=2, description="Байт на KV")
    emp_kv: confloat(ge=1.0) = Field(default=1.0, description="Поправка KV")
    max_context_window_TSmax: conint(gt=0) = Field(default=32768, description="Макс. контекст")

    # ── SLA ──
    rps_per_session_R: confloat(gt=0) = Field(default=0.02, description="req/s на сессию")
    sla_reserve_KSLA: confloat(gt=0) = Field(default=1.25, description="Запас SLA")
    ttft_sla: Optional[confloat(gt=0)] = Field(
        default=None, description="Целевой TTFT по SLA (сек)"
    )
    e2e_latency_sla: Optional[confloat(gt=0)] = Field(
        default=None, description="Целевой e2eLatency по SLA (сек)"
    )

    # ── Optional tuning ──
    kavail: confloat(gt=0.0, le=1.0) = Field(default=0.9, description="Доступная память GPU")
    eta_prefill: confloat(gt=0.0, le=1.0) = Field(default=0.20, description="Эффективность prefill")
    eta_decode: confloat(gt=0.0, le=1.0) = Field(default=0.15, description="Эффективность decode")
    saturation_coeff_C: confloat(gt=0) = Field(default=8.0, description="Коэф. насыщения")

    # ── Optimization control ──
    mode: OptimizationMode = Field(
        default=OptimizationMode.balanced, description="Режим оптимизации"
    )
    min_gpu_memory_gb: Optional[confloat(gt=0)] = Field(
        default=None, description="Мин. память GPU (фильтр)"
    )
    max_servers: Optional[conint(gt=0)] = Field(default=None, description="Макс. серверов (фильтр)")
    gpu_vendors: Optional[List[str]] = Field(
        default=None, description="Фильтр по вендорам (NVIDIA, AMD, ...)"
    )
    gpu_ids: Optional[List[str]] = Field(
        default=None, description="Конкретные ID GPU из каталога для подбора"
    )
    custom_gpu_catalog: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = Field(
        default=None,
        description="Пользовательский каталог GPU (нормализованный JSON-массив). "
        "Если задан — используется вместо встроенного каталога.",
    )
    top_n: conint(gt=0, le=50) = Field(default=10, description="Количество лучших конфигураций")


class AutoOptimizeResult(BaseModel):
    """Одна конфигурация в результатах автоподбора"""

    rank: int = Field(..., description="Ранг конфигурации (1 = лучшая)")
    score: float = Field(..., description="Скор оптимизации (меньше = лучше)")

    # ── Подобранные параметры ──
    gpu_name: str = Field(..., description="Название GPU")
    gpu_id: Optional[str] = Field(None, description="ID GPU из каталога")
    gpu_mem_gb: float = Field(..., description="Память GPU (GiB)")
    gpu_tflops: float = Field(..., description="TFLOPS GPU")
    tp_multiplier_Z: int = Field(..., description="TP Degree (Z)")
    gpus_per_server: int = Field(..., description="GPU на сервер")
    bytes_per_param: float = Field(..., description="Квантизация (байт/параметр)")

    # ── Ключевые метрики ──
    servers_final: int = Field(..., description="Итого серверов")
    total_gpus: int = Field(..., description="Итого GPU (серверов × GPU/сервер)")
    servers_by_memory: int = Field(..., description="Серверов по памяти")
    servers_by_compute: int = Field(..., description="Серверов по вычислениям")
    sessions_per_server: int = Field(..., description="Сессий на сервер")
    instances_per_server_tp: int = Field(..., description="Экземпляров на сервер с TP")
    th_server_comp: float = Field(..., description="Пропускная способность сервера (req/s)")

    # ── Cost ──
    gpu_price_usd: Optional[float] = Field(None, description="Цена одного GPU (USD)")
    cost_estimate_usd: Optional[float] = Field(
        None, description="Общая стоимость GPU (серверы × GPU/сервер × цена)"
    )

    # ── Full output for Apply ──
    sizing_input: Optional[dict] = Field(
        None, description="Полный SizingInput для подстановки в калькулятор"
    )


class AutoOptimizeResponse(BaseModel):
    """Ответ автоподбора конфигурации"""

    mode: OptimizationMode = Field(..., description="Использованный режим оптимизации")
    total_evaluated: int = Field(..., description="Всего оценено комбинаций")
    total_valid: int = Field(..., description="Валидных комбинаций")
    results: List[AutoOptimizeResult] = Field(..., description="Топ конфигураций")


# ═══════════════════════════════════════════════════════════
# Section И (P9a): VLM single-pass online sizing
# ═══════════════════════════════════════════════════════════


class VLMSizingInput(BaseModel):
    """Входные параметры для расчёта VLM single-pass online сайзинга (Приложение И).

    Online-режим: каждая страница ожидает ответа в пределах SLA_page (p95).
    Single-pass VLM: одна модель обрабатывает изображение → структурированный
    JSON-ответ. Архитектурный выбор (VLM vs OCR+LLM) — Таблица И.1.
    """

    # ── И.1: Workload (online) ──
    lambda_online: confloat(gt=0) = Field(
        ..., description="Среднее число страниц в секунду (λ_online), pages/s"
    )
    c_peak: conint(gt=0) = Field(
        ...,
        description="Пиковое число одновременно обрабатываемых страниц (C_peak). "
        "Аналог S_sim из §2.1 основной методики, но измеряется в pages.",
    )
    sla_page: confloat(gt=0) = Field(
        ..., description="Целевое p95 время отклика на одну страницу (SLA_page), сек"
    )

    # ── И.3.1: Image / token profile ──
    w_px: conint(gt=0) = Field(..., description="Ширина изображения, px")
    h_px: conint(gt=0) = Field(..., description="Высота изображения, px")
    patch_eff: conint(gt=0) = Field(
        default=28,
        description="Эффективный размер патча после spatial-merge. "
        "Qwen2.5-VL ≈ 28; InternVL-2.5 ≈ 28.",
    )
    n_ch: conint(ge=1) = Field(
        default=1,
        description="Мультипликатор для цветовых каналов. 1 для grayscale-моделей "
        "и большинства VLM, где RGB свёрнут в одну patch-проекцию.",
    )
    n_prompt_txt: conint(ge=0) = Field(
        default=100,
        description="Длина текстовой инструкции (system prompt + task description), tokens",
    )
    n_fields: conint(ge=1) = Field(..., description="Число извлекаемых полей в JSON-ответе")
    tok_field: conint(ge=1) = Field(
        default=50, description="Среднее число токенов на одно поле в JSON-выводе (типично 30-100)"
    )

    # ── И.3.1 / §3.1: Model ──
    params_billions: confloat(gt=0) = Field(..., description="Параметры VLM-модели, B")
    bytes_per_param: confloat(gt=0) = Field(..., description="Байт на параметр (FP8→1, FP16→2)")
    safe_margin: confloat(ge=0.0) = Field(default=5.0, description="SM, GiB")
    emp_model: confloat(ge=1.0) = Field(default=1.0, description="EMP_model, 1.0-1.15")
    layers_L: conint(gt=0) = Field(..., description="Число слоёв (L)")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния (H)")

    # ── §3.2: KV-cache ──
    num_kv_heads: conint(gt=0) = Field(default=32, description="Кол-во KV-голов (Nkv)")
    num_attention_heads: conint(gt=0) = Field(default=32, description="Кол-во attention-голов")
    bytes_per_kv_state: confloat(gt=0) = Field(default=2, description="Байт на KV (FP16=2)")
    emp_kv: confloat(ge=1.0) = Field(default=1.0, description="EMP_kv")
    max_context_window_TSmax: conint(gt=0) = Field(
        default=32768, description="Макс. контекстное окно модели"
    )

    # ── §4: Hardware ──
    gpu_mem_gb: confloat(gt=0) = Field(..., description="Память GPU (GiB)")
    gpu_id: Optional[str] = Field(None, description="ID GPU из каталога")
    bw_gpu_gbs: Optional[confloat(gt=0)] = Field(
        None, description="Пропускная способность памяти GPU (GB/s); None → из каталога"
    )
    gpus_per_server: conint(gt=0) = Field(..., description="GPU на сервере")
    kavail: confloat(gt=0.0, le=1.0) = Field(default=0.9, description="Kavail")
    tp_multiplier_Z: conint(ge=1) = Field(default=1, description="TP degree (Z)")

    # ── §6.1 / И.7.1: Compute ──
    gpu_flops_Fcount: Optional[confloat(gt=0)] = Field(
        None, description="Пиковые TFLOPS GPU; None → из каталога"
    )
    eta_vlm_pf: confloat(gt=0.0, le=1.0) = Field(
        default=0.15,
        description="Утилизация compute на vision-prefill (η_vlm,pf, И.7.1). "
        "До калибровки 0.10-0.20.",
    )
    eta_decode: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_DEC_DEFAULT, description="η_dec для decode-стадии (LLM-форма)"
    )
    eta_mem: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_MEM_DEFAULT, description="η_mem для memory-bound decode/prefill"
    )
    saturation_coeff_C: confloat(gt=0) = Field(
        default=C_SAT_DEFAULT, description="C для K_batch (Z>1)"
    )
    eta_cache_vlm: confloat(ge=0.0, le=1.0) = Field(
        default=0.0,
        description="Доля prefill из prefix-cache (И.4.1). Для VLM ≈ 0 — визуальные токены "
        "уникальны для каждой страницы.",
    )
    t_ovh_vlm: confloat(ge=0.0) = Field(
        default=T_OVERHEAD_DEFAULT,
        description="Per-page overhead (preprocessing, postprocessing, T_ovh^VLM, И.7.1). "
        "Калиброванный диапазон 0.05-0.20.",
    )
    o_fixed: confloat(ge=0.0) = Field(
        default=O_FIXED_DEFAULT, description="Per-forward memory overhead (GB)"
    )
    c_pf: Optional[conint(gt=0)] = Field(
        default=256, description="Chunked-prefill step budget (vLLM)"
    )

    # ── И.5 (P9c): Batch-mode parameters ──
    mode: Optional[str] = Field(
        default="online",
        description="Режим расчёта: 'online' — sizing по SLA_page, "
        "'batch' — sizing по окну W и η_batch, "
        "'combined' — max(N_online, N_batch) per И.5. По умолчанию 'online'.",
    )
    D_pages: Optional[confloat(ge=0)] = Field(
        default=None,
        description="Объём batch-обработки за окно (D, pages/window). "
        "Обязательно для mode='batch' или 'combined'.",
    )
    W_seconds: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Длительность batch-окна (W, сек). Типично 28800 (8 ч). "
        "Обязательно для mode='batch' или 'combined'.",
    )
    eta_batch: confloat(gt=0.0, le=1.0) = Field(
        default=0.90,
        description="Утилизация в batch-режиме (η_batch, И.5). 0.85-0.95.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lambda_online": 1.0,
                "c_peak": 4,
                "sla_page": 5.0,
                "w_px": 1240,
                "h_px": 1754,
                "patch_eff": 28,
                "n_ch": 1,
                "n_prompt_txt": 200,
                "n_fields": 20,
                "tok_field": 50,
                "params_billions": 7,
                "bytes_per_param": 2,
                "layers_L": 32,
                "hidden_size_H": 4096,
                "num_kv_heads": 32,
                "num_attention_heads": 32,
                "bytes_per_kv_state": 2,
                "max_context_window_TSmax": 32768,
                "gpu_mem_gb": 80,
                "gpus_per_server": 8,
                "tp_multiplier_Z": 1,
                "gpu_flops_Fcount": 312,
            }
        }
    )


class VLMSizingOutput(BaseModel):
    """Результат VLM single-pass online сайзинга (Приложение И.4.1)."""

    # ── И.3.1: Token profile ──
    v_tok: int = Field(..., description="Число визуальных токенов (V_tok)")
    sl_pf_vlm: int = Field(..., description="Длина prefill VLM (SL_pf^VLM = V_tok + N_prompt^txt)")
    sl_pf_vlm_eff: float = Field(
        ..., description="SL_pf^VLM,eff после prefix-cache: SL_pf · (1 − η_cache^VLM)"
    )
    sl_dec_vlm: int = Field(..., description="Число decode-токенов на страницу (SL_dec^VLM)")

    # ── §3: Memory ──
    model_mem_gb: float = Field(..., description="Память модели VLM (GiB)")
    kv_per_session_gb: float = Field(..., description="KV-кэш на 1 страницу (M_KV^VLM, GiB)")

    # ── §4: GPU & TP ──
    gpus_per_instance: int = Field(..., description="GPU на 1 инстанс модели")
    s_tp_z: int = Field(
        ..., description="Макс. одновременных сессий на инстанс при заданном TP"
    )
    instance_total_mem_gb: float = Field(..., description="GPU-память на инстанс (GiB)")

    # ── §6.1: Throughput ──
    gpu_tflops_used: float = Field(..., description="TFLOPS GPU")
    th_pf_vlm: float = Field(..., description="Throughput prefill VLM при BS=BS_real* (tokens/s)")
    th_dec_vlm: float = Field(..., description="Throughput decode VLM при BS=BS_real* (tokens/s)")

    # ── И.4.1: Per-page latency & BS_real* ──
    t_page_vlm: float = Field(
        ..., description="t_page^VLM при найденном BS_real* (сек)"
    )
    bs_real_star: int = Field(
        ...,
        description="Максимальный BS_real, удовлетворяющий SLA_page. "
        "0 если даже BS=1 нарушает SLA (sla_pass=False).",
    )
    sla_pass: bool = Field(..., description="t_page^VLM ≤ SLA_page при BS_real*")
    sla_page_target: float = Field(..., description="SLA_page (echo)")

    # ── И.4.1: Replicas & GPUs ──
    n_repl_vlm: int = Field(
        ..., description="Реплики VLM-инстансов: ⌈C_peak / BS_real*⌉"
    )
    n_gpu_vlm_online: int = Field(
        ..., description="Всего GPU в online-пуле: N_repl_VLM · Z_TP · gpus_per_instance"
    )
    n_servers_vlm_online: int = Field(
        ..., description="Серверы в online-пуле: ⌈N_GPU_online / gpus_per_server⌉"
    )

    # ── И.5 (P9c): Batch-mode outputs ──
    mode_used: Optional[str] = Field(
        default=None, description="Режим расчёта (echo): 'online', 'batch', 'combined'"
    )
    t_page_vlm_at_bs_max: Optional[float] = Field(
        default=None,
        description="Время страницы при BS = BS_max (S_TP_z, steady-state без SLA), сек. "
        "Используется для batch-сайзинга. Может быть > SLA_page.",
    )
    n_gpu_vlm_batch: Optional[int] = Field(
        default=None,
        description="GPU в batch-пуле: ⌈D · t_page_at_bs_max / (W · η_batch)⌉. "
        "None если D / W не заданы.",
    )
    n_servers_vlm_batch: Optional[int] = Field(
        default=None, description="Серверы в batch-пуле"
    )
    n_gpu_vlm_total: Optional[int] = Field(
        default=None,
        description="Combined deployment: max(N_GPU_online, N_GPU_batch) per И.5. "
        "Совпадает с n_gpu_vlm_online при mode='online'.",
    )
    n_servers_vlm_total: Optional[int] = Field(
        default=None, description="Серверы для combined deployment"
    )
    window_sufficient: Optional[bool] = Field(
        default=None,
        description="Достаточно ли окна W для batch-нагрузки на online-парке "
        "(И.1: W ≥ D · t_page / (N_online · η_batch)). None если D/W не заданы.",
    )
    eta_batch_used: Optional[float] = Field(
        default=None, description="η_batch (echo)"
    )
    D_pages_used: Optional[float] = Field(default=None, description="D (echo)")
    W_seconds_used: Optional[float] = Field(default=None, description="W (echo)")

    # ── Echoes ──
    eta_vlm_pf_used: float = Field(..., description="η_vlm,pf, использованный в расчёте")
    c_peak_used: int = Field(..., description="C_peak (echo)")
    lambda_online_used: float = Field(..., description="λ_online (echo)")

    # ── Context ──
    gpu_id: Optional[str] = Field(None, description="ID GPU")
    gpu_mem_gb: float = Field(..., description="Память GPU (GiB)")
    gpus_per_server: int = Field(..., description="GPU на сервере")


# ═══════════════════════════════════════════════════════════
# Section И (P9b): OCR + LLM two-pass online sizing
# ═══════════════════════════════════════════════════════════


class OCRSizingInput(BaseModel):
    """Входные параметры для OCR + LLM two-pass online сайзинга (Приложение И.4.2).

    Pipeline режимы:
      - 'ocr_gpu': OCR на GPU (PaddleOCR-GPU, EasyOCR) + LLM на GPU,
        двухпуловая модель N_GPU = N_OCR + N_LLM.
      - 'ocr_cpu': OCR на CPU (Tesseract) + LLM на GPU; OCR не входит в
        GPU-сайзинг (N_GPU^OCR = 0), LLM-стадия получает уменьшенный
        latency-бюджет t_LLM^target = SLA_page − t_OCR^CPU.
    """

    # ── И.1: Workload ──
    lambda_online: confloat(gt=0) = Field(
        ..., description="Среднее число страниц в секунду (λ_online), pages/s"
    )
    c_peak: conint(gt=0) = Field(..., description="Пиковое число одновременных страниц")
    sla_page: confloat(gt=0) = Field(
        ..., description="p95 SLA на одну страницу (SLA_page), сек"
    )

    # ── И.3.2-И.3.3: Pipeline mode ──
    pipeline: str = Field(
        default="ocr_gpu",
        description="Pipeline OCR-стадии: "
        "'ocr_gpu' — OCR на GPU (PaddleOCR-GPU, EasyOCR-GPU); "
        "'ocr_cpu' — OCR на CPU (Tesseract), не входит в GPU-сайзинг.",
    )
    r_ocr_gpu: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Throughput OCR-движка на GPU (R_OCR^GPU, pages/s/GPU). "
        "Эмпирическое; калибровка И.7.2. Обязательно для pipeline='ocr_gpu'.",
    )
    eta_ocr: confloat(gt=0.0, le=1.0) = Field(
        default=0.85,
        description="Утилизация OCR-парка (η_OCR, И.4.2). 0.7-0.85.",
    )
    r_ocr_core: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Throughput OCR на одно ядро CPU (R_OCR^core, pages/s). "
        "Обязательно для pipeline='ocr_cpu'.",
    )
    n_ocr_cores: Optional[conint(ge=1)] = Field(
        default=None,
        description="Количество CPU-ядер для OCR-стадии (n_cores). "
        "Обязательно для pipeline='ocr_cpu'.",
    )
    t_handoff: confloat(ge=0.0) = Field(
        default=0.0,
        description="Overhead на передачу OCR-вывода в LLM (T_handoff, И.4.2). "
        "Типично 0 для in-process; 0.05-0.20 при network/serialization.",
    )

    # ── И.3.4: OCR output → LLM input ──
    chars_page: conint(gt=0) = Field(
        ..., description="Среднее число распознанных символов на страницу"
    )
    c_token: confloat(gt=0) = Field(
        default=3.5,
        description="Символов на токен (c_token, И.3.4). "
        "3.5 — смешанный текст; 4.0 — английский; 2.8 — кириллица.",
    )
    n_prompt_sys: conint(ge=0) = Field(
        default=1000,
        description="Длина системного промпта для LLM-стадии (N_prompt^sys), tokens",
    )

    # ── LLM output (схоже с VLM) ──
    n_fields: conint(ge=1) = Field(..., description="Число извлекаемых полей в JSON-ответе")
    tok_field: conint(ge=1) = Field(default=50, description="Среднее число токенов на поле")

    # ── §3.1: LLM model ──
    params_billions: confloat(gt=0) = Field(..., description="Параметры LLM модели, B")
    bytes_per_param: confloat(gt=0) = Field(..., description="Байт на параметр")
    safe_margin: confloat(ge=0.0) = Field(default=5.0, description="SM, GiB")
    emp_model: confloat(ge=1.0) = Field(default=1.0, description="EMP_model")
    layers_L: conint(gt=0) = Field(..., description="Число слоёв (L)")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния (H)")

    # ── §3.2: KV-cache ──
    num_kv_heads: conint(gt=0) = Field(default=32, description="Кол-во KV-голов")
    num_attention_heads: conint(gt=0) = Field(default=32, description="Кол-во attention-голов")
    bytes_per_kv_state: confloat(gt=0) = Field(default=2, description="Байт на KV")
    emp_kv: confloat(ge=1.0) = Field(default=1.0, description="EMP_kv")
    max_context_window_TSmax: conint(gt=0) = Field(
        default=32768, description="Макс. контекстное окно"
    )

    # ── §4: Hardware ──
    gpu_mem_gb: confloat(gt=0) = Field(..., description="Память GPU (GiB)")
    gpu_id: Optional[str] = Field(None, description="ID GPU")
    bw_gpu_gbs: Optional[confloat(gt=0)] = Field(None, description="BW GPU (GB/s)")
    gpus_per_server: conint(gt=0) = Field(..., description="GPU на сервере")
    kavail: confloat(gt=0.0, le=1.0) = Field(default=0.9, description="Kavail")
    tp_multiplier_Z: conint(ge=1) = Field(default=1, description="TP degree (Z)")

    # ── §6.1: Compute (LLM-стадия) ──
    gpu_flops_Fcount: Optional[confloat(gt=0)] = Field(None, description="TFLOPS GPU")
    eta_prefill: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_PF_DEFAULT, description="η_pf для LLM-стадии prefill"
    )
    eta_decode: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_DEC_DEFAULT, description="η_dec для LLM-стадии decode"
    )
    eta_mem: confloat(gt=0.0, le=1.0) = Field(
        default=ETA_MEM_DEFAULT, description="η_mem для memory-bound branches"
    )
    saturation_coeff_C: confloat(gt=0) = Field(
        default=C_SAT_DEFAULT, description="C для K_batch (Z>1)"
    )
    eta_cache: confloat(ge=0.0, le=1.0) = Field(
        default=ETA_CACHE_DEFAULT,
        description="Доля prefill из prefix-cache (system prompt одинаков → выгода значимая)",
    )
    t_overhead_llm: confloat(ge=0.0) = Field(
        default=T_OVERHEAD_DEFAULT,
        description="Per-request LLM overhead (T_ovh^LLM)",
    )
    o_fixed: confloat(ge=0.0) = Field(
        default=O_FIXED_DEFAULT, description="Per-forward memory overhead (GB)"
    )
    c_pf: Optional[conint(gt=0)] = Field(default=256, description="Chunked-prefill budget")

    # ── И.5 (P9c): Batch-mode parameters ──
    mode: Optional[str] = Field(
        default="online",
        description="Режим: 'online' (sizing по SLA_page), "
        "'batch' (sizing по окну W), 'combined' (max обоих per И.5).",
    )
    D_pages: Optional[confloat(ge=0)] = Field(
        default=None,
        description="Объём batch-обработки за окно (D, pages/window). "
        "Обязательно для mode='batch' / 'combined'.",
    )
    W_seconds: Optional[confloat(gt=0)] = Field(
        default=None,
        description="Длительность batch-окна (W, сек). Типично 28800 (8 ч).",
    )
    eta_batch: confloat(gt=0.0, le=1.0) = Field(
        default=0.90, description="Утилизация в batch-режиме (η_batch). 0.85-0.95."
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "lambda_online": 1.0,
                "c_peak": 4,
                "sla_page": 5.0,
                "pipeline": "ocr_gpu",
                "r_ocr_gpu": 8.0,
                "eta_ocr": 0.85,
                "chars_page": 3000,
                "c_token": 3.5,
                "n_prompt_sys": 1000,
                "n_fields": 20,
                "tok_field": 50,
                "params_billions": 7,
                "bytes_per_param": 2,
                "layers_L": 32,
                "hidden_size_H": 4096,
                "gpu_mem_gb": 80,
                "gpus_per_server": 8,
                "gpu_flops_Fcount": 312,
            }
        }
    )


class OCRSizingOutput(BaseModel):
    """Результат OCR + LLM two-pass online сайзинга (Приложение И.4.2)."""

    pipeline_used: str = Field(..., description="Использованный pipeline: 'ocr_gpu' или 'ocr_cpu'")

    # ── OCR stage ──
    t_ocr: float = Field(..., description="Время OCR на страницу (сек)")
    eta_ocr_used: Optional[float] = Field(
        default=None, description="η_OCR (echo, только для ocr_gpu)"
    )
    r_ocr_used: Optional[float] = Field(
        default=None, description="R_OCR^GPU или R_OCR^core·n_cores (echo)"
    )
    n_ocr_cores_used: Optional[int] = Field(
        default=None, description="CPU-ядра OCR (только для ocr_cpu)"
    )
    n_gpu_ocr_online: int = Field(
        ..., description="GPU в OCR-пуле: ⌈C_peak·t_OCR/η_OCR⌉. 0 для ocr_cpu."
    )

    # ── LLM stage tokens ──
    l_text: float = Field(..., description="L_text = chars_page / c_token (tokens)")
    sl_pf_llm: float = Field(
        ..., description="SL_pf^LLM = L_text + N_prompt^sys"
    )
    sl_pf_llm_eff: float = Field(
        ..., description="SL_pf^LLM,eff = SL_pf · (1 − η_cache)"
    )
    sl_dec_llm: int = Field(..., description="SL_dec^LLM = N_fields · tok_field")

    # ── SLA budget split ──
    t_llm_target: float = Field(
        ..., description="t_LLM^target = SLA_page − t_OCR − T_handoff (сек)"
    )
    t_handoff_used: float = Field(..., description="T_handoff (echo)")

    # ── LLM memory & throughput ──
    model_mem_gb: float = Field(..., description="Память LLM модели")
    kv_per_session_gb: float = Field(..., description="KV-кэш на 1 страницу")
    gpus_per_instance: int = Field(..., description="GPU на инстанс LLM")
    s_tp_z: int = Field(..., description="Макс. сессий на инстанс при TP")
    instance_total_mem_gb: float = Field(..., description="GPU-память на инстанс (GiB)")
    gpu_tflops_used: float = Field(..., description="TFLOPS GPU")
    th_pf_llm: float = Field(..., description="Th_pf^LLM при BS_real* (tok/s)")
    th_dec_llm: float = Field(..., description="Th_dec^LLM при BS_real* (tok/s)")

    # ── Per-page latency ──
    t_page_llm: float = Field(
        ..., description="Per-page LLM-stage time при BS_real* (сек)"
    )
    bs_real_star: int = Field(
        ..., description="Макс. BS, удовлетворяющий t_page_llm ≤ t_LLM^target"
    )
    sla_pass: bool = Field(..., description="Все условия SLA выполнены")
    sla_failure_reason: Optional[str] = Field(
        default=None, description="Причина SLA-fail (для диагностики)"
    )

    # ── Replicas and totals ──
    n_repl_llm: int = Field(..., description="Реплики LLM: ⌈C_peak / BS_real*⌉")
    n_gpu_llm_online: int = Field(..., description="GPU в LLM-пуле")
    n_servers_llm_online: int = Field(..., description="Серверы для LLM-пула")

    n_gpu_total_online: int = Field(
        ..., description="Всего GPU: N_OCR + N_LLM"
    )
    n_servers_total_online: int = Field(
        ..., description="Всего серверов: ⌈N_GPU_total / gpus_per_server⌉"
    )

    # ── И.5 (P9c): Batch-mode outputs ──
    mode_used: Optional[str] = Field(
        default=None, description="Режим расчёта (echo): 'online', 'batch', 'combined'"
    )
    t_page_llm_at_bs_max: Optional[float] = Field(
        default=None,
        description="Время LLM-стадии при BS = BS_max (S_TP_z, без SLA), сек. "
        "Используется для batch-сайзинга LLM-пула.",
    )
    n_gpu_ocr_batch: Optional[int] = Field(
        default=None,
        description="GPU в OCR batch-пуле: ⌈D · t_OCR / (W · η_batch)⌉. "
        "0 для pipeline='ocr_cpu'. None если D/W не заданы.",
    )
    n_gpu_llm_batch: Optional[int] = Field(
        default=None,
        description="GPU в LLM batch-пуле: ⌈D · t_page_llm_at_bs_max / (W · η_batch)⌉.",
    )
    n_gpu_total_batch: Optional[int] = Field(
        default=None,
        description="Всего batch GPU: N_OCR_batch + N_LLM_batch.",
    )
    n_gpu_ocr_combined: Optional[int] = Field(
        default=None,
        description="Combined OCR-пул: max(N_OCR_online, N_OCR_batch) per И.5.",
    )
    n_gpu_llm_combined: Optional[int] = Field(
        default=None,
        description="Combined LLM-пул: max(N_LLM_online, N_LLM_batch).",
    )
    n_gpu_total_combined: Optional[int] = Field(
        default=None,
        description="Combined deployment: N_OCR_combined + N_LLM_combined. "
        "Совпадает с n_gpu_total_online при mode='online'.",
    )
    n_servers_total_combined: Optional[int] = Field(
        default=None, description="Серверы для combined deployment"
    )
    window_sufficient: Optional[bool] = Field(
        default=None,
        description="Достаточно ли W для batch-нагрузки на online-парке "
        "(И.1: проверка по LLM-стадии — она доминирует во времени).",
    )
    eta_batch_used: Optional[float] = Field(default=None, description="η_batch (echo)")
    D_pages_used: Optional[float] = Field(default=None, description="D (echo)")
    W_seconds_used: Optional[float] = Field(default=None, description="W (echo)")

    # ── Echoes ──
    sla_page_target: float = Field(..., description="SLA_page (echo)")
    c_peak_used: int = Field(..., description="C_peak (echo)")
    lambda_online_used: float = Field(..., description="λ_online (echo)")

    # ── Context ──
    gpu_id: Optional[str] = Field(None, description="ID GPU")
    gpu_mem_gb: float = Field(..., description="Память GPU (GiB)")
    gpus_per_server: int = Field(..., description="GPU на сервере")
