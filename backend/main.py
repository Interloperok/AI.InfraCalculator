from __future__ import annotations

import math
import logging
import json
import os
import re
import io

import pandas as pd
from datetime import datetime
from typing import List, Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

# Import models from new structure
from models import (
    SizingInput, SizingOutput, WhatIfScenario, WhatIfRequest, WhatIfResponseItem,
    GPUInfo, GPUListResponse, GPUStats, GPURefreshResponse,
    OptimizationMode, AutoOptimizeInput, AutoOptimizeResult, AutoOptimizeResponse,
)
from core.sizing_math import (
    calc_Cmodel,
    calc_FPS,
    calc_Kbatch,
    calc_S_TP,
    calc_SL,
    calc_Ssim,
    calc_T,
    calc_Tdec,
    calc_e2e_latency,
    calc_generation_time,
    calc_gpus_per_instance,
    calc_instances_per_server,
    calc_instances_per_server_tp,
    calc_kv_free_per_instance_gb,
    calc_kv_per_session_gb,
    calc_model_mem_gb,
    calc_servers_by_compute,
    calc_servers_by_memory,
    calc_session_context_TS,
    calc_sessions_per_server,
    calc_th_decode_analyt,
    calc_th_prefill_analyt,
    calc_th_server_comp,
    calc_ttft,
)
from report_generator import ReportGenerator

# Модуль расчета мощностей для развертывания LLM (Методика v2)
#
# Методика расчета основана на документе:
# «Методика расчета количества серверов и GPU для LLM-inference решений»
#
# Расчет выполняется по двум независимым ограничениям:
# 1. По памяти GPU (веса модели и KV-кэш) — разделы 3-5
# 2. По вычислительной пропускной способности (tokens/sec, requests/sec) — раздел 6
# Итоговое количество серверов = max(серверы_по_памяти, серверы_по_compute)

logger = logging.getLogger("sizing")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


# Core sizing math formulas are imported from `core/sizing_math.py`.


# GPU Data Management
def refresh_gpu_data_internal():
    """Внутренняя функция для обновления данных GPU.

    Pipeline: gpu_scraper (merge) -> gpu_data_raw.json -> gpu_normalizer -> gpu_data.json

    Scraper uses merge strategy: existing entries are preserved, new ones added,
    existing ones updated. No data loss even if a partial scrape occurs.
    """
    import sys
    import io
    try:
        logger.info("Начинаем обновление данных GPU...")

        raw_path = os.path.join(os.path.dirname(__file__), "gpu_data_raw.json")
        out_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")

        # На Windows stdout может не поддерживать UTF-8 emoji из скрапера.
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            from gpu_scraper import main as scrape_gpus
            scrape_gpus()  # merges into gpu_data_raw.json
        finally:
            sys.stdout = old_stdout

        logger.info("Скрапинг завершён, запускаем нормализацию...")

        from gpu_normalizer import normalize as normalize_gpu_data
        normalize_gpu_data(raw_path, out_path)

        logger.info("Данные GPU успешно обновлены и нормализованы")
        return True
    except Exception as e:
        logger.error(f"Ошибка при обновлении данных GPU: {e}")
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


def _extract_gpu_tflops(gpu_info: dict) -> float:
    """
    Извлечь наиболее подходящее значение TFLOPS для LLM-инференса.

    Работает с нормализованным каталогом (поля tflops_fp16, tflops_fp32).
    Приоритет: fp16 → fp32 → 0.
    """
    fp16 = gpu_info.get("tflops_fp16")
    if fp16 and float(fp16) > 0:
        return float(fp16)
    fp32 = gpu_info.get("tflops_fp32")
    if fp32 and float(fp32) > 0:
        return float(fp32)
    return 0.0


def _lookup_gpu_tflops(gpu_id, gpu_mem_gb):
    """
    Поиск TFLOPS GPU из нормализованного каталога gpu_data.json (массив).
    """
    gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
    try:
        with open(gpu_data_path, "r", encoding="utf-8") as f:
            gpu_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0.0

    target_gpu = None
    for gpu in gpu_data:
        if gpu_id and gpu.get("id") == gpu_id:
            target_gpu = gpu
            break
        mem = gpu.get("memory_gb", 0)
        if mem and float(mem) == float(gpu_mem_gb):
            target_gpu = gpu
            break

    if not target_gpu:
        return 0.0

    return _extract_gpu_tflops(target_gpu)


def _price_from_gpu_entry(gpu: dict) -> Optional[float]:
    """Извлечь price_usd из одной записи каталога GPU."""
    p = gpu.get("price_usd")
    if p is None or str(p).strip() == "":
        return None
    try:
        return float(p)
    except (TypeError, ValueError):
        return None


