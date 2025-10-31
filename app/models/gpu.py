from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, validator


class GPUInfo(BaseModel):
    """Информация о GPU для калькулятора серверов"""
    id: str = Field(..., description="Уникальный идентификатор GPU")
    vendor: str = Field(..., description="Производитель (NVIDIA, AMD, Intel)")
    model: str = Field(..., description="Название модели GPU")
    memory_gb: int = Field(..., description="Объем видеопамяти в GB")
    cores: Optional[int] = Field(None, description="Количество вычислительных ядер")
    launch_date: Optional[str] = Field(None, description="Дата релиза GPU")
    memory_type: Optional[str] = Field(None, description="Тип памяти (GDDR6, HBM, etc.)")
    recommended_gpus_per_server: int = Field(
        default=8,
        description="Рекомендуемое количество GPU на сервер",
        ge=1, le=16
    )
    estimated_tps_per_instance: float = Field(
        default=1000,
        description="Оценка токенов в секунду на инстанс",
        gt=0
    )
    # Новые поля для отображения
    full_name: Optional[str] = Field(None, description="Полное название модели GPU (Vendor + Model)")
    tdp_watts: Optional[str] = Field(None, description="Тепловой пакет (TDP) в ваттах")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "NVIDIA_RTX_4090",
                "vendor": "NVIDIA",
                "model": "GeForce RTX 4090",
                "memory_gb": 24.0,
                "cores": 16384,
                "launch_date": "2022-10-12",
                "memory_type": "GDDR6X",
                "recommended_gpus_per_server": 8,
                "estimated_tps_per_instance": 1500.0,
                "full_name": "NVIDIA GeForce RTX 4090",
                "memory_size_formatted": "24 GB",
                "tdp_watts": "450 W"
            }
        }


class GPUFilter(BaseModel):
    """Фильтры для поиска GPU"""
    vendor: Optional[str] = Field(None, description="Фильтр по производителю")
    min_memory_gb: Optional[float] = Field(None, ge=0, description="Минимальная память в GB")
    max_memory_gb: Optional[float] = Field(None, ge=0, description="Максимальная память в GB")
    min_cores: Optional[int] = Field(None, ge=0, description="Минимальное количество ядер")
    min_year: Optional[int] = Field(None, ge=1990, le=2030, description="Минимальный год производства")
    max_year: Optional[int] = Field(None, ge=1990, le=2030, description="Максимальный год производства")
    memory_type: Optional[str] = Field(None, description="Тип памяти")
    
    @validator('max_memory_gb')
    def max_memory_greater_than_min(cls, v, values):
        if v is not None and 'min_memory_gb' in values and values['min_memory_gb'] is not None:
            if v < values['min_memory_gb']:
                raise ValueError('max_memory_gb must be greater than min_memory_gb')
        return v
    
    @validator('max_year')
    def max_year_greater_than_min(cls, v, values):
        if v is not None and 'min_year' in values and values['min_year'] is not None:
            if v < values['min_year']:
                raise ValueError('max_year must be greater than min_year')
        return v


class GPUListResponse(BaseModel):
    """Ответ со списком GPU с пагинацией"""
    gpus: List[GPUInfo] = Field(..., description="Список найденных GPU")
    total: int = Field(..., description="Общее количество найденных GPU")
    page: int = Field(..., description="Номер текущей страницы")
    per_page: int = Field(..., description="Количество элементов на странице")
    has_next: bool = Field(..., description="Есть ли следующая страница")
    has_prev: bool = Field(..., description="Есть ли предыдущая страница")
    
    class Config:
        json_schema_extra = {
            "example": {
                "gpus": [
                    {
                        "id": "NVIDIA_RTX_4090",
                        "vendor": "NVIDIA",
                        "model": "GeForce RTX 4090",
                        "memory_gb": 24.0,
                        "cores": 16384,
                        "launch_date": "2022-10-12",
                        "memory_type": "GDDR6X",
                        "recommended_gpus_per_server": 8,
                        "estimated_tps_per_instance": 1500.0
                    }
                ],
                "total": 1,
                "page": 1,
                "per_page": 20,
                "has_next": False,
                "has_prev": False
            }
        }


class GPUStats(BaseModel):
    """Статистика по базе данных GPU"""
    total_gpus: int = Field(..., description="Общее количество GPU в базе")
    vendors: dict = Field(..., description="Распределение по производителям")
    memory_ranges: dict = Field(..., description="Распределение по объему памяти")
    year_ranges: dict = Field(..., description="Распределение по годам выпуска")
    
    class Config:
        json_schema_extra = {
            "example": {
                "total_gpus": 150,
                "vendors": {"NVIDIA": 80, "AMD": 50, "Intel": 20},
                "memory_ranges": {"8-16GB": 60, "16-32GB": 40, "32GB+": 10},
                "year_ranges": {"2020s": 100, "2010s": 50}
            }
        }


class GPURefreshResponse(BaseModel):
    """Ответ на обновление данных GPU"""
    success: bool = Field(..., description="Успешность операции обновления")
    message: str = Field(..., description="Сообщение о результате операции")
    gpus_updated: int = Field(..., description="Количество обновленных GPU")
    last_updated: datetime = Field(..., description="Время последнего обновления")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Successfully updated 150 GPUs from Wikipedia",
                "gpus_updated": 150,
                "last_updated": "2024-01-15T10:30:00Z"
            }
        }
