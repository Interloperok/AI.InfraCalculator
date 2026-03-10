from __future__ import annotations

import logging

from logging_config import configure_logger


def test_configure_logger_falls_back_to_info_on_invalid_level(monkeypatch) -> None:
    class _Settings:
        log_level = "not-a-level"

    monkeypatch.setattr("logging_config.get_settings", lambda: _Settings())
    logger = configure_logger("test.logging.invalid")
    assert logger.level == logging.INFO


def test_configure_logger_reuses_handlers(monkeypatch) -> None:
    class _Settings:
        log_level = "DEBUG"

    monkeypatch.setattr("logging_config.get_settings", lambda: _Settings())
    logger = configure_logger("test.logging.reuse")
    handlers_before = len(logger.handlers)

    logger2 = configure_logger("test.logging.reuse")
    assert logger2.level == logging.DEBUG
    assert len(logger2.handlers) == handlers_before