def _lookup_gpu_price_in_catalog(
    catalog: list,
    gpu_id: Optional[str],
    gpu_mem_gb: float,
) -> Optional[float]:
    """
    Поиск цены GPU (USD) в переданном каталоге (массив записей).
    По gpu_id или по памяти (memory_gb).
    """
    target_gpu = None
    for gpu in catalog:
        if not isinstance(gpu, dict):
            continue
        if gpu_id and gpu.get("id") == gpu_id:
            target_gpu = gpu
            break
        if not gpu_id:
            mem = gpu.get("memory_gb", 0)
            if mem is not None and float(mem) == float(gpu_mem_gb):
                target_gpu = gpu
                break
    if not target_gpu:
        return None
    return _price_from_gpu_entry(target_gpu)


def _lookup_gpu_price_usd(
    gpu_id: Optional[str],
    gpu_mem_gb: float,
    custom_catalog: Optional[list] = None,
) -> Optional[float]:
    """
    Поиск цены GPU (USD). Сначала в custom_catalog (если передан), иначе в gpu_data.json.
    """
    if custom_catalog:
        price = _lookup_gpu_price_in_catalog(custom_catalog, gpu_id, gpu_mem_gb)
        if price is not None:
            return price

    gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
    try:
        with open(gpu_data_path, "r", encoding="utf-8") as f:
            gpu_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

    target_gpu = None
    for gpu in gpu_data:
        if gpu_id and gpu.get("id") == gpu_id:
            target_gpu = gpu
            break
        if not gpu_id:
            mem = gpu.get("memory_gb", 0)
            if mem and float(mem) == float(gpu_mem_gb):
                target_gpu = gpu
                break

    if not target_gpu:
        return None
    return _price_from_gpu_entry(target_gpu)


def run_sizing(inp: SizingInput) -> SizingOutput:
    """
    Главный pipeline расчёта — Методика v2

    Выполняет расчёт по двум независимым ограничениям:
    - по памяти GPU (разделы 3-5)
    - по вычислительной пропускной способности (раздел 6)
    Итог: max(серверы_по_памяти, серверы_по_compute)
    """

    # ── Section 2.1: Ssim — пиковое кол-во одновременных сессий ──
    Ssim = calc_Ssim(
        inp.internal_users, inp.penetration_internal, inp.concurrency_internal,
        inp.external_users, inp.penetration_external, inp.concurrency_external,
        inp.sessions_per_user_J
    )

    # ── Section 2.2: T — общая длина запроса и ответа в токенах ──
    T = calc_T(inp.system_prompt_tokens_SP, inp.user_prompt_tokens_Prp,
               inp.reasoning_tokens_MRT, inp.answer_tokens_A)

    # ── Section 3.1: Mmodel — память для весов модели ──
    Mmodel = calc_model_mem_gb(inp.params_billions, inp.bytes_per_param,
                               inp.emp_model, inp.safe_margin)

    # ── Section 2.2: TS и SL — оценка длины контекста сессии ──
    TS = calc_session_context_TS(inp.system_prompt_tokens_SP, inp.user_prompt_tokens_Prp,
                                  inp.reasoning_tokens_MRT, inp.answer_tokens_A,
                                  inp.dialog_turns)
    SL = calc_SL(TS, inp.max_context_window_TSmax)

    # ── Section 3.2: KV-кэш на 1 сессию ──
    MKV = calc_kv_per_session_gb(inp.layers_L, inp.hidden_size_H, SL,
                                  inp.bytes_per_kv_state, inp.emp_kv,
                                  inp.num_kv_heads, inp.num_attention_heads)

    # ── Section 4.1: GPU на 1 экземпляр модели ──
    GPUcount_model = calc_gpus_per_instance(Mmodel, inp.gpu_mem_gb, inp.kavail)

    # ── Section 4.2: Экземпляры на сервер (без TP-множителя) ──
    Ncount_model = calc_instances_per_server(inp.gpus_per_server, GPUcount_model)

    # ── Section 4.3: Свободная память для KV на базовом TP ──
    kv_free_base = calc_kv_free_per_instance_gb(GPUcount_model, inp.gpu_mem_gb,
                                                 inp.kavail, Mmodel)

    # ── Section 4.4: Параллельные сессии и Kbatch ──
    S_TP_base = calc_S_TP(kv_free_base, MKV)

    # Расчёт для Z × GPUcount_model GPU (с TP-множителем)
    Z = inp.tp_multiplier_Z
    GPUcount_z = Z * GPUcount_model
    kv_free_z = calc_kv_free_per_instance_gb(GPUcount_z, inp.gpu_mem_gb,
                                              inp.kavail, Mmodel)
    S_TP_z = calc_S_TP(kv_free_z, MKV)

    Kbatch = calc_Kbatch(S_TP_z, S_TP_base, inp.saturation_coeff_C)

    # ── Section 5.1: Пропускная способность сервера по памяти ──
    NcountTP = calc_instances_per_server_tp(inp.gpus_per_server, GPUcount_model, Z)
    Sserver = calc_sessions_per_server(NcountTP, S_TP_z)

    # ── Section 5.2: Серверы по памяти ──
    servers_mem = calc_servers_by_memory(Ssim, Sserver)
    if servers_mem is math.inf:
        raise HTTPException(
            status_code=400,
            detail="Невозможно разместить сессии по памяти. "
                   "Увеличьте память GPU, уменьшите контекст или уменьшите KV/сессию."
        )

    # ── Section 6.1: Throughput per instance ──
    FPS = calc_FPS(inp.params_billions)
    Tdec = calc_Tdec(inp.answer_tokens_A, inp.reasoning_tokens_MRT)

    # Определяем Fcount_model (FLOPS для GPU, выделенных под 1 экземпляр модели)
    gpu_tflops = inp.gpu_flops_Fcount
    if gpu_tflops is None:
        gpu_tflops = _lookup_gpu_tflops(inp.gpu_id, inp.gpu_mem_gb)
    Fcount_model_flops = gpu_tflops * 1e12 * GPUcount_model if gpu_tflops > 0 else 0.0

    # Аналитические throughput (с учётом Kbatch)
    th_pf_analyt = calc_th_prefill_analyt(Fcount_model_flops, inp.eta_prefill, Kbatch,
                                           FPS, inp.layers_L, inp.hidden_size_H, SL)
    th_dec_analyt = calc_th_decode_analyt(Fcount_model_flops, inp.eta_decode, Kbatch,
                                           FPS, inp.layers_L, inp.hidden_size_H, SL, Tdec)

    # Приоритет: эмпирические значения > аналитические
    th_pf = inp.th_prefill_empir if inp.th_prefill_empir else th_pf_analyt
    th_dec = inp.th_decode_empir if inp.th_decode_empir else th_dec_analyt

    # ── Section 6.2: Cmodel — req/sec на 1 экземпляр ──
    # Используем SL (= min(TS, TSmax)), а не TS: prefill обрабатывает
    # не более SL токенов (ограничено контекстным окном модели).
    Cmodel = calc_Cmodel(SL, th_pf, Tdec, th_dec)

    # ── Section 6.3: Пропускная способность сервера по compute ──
    # Методика v3, изм.8: Th_server_comp = N_model_TP=Z × Cmodel
    # Используется NcountTP (с учётом TP-множителя Z) вместо Ncount_model.
    th_server = calc_th_server_comp(NcountTP, Cmodel)

    # ── Section 6.4: Серверы по compute ──
    servers_comp = calc_servers_by_compute(Ssim, inp.rps_per_session_R,
                                           inp.sla_reserve_KSLA, th_server)
    if servers_comp is math.inf:
        raise HTTPException(
            status_code=400,
            detail="Пропускная способность сервера = 0. "
                   "Проверьте TFLOPS GPU, throughput или кол-во экземпляров на сервер."
        )

    # ── Section 7: Проверка конфигурации по TTFT и e2eLatency ──
    # Изм.9: T_out удалён, используем Tdec (уже рассчитан в п.6.1)
    ttft_analyt = calc_ttft(SL, th_pf, th_dec)
    gen_time_analyt = calc_generation_time(Tdec, th_dec)
    e2e_latency_analyt = calc_e2e_latency(ttft_analyt, gen_time_analyt)

    ttft_sla_pass = None
    e2e_latency_sla_pass = None
    sla_passed = None

    if inp.ttft_sla is not None:
        ttft_sla_pass = inp.ttft_sla >= ttft_analyt
    if inp.e2e_latency_sla is not None:
        e2e_latency_sla_pass = inp.e2e_latency_sla >= e2e_latency_analyt

    checks = [v for v in (ttft_sla_pass, e2e_latency_sla_pass) if v is not None]
    if checks:
        sla_passed = all(checks)

    # ── Приложение Б: рекомендации при невыполнении SLA ──
    sla_recommendations = None
    if sla_passed is False:
        sla_recommendations = []
        ttft_fail = ttft_sla_pass is False
        e2e_fail = e2e_latency_sla_pass is False

        if ttft_fail and e2e_fail:
            sla_recommendations.extend([
                "1. Увеличить TP-множитель (Z) — штатный механизм, повышает Th_pf и Th_dec",
                "2. Применить более агрессивную квантизацию (FP16→FP8/INT4)",
                "5. Сменить на модель с меньшим числом параметров или MoE",
                "6. Использовать более производительное оборудование (GPU с большей bandwidth)",
            ])
        elif ttft_fail:
            sla_recommendations.extend([
                "3. Сократить длину контекста (SL): уменьшить системный промпт, глубину диалога, применить суммаризацию",
                "1. Увеличить TP-множитель (Z) — повышает Th_pf",
                "2. Применить более агрессивную квантизацию",
            ])
        elif e2e_fail:
            sla_recommendations.extend([
                "4. Сократить объём генерации (T_out): ограничить max_tokens, уменьшить MRT",
                "1. Увеличить TP-множитель (Z) — повышает Th_dec",
                "2. Применить более агрессивную квантизацию",
            ])

        sla_recommendations.append("7. Пересмотреть целевые значения SLA, если техническая стоимость несоразмерна бизнес-ценности")

    # ── Section 8: Итоговое количество серверов ──
    servers_final = max(servers_mem, servers_comp)

    # ── Cost estimate (from GPU catalog price: custom catalog или gpu_data.json) ──
    custom_catalog_list = None
    if getattr(inp, "custom_gpu_catalog", None) is not None:
        raw = inp.custom_gpu_catalog
        custom_catalog_list = raw if isinstance(raw, list) else list(raw.values()) if isinstance(raw, dict) else None
    price_per_gpu = _lookup_gpu_price_usd(inp.gpu_id, inp.gpu_mem_gb, custom_catalog_list)
    cost_estimate_usd = (
        round(servers_final * inp.gpus_per_server * price_per_gpu, 2)
        if price_per_gpu is not None and price_per_gpu > 0 else None
    )

    return SizingOutput(
        # Section 2
        Ssim_concurrent_sessions=Ssim,
        T_tokens_per_request=T,
        # Section 3
        model_mem_gb=Mmodel,
        TS_session_context=TS,
        SL_sequence_length=SL,
        kv_per_session_gb=MKV,
        # Section 4
        gpus_per_instance=GPUcount_model,
        instances_per_server=Ncount_model,
        kv_free_per_instance_gb=kv_free_base,
        S_TP_base=S_TP_base,
        S_TP_z=S_TP_z,
        Kbatch=Kbatch,
        instance_total_mem_gb=round(GPUcount_z * inp.gpu_mem_gb, 2),
        kv_free_per_instance_tp_gb=round(kv_free_z, 4),
        # Section 5
        instances_per_server_tp=NcountTP,
        sessions_per_server=Sserver,
        servers_by_memory=servers_mem,
        # Section 6
        gpu_tflops_used=gpu_tflops,
        Fcount_model_tflops=gpu_tflops * GPUcount_model if gpu_tflops > 0 else 0.0,
        FPS_flops_per_token=FPS,
        Tdec_tokens=Tdec,
        th_prefill=th_pf,
        th_decode=th_dec,
        Cmodel_rps=Cmodel,
        th_server_comp=th_server,
        servers_by_compute=servers_comp,
        # Section 7: SLA validation
        ttft_analyt=round(ttft_analyt, 4) if ttft_analyt != float('inf') else None,
        generation_time_analyt=round(gen_time_analyt, 4) if gen_time_analyt != float('inf') else None,
        e2e_latency_analyt=round(e2e_latency_analyt, 4) if e2e_latency_analyt != float('inf') else None,
        ttft_sla_target=inp.ttft_sla,
        e2e_latency_sla_target=inp.e2e_latency_sla,
        ttft_sla_pass=ttft_sla_pass,
        e2e_latency_sla_pass=e2e_latency_sla_pass,
        sla_passed=sla_passed,
        sla_recommendations=sla_recommendations,
        # Section 8
        servers_final=servers_final,
        # Context
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
        cost_estimate_usd=cost_estimate_usd,
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

    # При старте: скрапим только если gpu_data.json не существует.
    # Если файл уже есть — используем его как есть.
    # Обновление по расписанию или вручную через /v1/gpus/refresh.
    gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
    if not os.path.exists(gpu_data_path):
        logger.info("🔄 Файл gpu_data.json не найден, запускаем первичный скрапинг...")
        refresh_gpu_data_internal()
    else:
        logger.info("📂 Используем существующий gpu_data.json")

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


# ═══════════════════════════════════════════════════════════
# Excel Report Generation
# ═══════════════════════════════════════════════════════════

# Экземпляр генератора отчётов с подключением к каталогу GPU
report_generator = ReportGenerator(gpu_tflops_lookup=_lookup_gpu_tflops)


@app.post("/v1/report", tags=["Sizing"])
def report_endpoint(inp: SizingInput):
    """
    Скачать Excel-отчёт по шаблону.

    Принимает те же параметры, что и /v1/size. Заполняет шаблон
    reportTemplate.xlsx входными значениями и возвращает файл .xlsx.
    Формулы пересчитываются при открытии файла в Excel.
    """
    try:
        buf = report_generator.generate(inp)
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{report_generator.make_filename()}"'
        }
    )


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


