from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from fastapi.responses import FileResponse

from errors import NotFoundAppError, ServiceAppError, to_http_exception
from models import GPUInfo, GPUListResponse, GPURefreshResponse, GPUStats
from services.gpu_catalog_service import (
    export_gpu_catalog_path,
    get_gpu_details,
    get_gpu_stats,
    list_gpus,
    load_gpu_catalog,
)
from services.gpu_refresh_service import refresh_gpu_data_internal


def get_gpus_handler(
    vendor: str | None,
    min_memory: float | None,
    max_memory: float | None,
    min_cores: int | None,
    min_year: int | None,
    max_year: int | None,
    memory_type: str | None,
    page: int,
    per_page: int,
    search: str | None,
) -> GPUListResponse:
    """Получить список GPU с фильтрацией и пагинацией."""
    try:
        return list_gpus(
            vendor=vendor,
            min_memory=min_memory,
            max_memory=max_memory,
            min_cores=min_cores,
            min_year=min_year,
            max_year=max_year,
            memory_type=memory_type,
            page=page,
            per_page=per_page,
            search=search,
        )
    except FileNotFoundError as exc:
        raise to_http_exception(
            NotFoundAppError("GPU data not found. Run /v1/gpus/refresh first.")
        ) from exc


def export_gpu_catalog_handler() -> FileResponse:
    """Скачать нормализованный каталог GPU в формате JSON."""
    gpu_data_path = export_gpu_catalog_path()
    if not gpu_data_path.exists():
        raise to_http_exception(NotFoundAppError("GPU data not found. Run /v1/gpus/refresh first."))

    return FileResponse(
        str(gpu_data_path),
        media_type="application/json",
        filename="gpu_catalog.json",
    )


def get_gpu_details_handler(gpu_id: str) -> GPUInfo:
    """Получить детальную информацию о конкретном GPU."""
    try:
        return get_gpu_details(gpu_id)
    except FileNotFoundError as exc:
        raise to_http_exception(NotFoundAppError("GPU data not found")) from exc
    except KeyError as exc:
        raise to_http_exception(NotFoundAppError("GPU not found")) from exc


def refresh_gpu_data_handler(
    refresh_fn: Callable[[], bool] = refresh_gpu_data_internal,
) -> GPURefreshResponse:
    """Обновить каталог GPU из внешнего источника."""
    success = refresh_fn()
    if not success:
        raise to_http_exception(ServiceAppError("Failed to refresh GPU data"))

    try:
        gpu_count = len(load_gpu_catalog())
    except FileNotFoundError, ValueError, TypeError:
        gpu_count = 0

    return GPURefreshResponse(
        success=True,
        message=f"Successfully updated {gpu_count} GPUs from Wikipedia",
        gpus_updated=gpu_count,
        last_updated=datetime.now(),
    )


def get_gpu_stats_handler() -> GPUStats:
    """Получить статистику по каталогу GPU."""
    try:
        return get_gpu_stats()
    except FileNotFoundError as exc:
        raise to_http_exception(NotFoundAppError("GPU data not found")) from exc
