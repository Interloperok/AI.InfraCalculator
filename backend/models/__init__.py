"""
Pydantic модели для AI Server Calculator API

Структура:
- sizing.py - модели для расчета серверов
- gpu.py - модели для GPU каталога
- common.py - общие модели и утилиты
"""

from .sizing import (
    SizingInput,
    SizingOutput,
    OCRDocClass,
    OCRSizingInput,
    OCRSizingOutput,
    VLMDocClass,
    VLMSizingInput,
    VLMSizingOutput,
    WhatIfScenario,
    WhatIfRequest,
    WhatIfResponseItem,
    OptimizationMode,
    AutoOptimizeInput,
    AutoOptimizeResult,
    AutoOptimizeResponse,
)
from .gpu import GPUInfo, GPUFilter, GPUListResponse, GPUStats, GPURefreshResponse
from .llm import LLMInfo, LLMListResponse

__all__ = [
    # Sizing models
    "SizingInput",
    "SizingOutput",
    "OCRDocClass",
    "OCRSizingInput",
    "OCRSizingOutput",
    "VLMDocClass",
    "VLMSizingInput",
    "VLMSizingOutput",
    "WhatIfScenario",
    "WhatIfRequest",
    "WhatIfResponseItem",
    # Auto-Optimize models
    "OptimizationMode",
    "AutoOptimizeInput",
    "AutoOptimizeResult",
    "AutoOptimizeResponse",
    # GPU models
    "GPUInfo",
    "GPUFilter",
    "GPUListResponse",
    "GPUStats",
    "GPURefreshResponse",
    # LLM catalog models
    "LLMInfo",
    "LLMListResponse",
]
