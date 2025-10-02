"""
Pydantic модели для AI Server Calculator API

Структура:
- sizing.py - модели для расчета серверов
- gpu.py - модели для GPU каталога
- common.py - общие модели и утилиты
"""

from .sizing import SizingInput, SizingOutput, WhatIfScenario, WhatIfRequest, WhatIfResponseItem
from .gpu import GPUInfo, GPUFilter, GPUListResponse, GPUStats, GPURefreshResponse

__all__ = [
    # Sizing models
    "SizingInput",
    "SizingOutput", 
    "WhatIfScenario",
    "WhatIfRequest",
    "WhatIfResponseItem",
    
    # GPU models
    "GPUInfo",
    "GPUFilter",
    "GPUListResponse", 
    "GPUStats",
    "GPURefreshResponse",
]

