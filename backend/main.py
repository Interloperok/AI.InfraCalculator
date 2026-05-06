from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from logging_config import configure_logger

from api.gpu_handlers import (
    export_gpu_catalog_handler,
    get_gpu_details_handler,
    get_gpu_stats_handler,
    get_gpus_handler,
    refresh_gpu_data_handler,
)
from api.sizing_handlers import (
    auto_optimize_endpoint_handler,
    report_endpoint_handler,
    size_endpoint_handler,
    vlm_size_endpoint_handler,
    whatif_endpoint_handler,
)
from models import (
    AutoOptimizeInput,
    AutoOptimizeResponse,
    GPUInfo,
    GPUListResponse,
    GPURefreshResponse,
    GPUStats,
    SizingInput,
    SizingOutput,
    VLMSizingInput,
    VLMSizingOutput,
    WhatIfRequest,
    WhatIfResponseItem,
)
from settings import get_settings
from services.gpu_refresh_service import refresh_gpu_data_internal, start_scheduler
from services.sizing_service import run_sizing
from services.vlm_sizing_service import run_vlm_sizing

# Модуль расчета мощностей для развертывания LLM (Методика v2)
#
# Методика расчета основана на документе:
# «Методика расчета количества серверов и GPU для LLM-inference решений»
#
# Расчет выполняется по двум независимым ограничениям:
# 1. По памяти GPU (веса модели и KV-кэш) — разделы 3-5
# 2. По вычислительной пропускной способности (tokens/sec, requests/sec) — раздел 6
# Итоговое количество серверов = max(серверы_по_памяти, серверы_по_compute)

logger = configure_logger("sizing")


# Точка композиции приложения:
# - бизнес-логика вынесена в services/*
# - HTTP-обработчики вынесены в api/*

