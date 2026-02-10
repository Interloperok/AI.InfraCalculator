from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field, conint, confloat


class SizingInput(BaseModel):
    """Входные параметры для расчета серверов (Методика v2)

    Соответствует документу: «Методика расчета количества серверов и GPU для LLM-inference решений»
    """

    # ── Section 2.1: Users & behavior ──
    internal_users: conint(ge=0) = Field(..., description="Количество внутренних пользователей (Nusers)")
    penetration_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэф. проникновения внутр. (Kpen)")
    concurrency_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэф. одновременности внутр. (Ksim)")
    external_users: conint(ge=0) = Field(default=0, description="Количество внешних пользователей")
    penetration_external: confloat(ge=0.0, le=1.0) = Field(default=0.0, description="Коэф. проникновения внешн.")
    concurrency_external: confloat(ge=0.0, le=1.0) = Field(default=0.0, description="Коэф. одновременности внешн.")
    sessions_per_user_J: confloat(gt=0) = Field(default=1, description="Кол-во одновременных сессий на пользователя (J)")

    # ── Section 2.2: Tokens ──
    system_prompt_tokens_SP: confloat(ge=0) = Field(default=1000, description="Токены системного промпта (SP)")
    user_prompt_tokens_Prp: confloat(ge=0) = Field(default=200, description="Токены запроса пользователя (Prp)")
    reasoning_tokens_MRT: confloat(ge=0) = Field(default=4096, description="Бюджет токенов на рассуждения (MRT). Если модель не использует — 0")
    answer_tokens_A: confloat(ge=0) = Field(default=400, description="Токены ответа модели (A)")
    dialog_turns: conint(gt=0) = Field(default=5, description="Кол-во сообщений в диалоге для оценки длины сессии")

    # ── Section 3.1: Model ──
    params_billions: confloat(gt=0) = Field(..., description="Параметры модели в миллиардах (P)")
    bytes_per_param: confloat(gt=0) = Field(..., description="Байт на параметр (Bquant): FP8→1, FP16→2, FP32→4")
    overhead_factor: confloat(ge=1.0) = Field(default=1.15, description="Коэф. накладных расходов (Koverhead, 1.1-1.2)")
    emp_model: confloat(ge=1.0) = Field(default=1.0, description="Коэф. поправки на практич. память модели (EMPmodel, 1.0-1.15)")
    layers_L: conint(gt=0) = Field(..., description="Число слоёв модели (L)")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния (H)")

    # ── Section 3.2: KV-cache ──
    bytes_per_kv_state: confloat(gt=0) = Field(default=2, description="Байт на значение KV (Bstate): FP8→1, FP16→2, FP32→4")
    emp_kv: confloat(ge=1.0) = Field(default=1.0, description="Коэф. поправки на практич. KV-кэш (EMPkv, 1.0-1.2)")
    max_context_window_TSmax: conint(gt=0) = Field(..., description="Макс. контекстное окно модели (TSmax)")

    # ── Section 4: Hardware & TP ──
    gpu_mem_gb: confloat(gt=0) = Field(..., description="Память GPU в GiB (GPUmemory)")
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU из каталога")
    gpus_per_server: conint(gt=0) = Field(..., description="GPU на сервере (GPUcount_server)")
    kavail: confloat(gt=0.0, le=1.0) = Field(default=0.9, description="Коэф. доступной памяти GPU (Kavail, рек. 0.9)")
    tp_multiplier_Z: conint(ge=1) = Field(default=1, description="Множитель Tensor Parallelism (Z): 1,2,4…")
    saturation_coeff_C: confloat(gt=0) = Field(default=8.0, description="Коэф. насыщения от батча (C = tfix/tlin, прикидка 4-16)")

    # ── Section 6: Compute ──
    gpu_flops_Fcount: Optional[confloat(gt=0)] = Field(None, description="Пиковые TFLOPS одного GPU (напр. 312 для A100)")
    eta_prefill: confloat(gt=0.0, le=1.0) = Field(default=0.20, description="Эффективность prefill (η_pf, 0.15-0.30)")
    eta_decode: confloat(gt=0.0, le=1.0) = Field(default=0.15, description="Эффективность decode (η_dec, 0.10-0.25)")
    th_prefill_empir: Optional[confloat(gt=0)] = Field(None, description="Эмпирич. throughput prefill (tokens/sec)")
    th_decode_empir: Optional[confloat(gt=0)] = Field(None, description="Эмпирич. throughput decode (tokens/sec)")

    # ── Section 6.4: SLA ──
    rps_per_session_R: confloat(gt=0) = Field(default=0.02, description="Запросов/сек на сессию (R, чат ≈ 0.017-0.033)")
    sla_reserve_KSLA: confloat(gt=0) = Field(default=1.25, description="Коэф. запаса для SLA (KSLA, 1.25-2.0)")

    class Config:
        json_schema_extra = {
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
                "overhead_factor": 1.15,
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
                "sla_reserve_KSLA": 1.25
            }
        }