# ═══════════════════════════════════════════════════════════
# Auto-Optimize: подбор оптимальной конфигурации
# ═══════════════════════════════════════════════════════════

def _load_gpu_catalog_for_optimize(min_memory_gb: float = 0,
                                    vendors: Optional[List[str]] = None,
                                    gpu_ids: Optional[List[str]] = None,
                                    custom_catalog: Optional[dict] = None) -> list:
    """
    Загрузить и отфильтровать GPU из каталога для автоподбора.

    Работает с нормализованным каталогом (поля: memory_gb, tflops_fp16/fp32,
    vendor, model_name, launch_date).

    Возвращает список dict с ключами: id, name, memory_gb, tflops, vendor.

    Если custom_catalog задан — используется он вместо gpu_data.json.
    Если gpu_ids задан — берутся только указанные GPU (остальные фильтры игнорируются).
    Иначе фильтрует GPU без памяти, без TFLOPS и с датой выпуска <= 2013.
    """
    if custom_catalog is not None:
        gpu_data = custom_catalog
    else:
        gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
        try:
            with open(gpu_data_path, "r", encoding="utf-8") as f:
                gpu_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    gpu_id_set = set(gpu_ids) if gpu_ids else None

    # gpu_data is a list (array) of normalized GPU entries
    gpu_list = gpu_data if isinstance(gpu_data, list) else list(gpu_data.values())

    results = []
    seen = set()

    for gpu_info in gpu_list:
        gpu_id = gpu_info.get("id", "")

        # Фильтр по конкретным ID
        if gpu_id_set is not None and gpu_id not in gpu_id_set:
            continue

        # Memory
        memory_gb = gpu_info.get("memory_gb")
        if not memory_gb or float(memory_gb) <= 0:
            continue
        memory_gb = float(memory_gb)

        if memory_gb < min_memory_gb:
            continue

        # Vendor
        vendor = gpu_info.get("vendor", "Unknown")
        if gpu_id_set is None and vendors:
            if not any(v.lower() == vendor.lower() for v in vendors):
                continue

        # Launch date filter
        if gpu_id_set is None:
            launch_date = gpu_info.get("launch_date")
            if launch_date:
                try:
                    year = int(str(launch_date)[:4])
                    if year <= 2013:
                        continue
                except (ValueError, IndexError):
                    continue
            else:
                continue

        # TFLOPS
        tflops = _extract_gpu_tflops(gpu_info)
        if tflops <= 0:
            continue

        model_name = gpu_info.get("model_name") or "Unknown"
        full_name = f"{vendor} {model_name}".strip()

        dedup_key = (int(memory_gb), round(tflops, 1))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        price = _price_from_gpu_entry(gpu_info)

        results.append({
            "id": gpu_id,
            "name": full_name,
            "memory_gb": int(memory_gb),
            "tflops": tflops,
            "vendor": vendor,
            "price_usd": price,
        })

    return results


