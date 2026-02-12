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
    GPUInfo, GPUListResponse, GPUStats, GPURefreshResponse
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


# ═══════════════════════════════════════════════════════════
# Section 2: Определение нагрузки
# ═══════════════════════════════════════════════════════════

def calc_Ssim(iu, pin, cin, eu, pex, cex, J):
    """
    Раздел 2.1 — Пиковое кол-во одновременных сессий

    Ssim = Nusers × Kpen × Ksim × J  (для каждого сегмента, затем сумма)

    Параметры:
    - iu, pin, cin: внутренние пользователи, проникновение, одновременность
    - eu, pex, cex: внешние пользователи, проникновение, одновременность
    - J: количество одновременных сессий на пользователя
    """
    return iu * pin * cin * J + eu * pex * cex * J


def calc_T(SP, Prp, MRT, A):
    """
    Раздел 2.2 — Средняя общая длина запроса и ответа в токенах

    T = SP + Prp + MRT + A
    """
    return SP + Prp + MRT + A


# ═══════════════════════════════════════════════════════════
# Section 3: Память GPU
# ═══════════════════════════════════════════════════════════

def calc_model_mem_gb(params_b, bytes_per_param, overhead, emp_model):
    """
    Раздел 3.1 — Память, требуемая для весов модели (GiB)

    Mmodel = (P × 10⁹ × Bquant / 1024³) × Koverhead × EMPmodel
    """
    return (params_b * 1e9 * bytes_per_param / (1024 ** 3)) * overhead * emp_model


def calc_session_context_TS(SP, Prp, MRT, A, dialog_turns):
    """
    Раздел 3.2 — Прикидочная длина контекста в сессии

    TS_prp5_s1 = SP + dialog_turns × (Prp + MRT + A)

    Предполагается диалог длиной в dialog_turns сообщений (по умолчанию 5).
    """
    return SP + dialog_turns * (Prp + MRT + A)


def calc_SL(TS, TSmax):
    """
    Раздел 3.2 — Длина последовательности контекстного окна

    SL = min(TS, TSmax)
    """
    return min(TS, TSmax)


def calc_kv_per_session_gb(L, H, SL, bytes_state, emp_kv):
    """
    Раздел 3.2 — KV-кэш на 1 сессию (GiB)

    MKV_s1 = 2 × L × H × SL × Bstate × EMPkv / 1024³
    """
    return (2 * L * H * SL * bytes_state * emp_kv) / (1024 ** 3)


# ═══════════════════════════════════════════════════════════
# Section 4: GPU и Tensor Parallelism
# ═══════════════════════════════════════════════════════════

def calc_gpus_per_instance(model_mem_gb, gpu_mem_gb, kavail):
    """
    Раздел 4.1 — Мин. кол-во GPU на 1 экземпляр модели

    GPUcount_model = ⌈ Mmodel / (GPUmemory × Kavail) ⌉
    """
    return max(1, math.ceil(model_mem_gb / (gpu_mem_gb * kavail)))


