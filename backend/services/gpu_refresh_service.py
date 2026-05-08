from __future__ import annotations

import io
import logging
import sys
from collections.abc import Callable
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from settings import get_settings
from services.gpu_catalog_pipeline.normalizer import normalize as normalize_gpu_data
from services.gpu_catalog_pipeline.scraper import scrape_gpu_catalog_raw

logger = logging.getLogger("sizing")

BACKEND_DIR = Path(__file__).resolve().parent.parent


def refresh_gpu_data_internal() -> bool:
    """Refresh the normalized GPU catalog from the scraper."""
    try:
        logger.info("Начинаем обновление данных GPU...")

        raw_path = BACKEND_DIR / "gpu_data_raw.json"
        out_path = BACKEND_DIR / "gpu_data.json"

        # On Windows, stdout may not support UTF-8 emoji from the scraper.
        old_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            scrape_gpu_catalog_raw(raw_path)
        finally:
            sys.stdout = old_stdout

        logger.info("Скрапинг завершён, запускаем нормализацию...")

        normalize_gpu_data(str(raw_path), str(out_path))

        logger.info("Данные GPU успешно обновлены и нормализованы")
        return True
    except Exception as exc:
        logger.error("Ошибка при обновлении данных GPU: %s", exc)
        return False


def scheduled_refresh(refresh_fn: Callable[[], bool] = refresh_gpu_data_internal) -> None:
    """Run one scheduled GPU catalog refresh."""
    logger.info("⏰ Запуск запланированного обновления GPU данных...")
    refresh_fn()


def start_scheduler(
    refresh_fn: Callable[[], bool] = refresh_gpu_data_internal,
    interval_hours: int | None = None,
) -> BackgroundScheduler:
    """Start the hourly GPU-catalog refresh scheduler."""
    if interval_hours is None:
        interval_hours = get_settings().gpu_refresh_interval_hours

    scheduler = BackgroundScheduler()

    scheduler.add_job(
        func=lambda: scheduled_refresh(refresh_fn),
        trigger=IntervalTrigger(hours=interval_hours),
        id="gpu_refresh_hourly",
        name="GPU Data Refresh Every Hour",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("📅 Планировщик запущен: обновление GPU данных каждый час")
    return scheduler
