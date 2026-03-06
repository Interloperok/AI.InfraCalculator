from __future__ import annotations

import logging

from settings import get_settings


def configure_logger(name: str) -> logging.Logger:
    """Создать/настроить логгер приложения в едином формате."""
    settings = get_settings()
    level = logging.getLevelName(settings.log_level.upper())
    if isinstance(level, str):
        level = logging.INFO

    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger
