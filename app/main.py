from __future__ import annotations

import math
import logging
import json
import pandas as pd
from datetime import datetime
from typing import List, Optional
import asyncio
import threading
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Import models from new structure
from models import (
    SizingInput, SizingOutput, WhatIfScenario, WhatIfRequest, WhatIfResponseItem,
    GPUInfo, GPUListResponse, GPUStats, GPURefreshResponse
)

logger = logging.getLogger("sizing")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


def calc_total_active(iu, pin, cin, eu, pex, cex):
    return iu * pin * cin + eu * pex * cex


def calc_tokens_per_request(P, A): return P + A


def calc_required_rps(total_active, R): return total_active * R


def calc_tokens_per_session(t, R, T): return t * R * T


def calc_model_mem_gb(params_b, bytes_per_param, overhead):
    return (params_b * 1_000_000_000 * bytes_per_param * overhead) / (1024 ** 3)


def calc_gpus_per_instance(model_mem_gb, gpu_mem_gb):
    import math;
    return max(1, math.ceil(model_mem_gb / gpu_mem_gb))


def calc_instances_per_server(gpus_per_server, gpus_per_instance):
    return max(0, gpus_per_server // gpus_per_instance)


def calc_kv_per_session_gb_no_opt(L, H, TS, bytes_state):
    return (2 * L * H * TS * bytes_state) / (1024 ** 3)


def calc_kv_per_session_gb_opt(kv_no_opt, Kopt):
    return kv_no_opt / Kopt if Kopt > 0 else kv_no_opt


def calc_kv_free_per_instance_gb(gpi, gpu_mem_gb, model_mem_gb, reserve):
    total = gpi * gpu_mem_gb * (1 - reserve);
    return max(0.0, total - model_mem_gb)


def calc_sessions_per_instance(kv_free_gb, kv_per_session_gb_opt):
    return 0 if kv_per_session_gb_opt <= 0 else max(0, int(kv_free_gb // kv_per_session_gb_opt))


def calc_servers_by_memory(total_active, sessions_per_server):
    import math
    return math.ceil(total_active / sessions_per_server) if sessions_per_server > 0 else math.inf


def calc_rps_per_instance(tps_per_instance, T):
    return 0.0 if T <= 0 else tps_per_instance / T


def calc_rps_per_server(rps_instance, instances_per_server, batching_coeff):
    return rps_instance * instances_per_server * batching_coeff


def calc_servers_by_compute(required_rps, rps_per_server, sla_reserve):
    import math
    if rps_per_server <= 0: return math.inf
    return math.ceil((required_rps / rps_per_server) * sla_reserve)


# GPU Data Management
def refresh_gpu_data_internal():
    """Внутренняя функция для обновления данных GPU"""
    try:
        logger.info("🔄 Начинаем обновление данных GPU...")
        from gpu_scraper import main as scrape_gpus
        
        # Запускаем скрапер
        scrape_gpus()
        
        logger.info("✅ Данные GPU успешно обновлены")
        return True
    except Exception as e:
        logger.error(f"❌ Ошибка при обновлении данных GPU: {e}")
        return False


def scheduled_refresh():
    """Функция для запланированного обновления"""
    logger.info("⏰ Запуск запланированного обновления GPU данных...")
    refresh_gpu_data_internal()


def start_scheduler():
    """Запуск планировщика для автоматического обновления"""
    scheduler = BackgroundScheduler()
    
    # Добавляем задачу на каждый час
    scheduler.add_job(
        func=scheduled_refresh,
        trigger=IntervalTrigger(hours=1),
        id='gpu_refresh_hourly',
        name='GPU Data Refresh Every Hour',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("📅 Планировщик запущен: обновление GPU данных каждый час")
    return scheduler


def run_sizing(inp: SizingInput) -> SizingOutput:
    total_active = calc_total_active(inp.internal_users, inp.penetration_internal, inp.concurrency_internal,
                                     inp.external_users, inp.penetration_external, inp.concurrency_external)
    T = calc_tokens_per_request(inp.prompt_tokens_P, inp.answer_tokens_A)
    required_rps = calc_required_rps(total_active, inp.rps_per_active_user_R)
    TS = calc_tokens_per_session(inp.session_duration_sec_t, inp.rps_per_active_user_R, T)
    model_mem_gb = calc_model_mem_gb(inp.params_billions, inp.bytes_per_param, inp.overhead_factor)
    gpus_per_instance = calc_gpus_per_instance(model_mem_gb, inp.gpu_mem_gb)
    instances_per_server = calc_instances_per_server(inp.gpus_per_server, gpus_per_instance)
    kv_no_opt = calc_kv_per_session_gb_no_opt(inp.layers_L, inp.hidden_size_H, TS, inp.bytes_per_kv_state)
    kv_opt = calc_kv_per_session_gb_opt(kv_no_opt, inp.paged_attention_gain_Kopt)
    kv_free = calc_kv_free_per_instance_gb(gpus_per_instance, inp.gpu_mem_gb, model_mem_gb, inp.mem_reserve_fraction)
    sessions_per_instance = calc_sessions_per_instance(kv_free, kv_opt)
    sessions_per_server = sessions_per_instance * instances_per_server
    servers_mem = calc_servers_by_memory(total_active, sessions_per_server)
    if servers_mem is math.inf:
        raise Exception("Sessions per server is zero; increase GPU memory or reduce KV/session.")
    rps_instance = calc_rps_per_instance(inp.tps_per_instance, T)
    rps_server = calc_rps_per_server(rps_instance, instances_per_server, inp.batching_coeff)
    servers_comp = calc_servers_by_compute(required_rps, rps_server, inp.sla_reserve)
    if servers_comp is math.inf:
        raise Exception("RPS per server is zero; check TPS per instance / T / instances per server.")
    servers_final = max(servers_mem, servers_comp)
    return SizingOutput(
        total_active_users=total_active,
        T_tokens_per_request=T,
        required_RPS=required_rps,
        tokens_per_session_TS=TS,
        model_mem_gb=model_mem_gb,
        gpus_per_instance=gpus_per_instance,
        instances_per_server=instances_per_server,
        kv_per_session_gb_no_opt=kv_no_opt,
        kv_per_session_gb_opt=kv_opt,
        kv_free_per_instance_gb=kv_free,
        sessions_per_instance=sessions_per_instance,
        sessions_per_server=sessions_per_server,
        servers_by_memory=servers_mem,
        rps_per_instance=rps_instance,
        rps_per_server=rps_server,
        servers_by_compute=servers_comp,
        servers_final=servers_final,
    )


app = FastAPI(
    title="GenAI Server Sizing API",
    version="2.0.0",
    description="API для расчета требований к серверной инфраструктуре для AI/LLM моделей с поддержкой GPU каталога",
    docs_url="/docs",
    redoc_url="/redoc"
)

origins = [
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальная переменная для планировщика
scheduler = None


@app.on_event("startup")
async def startup_event():
    """Событие запуска приложения"""
    global scheduler
    
    logger.info("🚀 Запуск AI Server Calculator API...")
    
    # Запускаем обновление GPU данных при старте
    logger.info("🔄 Первоначальное обновление данных GPU...")
    refresh_gpu_data_internal()
    
    # Запускаем планировщик для автоматического обновления
    scheduler = start_scheduler()
    
    logger.info("✅ Приложение успешно запущено с автоматическим обновлением GPU данных")


@app.on_event("shutdown")
async def shutdown_event():
    """Событие остановки приложения"""
    global scheduler
    
    logger.info("🛑 Остановка приложения...")
    
    if scheduler:
        scheduler.shutdown()
        logger.info("📅 Планировщик остановлен")
    
    logger.info("✅ Приложение остановлено")


@app.get("/healthz", tags=["Health"])
def healthz(): 
    return {"status": "ok"}


@app.get("/v1/scheduler/status", tags=["Health"])
def scheduler_status():
    """
    Получить статус планировщика обновления GPU данных
    
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
                    "next_run_time": str(job.next_run_time) if job.next_run_time else None
                }
                for job in jobs
            ]
        }
    else:
        return {
            "scheduler_running": False,
            "jobs_count": 0,
            "jobs": []
        }


@app.post("/v1/size", response_model=SizingOutput, tags=["Sizing"])
def size_endpoint(inp: SizingInput):
    """
    Рассчитать требования к серверам для AI/LLM модели
    
    Принимает параметры модели, пользователей и инфраструктуры,
    возвращает детальный расчет необходимых серверов.
    """
    try:
        out = run_sizing(inp)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return out


@app.post("/v1/whatif", response_model=List[WhatIfResponseItem], tags=["Sizing"])
def whatif_endpoint(req: WhatIfRequest):
    """
    Сравнить несколько сценариев расчета серверов
    
    Позволяет проанализировать "что если" сценарии с разными параметрами
    на основе базовой конфигурации.
    """
    items: List[WhatIfResponseItem] = []
    for sc in req.scenarios:
        data = req.base.dict()
        for k, v in sc.overrides.items():
            if k not in data:
                raise Exception(f"Unknown field in overrides: {k}")
            data[k] = v
        out = run_sizing(SizingInput(**data))
        items.append(WhatIfResponseItem(name=sc.name, output=out))
    return items


# GPU API Endpoints

def _get_recommended_gpus_per_server(gpu_info: dict) -> int:
    """Определить рекомендуемое количество GPU на сервер"""
    memory_gb = gpu_info.get("Memory_GB", 0)
    if memory_gb >= 80:  # A100, H100
        return 8
    elif memory_gb >= 40:  # RTX 4090, A40
        return 8
    elif memory_gb >= 24:  # RTX 4090, RTX 3090
        return 8
    elif memory_gb >= 16:  # RTX 4080, RTX 3080
        return 8
    else:
        return 4


def _get_estimated_tps(gpu_info: dict) -> float:
    """Оценить TPS на основе характеристик GPU"""
    memory_gb = gpu_info.get("Memory_GB", 0)
    cores = gpu_info.get("Cores", 0)
    vendor = gpu_info.get("Vendor", "").lower()
    
    # Базовые оценки на основе памяти и архитектуры
    if vendor == "nvidia":
        if memory_gb >= 80:  # A100, H100
            return 2000 + (cores * 0.1 if cores else 0)
        elif memory_gb >= 40:  # RTX 4090
            return 1500 + (cores * 0.05 if cores else 0)
        elif memory_gb >= 24:  # RTX 3090
            return 1000 + (cores * 0.03 if cores else 0)
        else:
            return 500 + (cores * 0.02 if cores else 0)
    elif vendor == "amd":
        if memory_gb >= 80:  # MI200 series
            return 1500 + (cores * 0.08 if cores else 0)
        elif memory_gb >= 24:  # RX 7900 XTX
            return 800 + (cores * 0.04 if cores else 0)
        else:
            return 400 + (cores * 0.02 if cores else 0)
    else:  # Intel
        return 300 + (cores * 0.01 if cores else 0)


@app.get("/v1/gpus", response_model=GPUListResponse, tags=["GPU Catalog"])
def get_gpus(
    vendor: Optional[str] = Query(None, description="Фильтр по производителю (NVIDIA, AMD, Intel). По умолчанию - все производители"),
    min_memory: Optional[float] = Query(None, ge=0, description="Минимальная память в GB"),
    max_memory: Optional[float] = Query(None, ge=0, description="Максимальная память в GB"),
    min_cores: Optional[int] = Query(None, ge=0, description="Минимальное количество ядер"),
    min_year: Optional[int] = Query(None, ge=1990, le=2030, description="Минимальный год производства"),
    max_year: Optional[int] = Query(None, ge=1990, le=2030, description="Максимальный год производства"),
    memory_type: Optional[str] = Query(None, description="Тип памяти (GDDR6, HBM, etc.)"),
    page: int = Query(1, ge=1, description="Номер страницы"),
    per_page: int = Query(20, ge=1, le=100, description="Количество элементов на странице"),
    search: Optional[str] = Query(None, description="Поиск по названию модели")
):
    """
    Получить список GPU с фильтрацией и пагинацией
    
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
    try:
        with open("gpu_data.json", "r") as f:
            gpu_data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="GPU data not found. Run /v1/gpus/refresh first.")
    
    # Фильтрация данных
    filtered_gpus = []
    for gpu_id, gpu_info in gpu_data.items():
        # Применяем фильтры
        if vendor and gpu_info.get("Vendor", "").lower() != vendor.lower():
            continue
        
        memory_gb = gpu_info.get("Memory_GB")
        if memory_gb:
            if min_memory and memory_gb < min_memory:
                continue
            if max_memory and memory_gb > max_memory:
                continue
        
        cores = gpu_info.get("Cores")
        if min_cores and cores and cores < min_cores:
            continue
        
        # Фильтрация по году
        launch_date = gpu_info.get("Launch")
        if launch_date:
            try:
                year = pd.to_datetime(launch_date).year
                if min_year and year < min_year:
                    continue
                if max_year and year > max_year:
                    continue
            except:
                pass
        
        if memory_type and gpu_info.get("Memory_Type", "").lower() != memory_type.lower():
            continue
        
        # Поиск по названию
        if search:
            model = gpu_info.get("Model", "").lower()
            if search.lower() not in model:
                continue
        
        # Создаем GPUInfo объект
        gpu = GPUInfo(
            id=gpu_id,
            vendor=gpu_info.get("Vendor", "Unknown"),
            model=gpu_info.get("Model", "Unknown"),
            memory_gb=memory_gb if memory_gb is not None else 0,
            cores=cores,
            launch_date=launch_date,
            memory_type=gpu_info.get("Memory_Type"),
            recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
            estimated_tps_per_instance=_get_estimated_tps(gpu_info)
        )
        filtered_gpus.append(gpu)
    
    # Пагинация
    total = len(filtered_gpus)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_gpus = filtered_gpus[start:end]
    
    return GPUListResponse(
        gpus=paginated_gpus,
        total=total,
        page=page,
        per_page=per_page,
        has_next=end < total,
        has_prev=page > 1
    )


@app.get("/v1/gpus/{gpu_id}", response_model=GPUInfo, tags=["GPU Catalog"])
def get_gpu_details(gpu_id: str):
    """
    Получить детальную информацию о конкретном GPU
    
    Возвращает полную информацию о GPU включая:
    - Технические характеристики
    - Рекомендации для калькулятора
    - Оценки производительности
    """
    try:
        with open("gpu_data.json", "r") as f:
            gpu_data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="GPU data not found")
    
    if gpu_id not in gpu_data:
        raise HTTPException(status_code=404, detail="GPU not found")
    
    gpu_info = gpu_data[gpu_id]
    memory_gb = gpu_info.get("Memory_GB")
    return GPUInfo(
        id=gpu_id,
        vendor=gpu_info.get("Vendor", "Unknown"),
        model=gpu_info.get("Model", "Unknown"),
        memory_gb=memory_gb if memory_gb is not None else 0,
        cores=gpu_info.get("Cores"),
        launch_date=gpu_info.get("Launch"),
        memory_type=gpu_info.get("Memory_Type"),
        recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
        estimated_tps_per_instance=_get_estimated_tps(gpu_info)
    )


@app.post("/v1/gpus/refresh", response_model=GPURefreshResponse, tags=["GPU Catalog"])
def refresh_gpu_data():
    """
    Обновить каталог GPU из Wikipedia
    
    Запускает скрапинг актуальных данных о GPU с Wikipedia.
    Процесс может занять несколько минут.
    """
    try:
        # Используем внутреннюю функцию для обновления
        success = refresh_gpu_data_internal()
        
        if success:
            # Подсчитываем количество обновленных GPU
            try:
                with open("gpu_data.json", "r") as f:
                    gpu_data = json.load(f)
                gpu_count = len(gpu_data)
            except:
                gpu_count = 0
            
            return GPURefreshResponse(
                success=True,
                message=f"Successfully updated {gpu_count} GPUs from Wikipedia",
                gpus_updated=gpu_count,
                last_updated=datetime.now()
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to refresh GPU data")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to refresh GPU data: {str(e)}")


@app.get("/v1/gpus/stats", response_model=GPUStats, tags=["GPU Catalog"])
def get_gpu_stats():
    """
    Получить статистику по каталогу GPU
    
    Возвращает аналитику по базе данных GPU:
    - Общее количество GPU
    - Распределение по производителям
    - Распределение по объему памяти
    - Распределение по годам выпуска
    """
    try:
        with open("gpu_data.json", "r") as f:
            gpu_data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="GPU data not found")
    
    # Анализ данных
    vendors = {}
    memory_ranges = {"0-4GB": 0, "4-8GB": 0, "8-16GB": 0, "16-32GB": 0, "32GB+": 0}
    year_ranges = {}
    
    for gpu_info in gpu_data.values():
        # Вендоры
        vendor = gpu_info.get("Vendor", "Unknown")
        vendors[vendor] = vendors.get(vendor, 0) + 1
        
        # Память
        memory = gpu_info.get("Memory_GB", 0)
        if memory < 4:
            memory_ranges["0-4GB"] += 1
        elif memory < 8:
            memory_ranges["4-8GB"] += 1
        elif memory < 16:
            memory_ranges["8-16GB"] += 1
        elif memory < 32:
            memory_ranges["16-32GB"] += 1
        else:
            memory_ranges["32GB+"] += 1
        
        # Годы
        launch_date = gpu_info.get("Launch")
        if launch_date:
            try:
                year = pd.to_datetime(launch_date).year
                year_range = f"{year//10*10}s"
                year_ranges[year_range] = year_ranges.get(year_range, 0) + 1
            except:
                pass
    
    return GPUStats(
        total_gpus=len(gpu_data),
        vendors=vendors,
        memory_ranges=memory_ranges,
        year_ranges=year_ranges
    )