def _score_config(mode: OptimizationMode,
                  servers_final: int,
                  total_gpus: int,
                  th_server_comp: float,
                  cost: Optional[float],
                  e2e_latency: Optional[float],
                  all_servers: list,
                  all_gpus: list,
                  all_throughputs: list,
                  all_costs: list,
                  all_latencies: list) -> float:
    """
    Вычислить скор конфигурации для ранжирования.

    Меньший скор = лучше.
    """
    if mode == OptimizationMode.min_servers:
        return servers_final * 1000 + total_gpus
    elif mode == OptimizationMode.min_cost:
        if cost is not None:
            return cost * 1000 + total_gpus
        return float('inf')
    elif mode == OptimizationMode.max_performance:
        return -th_server_comp * 1000 + servers_final
    elif mode == OptimizationMode.best_sla:
        lat = e2e_latency if e2e_latency is not None else float('inf')
        return lat * 1000 + servers_final
    else:  # balanced
        min_s = min(all_servers) if all_servers else 1
        max_s = max(all_servers) if all_servers else 1
        min_g = min(all_gpus) if all_gpus else 1
        max_g = max(all_gpus) if all_gpus else 1
        min_t = min(all_throughputs) if all_throughputs else 0.001
        max_t = max(all_throughputs) if all_throughputs else 0.001
        costs_valid = [c for c in all_costs if c is not None]
        min_c = min(costs_valid) if costs_valid else 0
        max_c = max(costs_valid) if costs_valid else 0

        def norm(val, lo, hi):
            if hi == lo:
                return 0.0
            return (val - lo) / (hi - lo)

        ns = norm(servers_final, min_s, max_s)
        ng = norm(total_gpus, min_g, max_g)
        nt = 1.0 - norm(th_server_comp, min_t, max_t)
        nc = norm(cost, min_c, max_c) if cost is not None and max_c > min_c else 0.5
        return 0.3 * ns + 0.2 * ng + 0.25 * nt + 0.25 * nc


@app.post("/v1/auto-optimize", response_model=AutoOptimizeResponse, tags=["Sizing"])
def auto_optimize_endpoint(inp: AutoOptimizeInput):
    """
    Автоматический подбор оптимальной конфигурации.

    Перебирает комбинации GPU, TP Degree, GPUs/Server, квантизации
    и возвращает top-N наилучших конфигураций по выбранному режиму.
    """
    # ── Пространство поиска ──
    TP_VALUES = [1, 2, 4, 6, 8]
    GPUS_PER_SERVER_VALUES = [1, 2, 4, 6, 8]
    BYTES_PER_PARAM_VALUES = [1, 2, 4]  # INT8, FP16, FP32
    QUANT_LABELS = {1: "INT8", 2: "FP16", 4: "FP32"}

    # ── Загрузка и фильтрация GPU из каталога ──
    min_mem = inp.min_gpu_memory_gb or 0
    gpu_catalog = _load_gpu_catalog_for_optimize(
        min_memory_gb=min_mem,
        vendors=inp.gpu_vendors,
        gpu_ids=inp.gpu_ids,
        custom_catalog=inp.custom_gpu_catalog,
    )

    if not gpu_catalog:
        raise HTTPException(
            status_code=400,
            detail="Нет подходящих GPU в каталоге. Попробуйте снизить min_gpu_memory_gb "
                   "или убрать фильтр по вендору."
        )

    # ── Перебор комбинаций ──
    raw_results = []
    total_evaluated = 0

    for gpu in gpu_catalog:
        for bpp in BYTES_PER_PARAM_VALUES:
            # Ранний выход: посчитаем модельную память, чтобы отсечь невалидные
            Mmodel = calc_model_mem_gb(inp.params_billions, bpp,
                                       inp.emp_model, inp.safe_margin)
            GPUcount_model = calc_gpus_per_instance(Mmodel, gpu["memory_gb"], inp.kavail)

            for gps in GPUS_PER_SERVER_VALUES:
                # Ранний выход: если модель не влезает в сервер
                if GPUcount_model > gps:
                    total_evaluated += len(TP_VALUES)
                    continue

                for Z in TP_VALUES:
                    total_evaluated += 1

                    # Ранний выход: Z×GPUcount_model > gpus_per_server
                    if Z * GPUcount_model > gps:
                        continue

                    # Собрать SizingInput
                    try:
                        sizing_inp = SizingInput(
                            # Модель
                            params_billions=inp.params_billions,
                            bytes_per_param=bpp,
                            safe_margin=inp.safe_margin,
                            emp_model=inp.emp_model,
                            layers_L=inp.layers_L,
                            hidden_size_H=inp.hidden_size_H,
                            # Пользователи
                            internal_users=inp.internal_users,
                            penetration_internal=inp.penetration_internal,
                            concurrency_internal=inp.concurrency_internal,
                            external_users=inp.external_users,
                            penetration_external=inp.penetration_external,
                            concurrency_external=inp.concurrency_external,
                            sessions_per_user_J=inp.sessions_per_user_J,
                            # Токены
                            system_prompt_tokens_SP=inp.system_prompt_tokens_SP,
                            user_prompt_tokens_Prp=inp.user_prompt_tokens_Prp,
                            reasoning_tokens_MRT=inp.reasoning_tokens_MRT,
                            answer_tokens_A=inp.answer_tokens_A,
                            dialog_turns=inp.dialog_turns,
                            # KV
                            num_kv_heads=inp.num_kv_heads,
                            num_attention_heads=inp.num_attention_heads,
                            bytes_per_kv_state=inp.bytes_per_kv_state,
                            emp_kv=inp.emp_kv,
                            max_context_window_TSmax=inp.max_context_window_TSmax,
                            # Hardware
                            gpu_mem_gb=gpu["memory_gb"],
                            gpu_id=gpu["id"],
                            gpus_per_server=gps,
                            kavail=inp.kavail,
                            tp_multiplier_Z=Z,
                            saturation_coeff_C=inp.saturation_coeff_C,
                            # Compute
                            gpu_flops_Fcount=gpu["tflops"],
                            eta_prefill=inp.eta_prefill,
                            eta_decode=inp.eta_decode,
                            # SLA
                            rps_per_session_R=inp.rps_per_session_R,
                            sla_reserve_KSLA=inp.sla_reserve_KSLA,
                            ttft_sla=getattr(inp, 'ttft_sla', None),
                            e2e_latency_sla=getattr(inp, 'e2e_latency_sla', None),
                        )

                        result = run_sizing(sizing_inp)
                    except Exception:
                        continue

                    servers = result.servers_final
                    total_gpus_count = servers * gps

                    # Фильтр max_servers
                    if inp.max_servers and servers > inp.max_servers:
                        continue

                    gpu_price = gpu.get("price_usd")
                    total_cost = (
                        round(servers * gps * gpu_price, 2)
                        if gpu_price is not None else None
                    )

                    raw_results.append({
                        "gpu": gpu,
                        "Z": Z,
                        "gps": gps,
                        "bpp": bpp,
                        "result": result,
                        "servers": servers,
                        "total_gpus": total_gpus_count,
                        "th_server": result.th_server_comp,
                        "e2e_latency": result.e2e_latency_analyt,
                        "gpu_price": gpu_price,
                        "total_cost": total_cost,
                        "sizing_input_dict": sizing_inp.dict(),
                    })

    if not raw_results:
        raise HTTPException(
            status_code=400,
            detail="Ни одна комбинация не дала валидный результат. "
                   "Попробуйте увеличить min_gpu_memory_gb или ослабить ограничения."
        )

    # ── Скоринг ──
    all_servers = [r["servers"] for r in raw_results]
    all_gpus = [r["total_gpus"] for r in raw_results]
    all_throughputs = [r["th_server"] for r in raw_results]
    all_costs = [r["total_cost"] for r in raw_results]
    all_latencies = [r["e2e_latency"] for r in raw_results]

    for r in raw_results:
        r["score"] = _score_config(
            inp.mode, r["servers"], r["total_gpus"], r["th_server"],
            r["total_cost"], r["e2e_latency"],
            all_servers, all_gpus, all_throughputs, all_costs, all_latencies,
        )

    # Сортировка по скору
    raw_results.sort(key=lambda r: r["score"])

    # Дедупликация: по (servers, total_gpus, sessions_per_server, th_server округлённый)
    seen_keys = set()
    deduped = []
    for r in raw_results:
        key = (
            r["servers"],
            r["total_gpus"],
            r["result"].sessions_per_server,
            round(r["th_server"], 2),
        )
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(r)

    # Top-N
    top = deduped[:inp.top_n]

    results = []
    for rank, r in enumerate(top, 1):
        results.append(AutoOptimizeResult(
            rank=rank,
            score=round(r["score"], 4),
            gpu_name=r["gpu"]["name"],
            gpu_id=r["gpu"]["id"],
            gpu_mem_gb=r["gpu"]["memory_gb"],
            gpu_tflops=r["gpu"]["tflops"],
            tp_multiplier_Z=r["Z"],
            gpus_per_server=r["gps"],
            bytes_per_param=r["bpp"],
            servers_final=r["servers"],
            total_gpus=r["total_gpus"],
            servers_by_memory=r["result"].servers_by_memory,
            servers_by_compute=r["result"].servers_by_compute,
            sessions_per_server=r["result"].sessions_per_server,
            instances_per_server_tp=r["result"].instances_per_server_tp,
            th_server_comp=round(r["result"].th_server_comp, 4),
            gpu_price_usd=r["gpu_price"],
            cost_estimate_usd=r["total_cost"],
            sizing_input=r["sizing_input_dict"],
        ))

    return AutoOptimizeResponse(
        mode=inp.mode,
        total_evaluated=total_evaluated,
        total_valid=len(raw_results),
        results=results,
    )


