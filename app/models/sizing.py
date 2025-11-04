from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field, conint, confloat, validator


class SizingInput(BaseModel):
    """Входные параметры для расчета серверов"""
    
    # Users & behavior
    internal_users: conint(ge=0) = Field(..., description="Количество внутренних пользователей")
    penetration_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэффициент проникновения внутренних пользователей (0-1)")
    concurrency_internal: confloat(ge=0.0, le=1.0) = Field(..., description="Коэффициент одновременности внутренних пользователей (0-1)")
    external_users: conint(ge=0) = Field(default=0, description="Количество внешних пользователей")
    penetration_external: confloat(ge=0.0, le=1.0) = Field(default=0.0, description="Коэффициент проникновения внешних пользователей (0-1)")
    concurrency_external: confloat(ge=0.0, le=1.0) = Field(default=0.0, description="Коэффициент одновременности внешних пользователей (0-1)")

    # Tokens & sessions
    prompt_tokens_P: confloat(gt=0) = Field(..., description="Количество токенов во вводе")
    answer_tokens_A: confloat(ge=0) = Field(..., description="Количество токенов в ответе")
    rps_per_active_user_R: confloat(gt=0) = Field(..., description="Запросов в секунду на активного пользователя")
    session_duration_sec_t: confloat(gt=0) = Field(..., description="Длительность сессии в секундах")

    # Model & KV
    params_billions: confloat(gt=0) = Field(..., description="Количество параметров модели в миллиардах")
    bytes_per_param: confloat(gt=0) = Field(..., description="Байт на параметр (1, 2, 4)")
    overhead_factor: confloat(ge=1.0) = Field(..., description="Коэффициент накладных расходов")
    layers_L: conint(gt=0) = Field(..., description="Количество слоев модели")
    hidden_size_H: conint(gt=0) = Field(..., description="Размер скрытого состояния")
    bytes_per_kv_state: confloat(gt=0) = Field(..., description="Байт на состояние KV-кэша")
    paged_attention_gain_Kopt: confloat(ge=1.0) = Field(..., description="Коэффициент оптимизации Paged Attention")

    # Hardware        
    gpu_mem_gb: confloat(gt=0) = Field(..., description="Память GPU в GB")
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU")
    gpus_per_server: conint(gt=0) = Field(..., description="Количество GPU на сервере")
    mem_reserve_fraction: confloat(ge=0.0, lt=1.0) = Field(default=0.07, description="Доля резервируемой памяти (0-1)")

    # Empirics
    tps_per_instance: confloat(gt=0) = Field(..., description="Токенов в секунду на инстанс")
    batching_coeff: confloat(gt=0) = Field(default=1.2, description="Коэффициент батчинга")
    sla_reserve: confloat(gt=0) = Field(default=1.25, description="SLA резерв")
    
    class Config:
        json_schema_extra = {
            "example": {
                "internal_users": 1000,
                "penetration_internal": 0.6,
                "concurrency_internal": 0.2,
                "external_users": 0,
                "penetration_external": 0.0,
                "concurrency_external": 0.0,
                "prompt_tokens_P": 300,
                "answer_tokens_A": 700,
                "rps_per_active_user_R": 0.02,
                "session_duration_sec_t": 120,
                "params_billions": 7,
                "bytes_per_param": 2,
                "overhead_factor": 1.2,
                "layers_L": 32,
                "hidden_size_H": 4096,
                "bytes_per_kv_state": 2,
                "paged_attention_gain_Kopt": 2.5,
                "gpu_mem_gb": 80,
                "gpus_per_server": 8,
                "mem_reserve_fraction": 0.07,
                "tps_per_instance": 250,
                "batching_coeff": 1.2,
                "sla_reserve": 1.25
            }
        }


