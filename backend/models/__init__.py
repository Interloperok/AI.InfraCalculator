"""
Pydantic models for the AI Server Calculator API.

Structure:
- sizing.py - server sizing models
- gpu.py - GPU catalog models
- common.py - shared models and helpers
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