# GPU API Endpoints

def _get_recommended_gpus_per_server(gpu_info: dict) -> int:
    """Определить рекомендуемое количество GPU на сервер (normalized catalog)."""
    memory_gb = gpu_info.get("memory_gb") or 0
    if memory_gb >= 16:
        return 8
    else:
        return 4


def _get_estimated_tps(gpu_info: dict) -> float:
    """Оценить TPS на основе характеристик GPU (normalized catalog)."""
    memory_gb = gpu_info.get("memory_gb") or 0
    vendor = str(gpu_info.get("vendor", "")).lower()

    if vendor == "nvidia":
        if memory_gb >= 80:
            return 2000
        elif memory_gb >= 40:
            return 1500
        elif memory_gb >= 24:
            return 1000
        else:
            return 500
    elif vendor == "amd":
        if memory_gb >= 80:
            return 1500
        elif memory_gb >= 24:
            return 800
        else:
            return 400
    else:
        return 300


@app.get("/v1/gpus", response_model=GPUListResponse, tags=["GPU Catalog"])
def get_gpus(
        vendor: Optional[str] = Query(None,
                                      description="Фильтр по производителю (NVIDIA, AMD, Intel). По умолчанию - все производители"),
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

    # Фильтрация данных (normalized catalog — JSON array)
    filtered_gpus = []
    for gpu_info in gpu_data:
        gpu_id = gpu_info.get("id", "")

        # Vendor filter
        gpu_vendor = gpu_info.get("vendor", "Unknown")
        if vendor and gpu_vendor.lower() != vendor.lower():
            continue

        # Memory filter
        mem_gb = gpu_info.get("memory_gb")
        if not mem_gb or float(mem_gb) <= 0:
            continue
        mem_gb = float(mem_gb)
        if min_memory and mem_gb < min_memory:
            continue
        if max_memory and mem_gb > max_memory:
            continue

        # Launch date / year filter
        launch_date = gpu_info.get("launch_date")
        if launch_date:
            try:
                year = int(str(launch_date)[:4])
                if year <= 2013:
                    continue
                if min_year and year < min_year:
                    continue
                if max_year and year > max_year:
                    continue
            except (ValueError, IndexError):
                continue
        else:
            continue

        # Memory type filter
        gpu_mem_type = gpu_info.get("memory_type")
        if memory_type and (not gpu_mem_type or gpu_mem_type.lower() != memory_type.lower()):
            continue

        # Model name
        model_name = gpu_info.get("model_name") or "Unknown"
        full_name = f"{gpu_vendor} {model_name}".strip()

        # Search filter
        if search and search.lower() not in full_name.lower():
            continue

        # TDP
        tdp_val = gpu_info.get("tdp_watts")
        tdp_str = f"{int(tdp_val)} W" if tdp_val else "Unknown"

        price_usd = gpu_info.get("price_usd")
        if price_usd is not None:
            try:
                price_usd = float(price_usd)
            except (TypeError, ValueError):
                price_usd = None

        gpu = GPUInfo(
            id=gpu_id,
            vendor=gpu_vendor,
            model=model_name,
            memory_gb=int(mem_gb),
            cores=None,
            launch_date=launch_date,
            memory_type=gpu_mem_type,
            recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
            estimated_tps_per_instance=_get_estimated_tps(gpu_info),
            full_name=full_name,
            tdp_watts=tdp_str,
            tflops=_extract_gpu_tflops(gpu_info) or None,
            price_usd=price_usd,
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


@app.get("/v1/gpus/export", tags=["GPU Catalog"])
def export_gpu_catalog():
    """
    Скачать нормализованный каталог GPU в формате JSON.

    Возвращает полный каталог gpu_data.json для скачивания.
    Пользователь может отредактировать файл и загрузить обратно
    через custom_gpu_catalog в auto-optimize запросе.
    """
    from fastapi.responses import FileResponse
    gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
    if not os.path.exists(gpu_data_path):
        raise HTTPException(status_code=404, detail="GPU data not found. Run /v1/gpus/refresh first.")
    return FileResponse(
        gpu_data_path,
        media_type="application/json",
        filename="gpu_catalog.json",
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

    gpu_info = next((g for g in gpu_data if g.get("id") == gpu_id), None)
    if gpu_info is None:
        raise HTTPException(status_code=404, detail="GPU not found")

    gpu_vendor = gpu_info.get("vendor", "Unknown")
    model_name = gpu_info.get("model_name") or "Unknown"
    full_name = f"{gpu_vendor} {model_name}".strip()
    mem_gb = gpu_info.get("memory_gb") or 0
    tdp_val = gpu_info.get("tdp_watts")
    tdp_str = f"{int(tdp_val)} W" if tdp_val else "Unknown"

    price_usd = gpu_info.get("price_usd")
    if price_usd is not None:
        try:
            price_usd = float(price_usd)
        except (TypeError, ValueError):
            price_usd = None

    return GPUInfo(
        id=gpu_id,
        vendor=gpu_vendor,
        model=model_name,
        memory_gb=int(mem_gb),
        cores=None,
        launch_date=gpu_info.get("launch_date"),
        memory_type=gpu_info.get("memory_type"),
        recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
        estimated_tps_per_instance=_get_estimated_tps(gpu_info),
        full_name=full_name,
        tdp_watts=tdp_str,
        tflops=_extract_gpu_tflops(gpu_info) or None,
        price_usd=price_usd,
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

    for gpu_info in gpu_data:
        # Вендоры (normalized: "vendor")
        v = gpu_info.get("vendor", "Unknown")
        vendors[v] = vendors.get(v, 0) + 1

        # Память (normalized: "memory_gb")
        memory = gpu_info.get("memory_gb") or 0
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

        # Годы (normalized: "launch_date" → "YYYY-MM-DD" or "YYYY")
        launch_date = gpu_info.get("launch_date")
        if launch_date:
            try:
                year = int(str(launch_date)[:4])
                year_range = f"{year // 10 * 10}s"
                year_ranges[year_range] = year_ranges.get(year_range, 0) + 1
            except (ValueError, IndexError):
                pass

    return GPUStats(
        total_gpus=len(gpu_data),
        vendors=vendors,
        memory_ranges=memory_ranges,
        year_ranges=year_ranges
    )