class SizingOutput(BaseModel):
    """Результат расчета серверов"""
    
    total_active_users: float = Field(..., description="Общее количество активных пользователей")
    T_tokens_per_request: float = Field(..., description="Токенов на запрос")
    required_RPS: float = Field(..., description="Требуемый RPS")
    tokens_per_session_TS: float = Field(..., description="Токенов за сессию")
    model_mem_gb: float = Field(..., description="Память модели в GB")
    gpus_per_instance: int = Field(..., description="GPU на инстанс")
    instances_per_server: int = Field(..., description="Инстансов на сервер")
    kv_per_session_gb_no_opt: float = Field(..., description="KV-кэш за сессию без оптимизации (GB)")
    kv_per_session_gb_opt: float = Field(..., description="KV-кэш за сессию с оптимизацией (GB)")
    kv_free_per_instance_gb: float = Field(..., description="Свободная память для KV на инстанс (GB)")
    sessions_per_instance: int = Field(..., description="Сессий на инстанс")
    sessions_per_server: int = Field(..., description="Сессий на сервер")
    servers_by_memory: int = Field(..., description="Серверов по памяти")
    rps_per_instance: float = Field(..., description="RPS на инстанс")
    rps_per_server: float = Field(..., description="RPS на сервер")
    servers_by_compute: int = Field(..., description="Серверов по вычислениям")
    servers_final: int = Field(..., description="Итоговое количество серверов")
    # Поля, переданные в исходных данных для контекста
    gpu_id: Optional[str] = Field(None, description="ID выбранной GPU (из входных данных)")
    gpu_mem_gb: float = Field(..., description="Память GPU в GB (из входных данных)")
    mem_reserve_fraction: float = Field(..., description="Доля резервируемой памяти (0-1) (из входных данных)")
    # Рассчитанные показатели
    throughput: float = Field(..., description="Приблизительный throughput (tokens/second)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "total_active_users": 120.0,
                "T_tokens_per_request": 1000.0,
                "required_RPS": 2.4,
                "tokens_per_session_TS": 240000.0,
                "model_mem_gb": 13.44,
                "gpus_per_instance": 1,
                "instances_per_server": 8,
                "kv_per_session_gb_no_opt": 0.5,
                "kv_per_session_gb_opt": 0.2,
                "kv_free_per_instance_gb": 66.56,
                "sessions_per_instance": 332,
                "sessions_per_server": 2656,
                "servers_by_memory": 1,
                "rps_per_instance": 0.25,
                "rps_per_server": 2.0,
                "servers_by_compute": 2,
                "servers_final": 2
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
                    "external_users": 0,
                    "penetration_external": 0.0,
                    "concurrency_external": 0.0,
                    "prompt_tokens_P": 300,
                    "answer_tokens_A": 700,
                    "rps_per_active_user_R": 0.02,
                    "session_duration_sec_t": 120,
                    "params_billions": 7,
                    "bytes_per_param": 2,
                    "overhead_factor": 1.2,
                    "layers_L": 32,
                    "hidden_size_H": 4096,
                    "bytes_per_kv_state": 2,
                    "paged_attention_gain_Kopt": 2.5,
                    "gpu_mem_gb": 80,
                    "gpus_per_server": 8,
                    "mem_reserve_fraction": 0.07,
                    "tps_per_instance": 250,
                    "batching_coeff": 1.2,
                    "sla_reserve": 1.25
                },
                "scenarios": [
                    {
                        "name": "Double users",
                        "overrides": {"internal_users": 2000}
                    },
                    {
                        "name": "Bigger model", 
                        "overrides": {"params_billions": 13}
                    }
                ]
            }
        }


class WhatIfResponseItem(BaseModel):
    """Элемент ответа для анализа сценариев"""
    
    name: str = Field(..., description="Название сценария")
    output: SizingOutput = Field(..., description="Результат расчета")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Double users",
                "output": {
                    "total_active_users": 240.0,
                    "T_tokens_per_request": 1000.0,
                    "required_RPS": 4.8,
                    "tokens_per_session_TS": 240000.0,
                    "model_mem_gb": 13.44,
                    "gpus_per_instance": 1,
                    "instances_per_server": 8,
                    "kv_per_session_gb_no_opt": 0.5,
                    "kv_per_session_gb_opt": 0.2,
                    "kv_free_per_instance_gb": 66.56,
                    "sessions_per_instance": 332,
                    "sessions_per_server": 2656,
                    "servers_by_memory": 1,
                    "rps_per_instance": 0.25,
                    "rps_per_server": 2.0,
                    "servers_by_compute": 3,
                    "servers_final": 3
                }
            }
        }