def calc_instances_per_server(gpus_per_server, gpus_per_instance):
    """
    Раздел 4.2 — Кол-во экземпляров модели на 1 сервер (без TP-множителя)

    Ncount_model = ⌊ GPUcount_server / GPUcount_model ⌋
    """
    return max(0, gpus_per_server // gpus_per_instance)


def calc_kv_free_per_instance_gb(gpus_per_instance, gpu_mem_gb, kavail, model_mem_gb):
    """
    Раздел 4.3 — Свободная GPU-память под KV-кэш на 1 экземпляр модели (GiB)

    GPUmemoryForKV_model = GPUcount_model × GPUmemory × Kavail − Mmodel
    """
    return max(0.0, gpus_per_instance * gpu_mem_gb * kavail - model_mem_gb)


def calc_S_TP(kv_free_gb, kv_per_session_gb):
    """
    Раздел 4.4 — Макс. теоретическое кол-во параллельных сессий при данном TP

    S_TP=n = ⌊ GPUmemoryForKV_model / MKV_s1 ⌋
    """
    if kv_per_session_gb <= 0:
        return 0
    return int(kv_free_gb // kv_per_session_gb)


def calc_Kbatch(S_TP_z, S_TP_base, C):
    """
    Раздел 4.4 — Коэф. повышения пропускной способности за счёт TP и Batch Size

    Kbatch = (S_TP_z / S_TP_base) × ((S_TP_base + C) / (S_TP_z + C))

    При Z=1 → S_TP_z == S_TP_base → Kbatch = 1.0
    """
    if S_TP_base <= 0 or S_TP_z <= 0:
        return 1.0
    return (S_TP_z / S_TP_base) * ((S_TP_base + C) / (S_TP_z + C))


# ═══════════════════════════════════════════════════════════
# Section 5: Серверы по памяти
# ═══════════════════════════════════════════════════════════

def calc_instances_per_server_tp(gpus_per_server, gpus_per_instance, Z):
    """
    Раздел 5.1 — Кол-во экземпляров модели на 1 сервер с учётом TP

    NcountTP_model = ⌊ GPUcount_server / (Z × GPUcount_model) ⌋
    """
    total_gpus_per_instance_tp = Z * gpus_per_instance
    if total_gpus_per_instance_tp <= 0:
        return 0
    return gpus_per_server // total_gpus_per_instance_tp


def calc_sessions_per_server(NcountTP, S_TP_z):
    """
    Раздел 5.1 — Кол-во сессий, одновременно поддерживаемых сервером

    Sserver = NcountTP_model × S_TP_z
    """
    return NcountTP * S_TP_z


def calc_servers_by_memory(Ssim, Sserver):
    """
    Раздел 5.2 — Число серверов по памяти

    Servers_mem = ⌈ Ssim / Sserver ⌉
    """
    if Sserver <= 0:
        return math.inf
    return math.ceil(Ssim / Sserver)


# ═══════════════════════════════════════════════════════════
# Section 6: Серверы по вычислительной пропускной способности
# ═══════════════════════════════════════════════════════════

def calc_FPS(params_billions):
    """
    Раздел 6.1 — Число FLOP на 1 токен (базовая оценка)

    FPS = 2 × P × 10⁹
    """
    return 2 * params_billions * 1e9


def calc_Tdec(A, MRT):
    """
    Раздел 6.1 — Число токенов, генерируемых в фазе decode на 1 запрос

    Tdec = A + MRT
    """
    return A + MRT


def calc_th_prefill_analyt(Fcount_model_flops, eta_pf, Kbatch, FPS, L, H, SL):
    """
    Раздел 6.1 — Аналитический throughput фазы prefill (tokens/sec)

    Th_pf_analyt ≈ (Fcount_model × η_pf × Kbatch) / (FPS + 4 × L × H × SL)
    """
    denominator = FPS + 4 * L * H * SL
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_pf * Kbatch) / denominator


def calc_th_decode_analyt(Fcount_model_flops, eta_dec, Kbatch, FPS, L, H, SL, Tdec):
    """
    Раздел 6.1 — Аналитический throughput фазы decode (tokens/sec)

    Th_dec_analyt ≈ (Fcount_model × η_dec × Kbatch) / (FPS + 4 × L × H × (SL + (Tdec−1)/2))
    """
    denominator = FPS + 4 * L * H * (SL + (Tdec - 1) / 2)
    if denominator <= 0 or Fcount_model_flops <= 0:
        return 0.0
    return (Fcount_model_flops * eta_dec * Kbatch) / denominator


def calc_Cmodel(TS, th_pf, Tdec, th_dec):
    """
    Раздел 6.2 — Среднее число запросов/сек на 1 экземпляр модели

    Cmodel = 1 / (TS / Th_pf + Tdec / Th_dec)
    """
    if th_pf <= 0 or th_dec <= 0:
        return 0.0
    time_per_request = TS / th_pf + Tdec / th_dec
    if time_per_request <= 0:
        return 0.0
    return 1.0 / time_per_request


def calc_th_server_comp(Ncount_model, Cmodel):
    """
    Раздел 6.3 — Итоговая пропускная способность одного сервера (req/sec)

    Th_server_comp = Ncount_model × Cmodel
    """
    return Ncount_model * Cmodel


def calc_servers_by_compute(Ssim, R, KSLA, th_server_comp):
    """
    Раздел 6.4 — Число серверов по пропускной способности

    Servers_comp = ⌈ (Ssim × R × KSLA) / Th_server_comp ⌉
    """
    if th_server_comp <= 0:
        return math.inf
    return math.ceil((Ssim * R * KSLA) / th_server_comp)


# GPU Data Management
def refresh_gpu_data_internal():
    """Внутренняя функция для обновления данных GPU"""
    import sys
    import io
    try:
        logger.info("Начинаем обновление данных GPU...")
        # На Windows stdout может не поддерживать UTF-8 emoji из скрапера.
        # Перенаправляем в StringIO, чтобы не трогать sys.stdout.buffer
        # (TextIOWrapper закрывает buffer при GC, ломая логгер).
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            from gpu_scraper import main as scrape_gpus
            scrape_gpus()
        finally:
            sys.stdout = old_stdout

        logger.info("Данные GPU успешно обновлены")
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


def _parse_tflops_value(raw) -> float:
    """
    Разбор значения TFLOPS из GPU-каталога.

    Значение может быть числом (312.0), строкой с одним числом ("312.0"),
    строкой с base/boost ("10.48 12.90") — берём максимум (boost).
    """
    if raw is None:
        return 0.0
    try:
        return float(raw)
    except (ValueError, TypeError):
        pass
    s = str(raw).strip()
    parts = s.replace(",", " ").split()
    values = []
    for p in parts:
        try:
            values.append(float(p))
        except ValueError:
            continue
    return max(values) if values else 0.0


def _extract_gpu_tflops(gpu_info: dict) -> float:
    """
    Извлечь наиболее подходящее значение TFLOPS для LLM-инференса из записи GPU.

    Приоритет (от лучшего к худшему):
    1. Half precision Tensor Core (напр. A100 → 312 TFLOPS)
    2. Tensor compute FP16
    3. BFloat16
    4. Half precision (generic)
    5. Single precision (FP32)
    6. Любое поле с «TFLOPS»
    """
    priority_keywords = [
        ("Half precision Tensor Core", "TFLOPS"),
        ("Tensor compute (FP16)", "TFLOPS"),
        ("Tensor compute FP16", "TFLOPS"),
        ("Tensor", "TFLOPS"),
        ("Bfloat16", "TFLOPS"),
        ("Half precision", "TFLOPS"),
        ("Half", "TFLOPS"),
        ("XMX Half", "TFLOPS"),
        ("Single precision", "TFLOPS"),
        ("Single", "TFLOPS"),
    ]

    for keyword, unit in priority_keywords:
        for key, value in gpu_info.items():
            if unit in key and keyword in key:
                v = _parse_tflops_value(value)
                if v > 0:
                    return v

    # Фоллбэк: GFLOPS → TFLOPS
    gflops_priority = [
        ("Tensor compute (FP16)", "GFLOPS"),
        ("Half precision", "GFLOPS"),
        ("Half", "GFLOPS"),
        ("Single precision", "GFLOPS"),
        ("Single", "GFLOPS"),
    ]
    for keyword, unit in gflops_priority:
        for key, value in gpu_info.items():
            if unit in key and keyword in key:
                v = _parse_tflops_value(value)
                if v > 0:
                    return v / 1000.0  # GFLOPS → TFLOPS

    # Последний фоллбэк: любое поле с TFLOPS/GFLOPS
    for key, value in gpu_info.items():
        if "TFLOPS" in key:
            v = _parse_tflops_value(value)
            if v > 0:
                return v
    for key, value in gpu_info.items():
        if "GFLOPS" in key:
            v = _parse_tflops_value(value)
            if v > 0:
                return v / 1000.0

    # Vector TFLOPS FP16
    for key, value in gpu_info.items():
        k_upper = key.upper()
        if "TFLOPS" in k_upper and ("FP16" in k_upper or "HALF" in k_upper):
            v = _parse_tflops_value(value)
            if v > 0:
                return v

    return 0.0


def _lookup_gpu_tflops(gpu_id, gpu_mem_gb):
    """
    Поиск TFLOPS GPU из каталога gpu_data.json.

    Для LLM-инференса ищем Half Precision / Tensor Core TFLOPS
    (например, 312 TFLOPS для A100, а НЕ 9.7 Double Precision).
    """
    import os
    gpu_data_path = os.path.join(os.path.dirname(__file__), "gpu_data.json")
    try:
        with open(gpu_data_path, "r", encoding="utf-8") as f:
            gpu_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return 0.0

    target_gpu = None
    if gpu_id and gpu_id in gpu_data:
        target_gpu = gpu_data[gpu_id]
    else:
        for gid, ginfo in gpu_data.items():
            mem = ginfo.get("Memory_GB", 0)
            if mem and float(mem) == float(gpu_mem_gb):
                target_gpu = ginfo
                break

    if not target_gpu:
        return 0.0

    return _extract_gpu_tflops(target_gpu)


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
                               inp.overhead_factor, inp.emp_model)

    # ── Section 3.2: KV-кэш на 1 сессию ──
    TS = calc_session_context_TS(inp.system_prompt_tokens_SP, inp.user_prompt_tokens_Prp,
                                  inp.reasoning_tokens_MRT, inp.answer_tokens_A,
                                  inp.dialog_turns)
    SL = calc_SL(TS, inp.max_context_window_TSmax)
    MKV = calc_kv_per_session_gb(inp.layers_L, inp.hidden_size_H, SL,
                                  inp.bytes_per_kv_state, inp.emp_kv)

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
    # Методика v2, раздел 6.3: Th_server_comp = Ncount_model × Cmodel
    # Используется Ncount_model из раздела 4.2 (без учёта TP-множителя Z).
    # Итоговое количество серверов = max(по памяти, по compute),
    # поэтому при Z > 1 ограничение по памяти (NcountTP) доминирует.
    th_server = calc_th_server_comp(Ncount_model, Cmodel)

    # ── Section 6.4: Серверы по compute ──
    servers_comp = calc_servers_by_compute(Ssim, inp.rps_per_session_R,
                                           inp.sla_reserve_KSLA, th_server)
    if servers_comp is math.inf:
        raise HTTPException(
            status_code=400,
            detail="Пропускная способность сервера = 0. "
                   "Проверьте TFLOPS GPU, throughput или кол-во экземпляров на сервер."
        )

    # ── Section 7: Итоговое количество серверов ──
    servers_final = max(servers_mem, servers_comp)

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
        # Section 7
        servers_final=servers_final,
        # Context
        gpu_id=inp.gpu_id,
        gpu_mem_gb=inp.gpu_mem_gb,
        gpus_per_server=inp.gpus_per_server,
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

            # Фильтрация по году - оставляем только GPU с Launch после 2013 года
        launch_date = gpu_info.get("Launch")
        if launch_date:
            try:
                year = pd.to_datetime(launch_date).year
                if year <= 2013:  # Пропускаем GPU до 2013 года
                    continue
                if min_year and year < min_year:
                    continue
                if max_year and year > max_year:
                    continue
            except:
                continue  # Пропускаем GPU с некорректной датой запуска

        if memory_type and gpu_info.get("Memory_Type", "").lower() != memory_type.lower():
            continue

        # Поиск по названию
        if search:
            model = gpu_info.get("Model", "").lower()
            if search.lower() not in model:
                continue

        # Создаем GPUInfo объект
        # Формируем полное название модели (Vendor + Model)
        vendor = gpu_info.get("Vendor", "Unknown")
        model_value = gpu_info.get("Model")
        model_name_value = gpu_info.get("Model name")
        
        # Определяем model_name с проверкой на None и "nan"
        if model_value and "nan" not in str(model_value).lower():
            model_name = str(model_value)
        elif model_name_value and "nan" not in str(model_name_value).lower():
            model_name = str(model_name_value)
        else:
            model_name = "Unknown"
        
        full_name = f"{vendor} {model_name}".strip()

        # Формируем размер памяти в виде строки с единицами измерения
        memory_size = 0
        memory_size_formatted = 0
        for key in gpu_info.keys():
            if "memory size" in str(key).lower():
                memory_size = int(re.sub(r"\D+", '', str(gpu_info.get(key)).split(" ")[0]))

        if memory_size and memory_size != 0:
            memory_size_formatted = memory_size
        else:
            memory_size_formatted = 0
            # Сделано для упрощения ориентирования
            continue

        # Получаем TDP (в ваттах)
        tdp_watts = gpu_info.get("TDP (Watts)", "?")
        if tdp_watts != "?":
            tdp_watts = f"{tdp_watts} W"
        else:
            tdp_watts = "Unknown"

        gpu = GPUInfo(
            id=gpu_id,
            vendor=vendor,
            model=model_name,
            memory_gb=memory_size_formatted,
            cores=cores,
            launch_date=launch_date,
            memory_type=gpu_info.get("Memory_Type"),
            recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
            estimated_tps_per_instance=_get_estimated_tps(gpu_info),
            full_name=full_name,
            tdp_watts=tdp_watts,
            tflops=_extract_gpu_tflops(gpu_info) or None,
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

    # Формируем полное название модели (Vendor + Model)
    vendor = gpu_info.get("Vendor", "Unknown")
    model_value = gpu_info.get("Model")
    model_name_value = gpu_info.get("Model name")
    
    # Определяем model_name с проверкой на None и "nan"
    if model_value and "nan" not in str(model_value).lower():
        model_name = str(model_value)
    elif model_name_value and "nan" not in str(model_name_value).lower():
        model_name = str(model_name_value)
    else:
        model_name = "Unknown"
    
    full_name = f"{vendor} {model_name}".strip()

    # Формируем размер памяти в виде строки с единицами измерения
    memory_size = 0
    memory_size_formatted = 0
    for key in gpu_info.keys():
        if "memory size" in str(key).lower():
            memory_size = int(re.sub(r"\D+", '', str(gpu_info.get(key)).split(" ")[0]))
            break

    if memory_size and memory_size != 0:
        memory_size_formatted = memory_size
    else:
        memory_size_formatted = 0

    # Получаем TDP (в ваттах)
    tdp_watts = gpu_info.get("TDP (Watts)", "?")
    if tdp_watts != "?":
        tdp_watts = f"{tdp_watts} W"
    else:
        tdp_watts = "Unknown"

    return GPUInfo(
        id=gpu_id,
        vendor=vendor,
        model=model_name,
        memory_gb=memory_size_formatted,
        cores=gpu_info.get("Cores"),
        launch_date=gpu_info.get("Launch"),
        memory_type=gpu_info.get("Memory_Type"),
        recommended_gpus_per_server=_get_recommended_gpus_per_server(gpu_info),
        estimated_tps_per_instance=_get_estimated_tps(gpu_info),
        full_name=full_name,
        tdp_watts=tdp_watts,
        tflops=_extract_gpu_tflops(gpu_info) or None,
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
                year_range = f"{year // 10 * 10}s"
                year_ranges[year_range] = year_ranges.get(year_range, 0) + 1
            except:
                pass

    return GPUStats(
        total_gpus=len(gpu_data),
        vendors=vendors,
        memory_ranges=memory_ranges,
        year_ranges=year_ranges
    )