# Глобальная переменная для планировщика
scheduler: Optional[BackgroundScheduler] = None


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Lifespan-хук приложения вместо устаревших startup/shutdown событий."""
    global scheduler
    settings = get_settings()

    logger.info("🚀 Запуск AI Server Calculator API...")

    # При старте: скрапим только если gpu_data.json не существует.
    # Если файл уже есть — используем его как есть.
    # Обновление по расписанию или вручную через /v1/gpus/refresh.
    if not settings.gpu_data_path.exists():
        logger.info("🔄 Файл gpu_data.json не найден, запускаем первичный скрапинг...")
        refresh_gpu_data_internal()
    else:
        logger.info("📂 Используем существующий gpu_data.json")

    if settings.disable_scheduler:
        logger.info("⏸️ Планировщик отключен через AI_SC_DISABLE_SCHEDULER=1")
        scheduler = None
    else:
        scheduler = start_scheduler()

    logger.info("✅ Приложение успешно запущено с автоматическим обновлением GPU данных")

    try:
        yield
    finally:
        logger.info("🛑 Остановка приложения...")

        if scheduler:
            scheduler.shutdown()
            logger.info("📅 Планировщик остановлен")

        logger.info("✅ Приложение остановлено")


app = FastAPI(
    title="GenAI Server Sizing API",
    version="2.0.0",
    description="API для расчета требований к серверной инфраструктуре для AI/LLM моделей с поддержкой GPU каталога",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["Health"])
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/scheduler/status", tags=["Health"])
def scheduler_status() -> dict:
    """
    Получить статус планировщика обновления GPU данных.

    Возвращает информацию о состоянии автоматического обновления.
    """
    global scheduler

    if scheduler and scheduler.running:
        jobs = scheduler.get_jobs()
        return {
            "scheduler_running": True,
            "jobs_count": len(jobs),
            "jobs": [
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run_time": str(job.next_run_time) if job.next_run_time else None,
                }
                for job in jobs
            ],
        }

    return {
        "scheduler_running": False,
        "jobs_count": 0,
        "jobs": [],
    }


@app.post("/v1/size", response_model=SizingOutput, tags=["Sizing"])
def size_endpoint(inp: SizingInput) -> SizingOutput:
    """
    Рассчитать требования к серверам для AI/LLM модели.

    Принимает параметры модели, пользователей и инфраструктуры,
    возвращает детальный расчет необходимых серверов.
    """
    return size_endpoint_handler(inp, run_sizing_fn=run_sizing)


@app.post("/v1/size-vlm", response_model=VLMSizingOutput, tags=["VLM/OCR"])
def size_vlm_endpoint(inp: VLMSizingInput) -> VLMSizingOutput:
    """
    VLM single-pass online сайзинг (Приложение И.4.1).

    Принимает параметры VLM-нагрузки (изображение, поля JSON, SLA на страницу),
    возвращает реплики, GPU и серверы. Находит максимальный BS_real,
    удовлетворяющий SLA_page, и рассчитывает N_repl_VLM = ⌈C_peak / BS_real*⌉.
    """
    return vlm_size_endpoint_handler(inp, run_vlm_sizing_fn=run_vlm_sizing)


# ═══════════════════════════════════════════════════════════
# Генерация Excel-отчета
# ═══════════════════════════════════════════════════════════


@app.post("/v1/report", tags=["Sizing"])
def report_endpoint(inp: SizingInput):
    """
    Скачать Excel-отчёт по шаблону.

    Принимает те же параметры, что и /v1/size. Заполняет шаблон
    reportTemplate.xlsx входными значениями и возвращает файл .xlsx.
    Формулы пересчитываются при открытии файла в Excel.
    """
    return report_endpoint_handler(inp)


@app.post("/v1/whatif", response_model=list[WhatIfResponseItem], tags=["Sizing"])
def whatif_endpoint(req: WhatIfRequest) -> list[WhatIfResponseItem]:
    """
    Сравнить несколько сценариев расчета серверов.

    Позволяет проанализировать "что если" сценарии с разными параметрами
    на основе базовой конфигурации.
    """
    return whatif_endpoint_handler(req, run_sizing_fn=run_sizing)


@app.post("/v1/auto-optimize", response_model=AutoOptimizeResponse, tags=["Sizing"])
def auto_optimize_endpoint(inp: AutoOptimizeInput) -> AutoOptimizeResponse:
    """
    Автоматический подбор оптимальной конфигурации.

    Перебирает комбинации GPU, TP Degree, GPUs/Server, квантизации
    и возвращает top-N наилучших конфигураций по выбранному режиму.
    """
    return auto_optimize_endpoint_handler(inp)


@app.get("/v1/gpus", response_model=GPUListResponse, tags=["GPU Catalog"])
def get_gpus(
    vendor: Optional[str] = Query(
        None,
        description="Фильтр по производителю (NVIDIA, AMD, Intel). По умолчанию - все производители",
    ),
    min_memory: Optional[float] = Query(None, ge=0, description="Минимальная память в GB"),
    max_memory: Optional[float] = Query(None, ge=0, description="Максимальная память в GB"),
    min_cores: Optional[int] = Query(None, ge=0, description="Минимальное количество ядер"),
    min_year: Optional[int] = Query(
        None, ge=1990, le=2030, description="Минимальный год производства"
    ),
    max_year: Optional[int] = Query(
        None, ge=1990, le=2030, description="Максимальный год производства"
    ),
    memory_type: Optional[str] = Query(None, description="Тип памяти (GDDR6, HBM, etc.)"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(20, ge=1, le=100, description="Количество элементов на странице"),
    search: Optional[str] = Query(None, description="Поиск по названию модели"),
) -> GPUListResponse:
    """
    Получить список GPU с фильтрацией и пагинацией.

    Поддерживает фильтрацию по:
    - Производителю (NVIDIA, AMD, Intel) - по умолчанию все производители
    - Объему памяти (min_memory, max_memory)
    - Количеству ядер (min_cores)
    - Году выпуска (min_year, max_year)
    - Типу памяти (GDDR6, HBM, etc.)
    - Поиск по названию модели

    Примеры запросов:
    - /v1/gpus - все GPU от всех производителей
    - /v1/gpus?vendor=NVIDIA - только NVIDIA GPU
    - /v1/gpus?min_memory=16&max_memory=32 - GPU с памятью 16-32 GB
    - /v1/gpus?min_year=2020&vendor=AMD - AMD GPU с 2020 года
    """
    return get_gpus_handler(
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


@app.get("/v1/gpus/export", tags=["GPU Catalog"])
def export_gpu_catalog():
    """
    Скачать нормализованный каталог GPU в формате JSON.

    Возвращает полный каталог gpu_data.json для скачивания.
    Пользователь может отредактировать файл и загрузить обратно
    через custom_gpu_catalog в auto-optimize запросе.
    """
    return export_gpu_catalog_handler()


@app.get("/v1/gpus/{gpu_id}", response_model=GPUInfo, tags=["GPU Catalog"])
def get_gpu_details(gpu_id: str) -> GPUInfo:
    """
    Получить детальную информацию о конкретном GPU.

    Возвращает полную информацию о GPU включая:
    - Технические характеристики
    - Рекомендации для калькулятора
    - Оценки производительности
    """
    return get_gpu_details_handler(gpu_id)


@app.post("/v1/gpus/refresh", response_model=GPURefreshResponse, tags=["GPU Catalog"])
def refresh_gpu_data() -> GPURefreshResponse:
    """
    Обновить каталог GPU из Wikipedia.

    Запускает скрапинг актуальных данных о GPU с Wikipedia.
    Процесс может занять несколько минут.
    """
    return refresh_gpu_data_handler(refresh_fn=refresh_gpu_data_internal)


@app.get("/v1/gpus/stats", response_model=GPUStats, tags=["GPU Catalog"])
def get_gpu_stats() -> GPUStats:
    """
    Получить статистику по каталогу GPU.

    Возвращает аналитику по базе данных GPU:
    - Общее количество GPU
    - Распределение по производителям
    - Распределение по объему памяти
    - Распределение по годам выпуска
    """
    return get_gpu_stats_handler()
