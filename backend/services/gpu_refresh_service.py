from __future__ import annotations

import io
import logging
import sys
from collections.abc import Callable
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("sizing")

BACKEND_DIR = Path(__file__).resolve().parent.parent


def refresh_gpu_data_internal() -> bool:
    """Обновить нормализованный каталог GPU из скрапера."""
    try:
        logger.info("Начинаем обновление данных GPU...")

        raw_path = BACKEND_DIR / "gpu_data_raw.json"
        out_path = BACKEND_DIR / "gpu_data.json"

        # На Windows stdout может не поддерживать UTF-8 emoji из скрапера.
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            from gpu_scraper import main as scrape_gpus

            scrape_gpus()
        finally:
            sys.stdout = old_stdout

        logger.info("Скрапинг завершён, запускаем нормализацию...")

        from gpu_normalizer import normalize as normalize_gpu_data

        normalize_gpu_data(str(raw_path), str(out_path))

        logger.info("Данные GPU успешно обновлены и нормализованы")
        return True
    except Exception as exc:
        logger.error("Ошибка при обновлении данных GPU: %s", exc)
        return False


def scheduled_refresh(refresh_fn: Callable[[], bool] = refresh_gpu_data_internal) -> None:
    """Запустить одно запланированное обновление каталога GPU."""
    logger.info("⏰ Запуск запланированного обновления GPU данных...")
    refresh_fn()


def start_scheduler(refresh_fn: Callable[[], bool] = refresh_gpu_data_internal) -> BackgroundScheduler:
    """Запустить планировщик почасового обновления GPU-каталога."""
    scheduler = BackgroundScheduler()

    scheduler.add_job(
        func=lambda: scheduled_refresh(refresh_fn),
        trigger=IntervalTrigger(hours=1),
        id="gpu_refresh_hourly",
        name="GPU Data Refresh Every Hour",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("📅 Планировщик запущен: обновление GPU данных каждый час")
    return scheduler