class SizingOutput(BaseModel):
    """Результат расчета серверов (Методика v2)"""

    # ── Section 2: Load ──
    Ssim_concurrent_sessions: float = Field(..., description="Пиковое кол-во одновременных сессий (Ssim)")
    T_tokens_per_request: float = Field(..., description="Токены на запрос: SP + Prp + MRT + A")

    # ── Section 3: Memory ──
    model_mem_gb: float = Field(..., description="Память модели (Mmodel, GiB)")
    TS_session_context: float = Field(..., description="Прикидочная длина контекста сессии в токенах (TS)")
    SL_sequence_length: float = Field(..., description="Длина последовательности (SL = min(TS, TSmax))")
    kv_per_session_gb: float = Field(..., description="KV-кэш на 1 сессию (MKV_s1, GiB)")

    # ── Section 4: GPU & TP ──
    gpus_per_instance: int = Field(..., description="GPU на 1 экземпляр модели (GPUcount_model)")
    instances_per_server: int = Field(..., description="Экземпляров модели на сервер без TP (Ncount_model)")
    kv_free_per_instance_gb: float = Field(..., description="Свободная память для KV на 1 экземпляр (GiB)")
    S_TP_base: int = Field(..., description="Макс. парал. сессий при базовом TP (S_TP=GPUcount_model)")
    S_TP_z: int = Field(..., description="Макс. парал. сессий при Z×TP (S_TP=Z*GPUcount_model)")
    Kbatch: float = Field(..., description="Коэф. повышения пропускной способности (Kbatch)")
    instance_total_mem_gb: float = Field(..., description="Полная GPU-память на инстанс с TP (Z×GPUcount_model×GPUmem, GiB)")
    kv_free_per_instance_tp_gb: float = Field(..., description="Свободная память для KV на инстанс с TP (GiB)")

    # ── Section 5: Servers by memory ──
    instances_per_server_tp: int = Field(..., description="Экземпляров модели на сервер с TP (NcountTP_model)")
    sessions_per_server: int = Field(..., description="Сессий на сервер (Sserver)")
    servers_by_memory: int = Field(..., description="Серверов по памяти (Servers_mem)")

    # ── Section 6: Compute ──
    gpu_tflops_used: float = Field(..., description="TFLOPS одного GPU (Half Precision / Tensor Core), использованные в расчёте")
    Fcount_model_tflops: float = Field(..., description="Суммарные TFLOPS на 1 экземпляр модели (gpu_tflops × GPUcount_model)")
    FPS_flops_per_token: float = Field(..., description="FLOP на 1 токен (FPS = 2·P·10⁹)")
    Tdec_tokens: float = Field(..., description="Токены decode фазы (Tdec = A + MRT)")
    th_prefill: float = Field(..., description="Throughput prefill (tokens/sec)")
    th_decode: float = Field(..., description="Throughput decode (tokens/sec)")
    Cmodel_rps: float = Field(..., description="Запросов/сек на 1 экземпляр модели (Cmodel)")
    th_server_comp: float = Field(..., description="Пропускная способность сервера (req/sec)")
    servers_by_compute: int = Field(..., description="Серверов по вычислениям (Servers_comp)")

    # ── Section 7: Final ──
    servers_final: int = Field(..., description="Итоговое количество серверов")

    # ── Context ──
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU")
    gpu_mem_gb: float = Field(..., description="Память GPU (GiB)")
    gpus_per_server: int = Field(..., description="GPU на сервере (GPUcount_server)")

    class Config:
        json_schema_extra = {
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
                "gpus_per_server": 8
            }
        }


class WhatIfScenario(BaseModel):
    """Сценарий для анализа 'что если'"""

    name: str = Field(..., description="Название сценария")
    overrides: dict = Field(default_factory=dict, description="Переопределения параметров")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Double users",
                "overrides": {
                    "internal_users": 2000
                }
            }
        }


class WhatIfRequest(BaseModel):
    """Запрос для анализа сценариев"""

    base: SizingInput = Field(..., description="Базовые параметры")
    scenarios: List[WhatIfScenario] = Field(..., description="Список сценариев")

    class Config:
        json_schema_extra = {
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
                    "overhead_factor": 1.15,
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
                    "sla_reserve_KSLA": 1.25
                },
                "scenarios": [
                    {
                        "name": "Double users",
                        "overrides": {"internal_users": 2000}
                    },
                    {
                        "name": "Bigger model 13B",
                        "overrides": {"params_billions": 13}
                    }
                ]
            }
        }


class WhatIfResponseItem(BaseModel):
    """Элемент ответа для анализа сценариев"""

    name: str = Field(..., description="Название сценария")
    output: SizingOutput = Field(..., description="Результат расчета")
