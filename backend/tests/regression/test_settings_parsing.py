from __future__ import annotations

import pytest

import settings


def test_parse_bool_env_valid_values(monkeypatch) -> None:
    monkeypatch.setenv("BOOL_ENV", "true")
    assert settings._parse_bool_env("BOOL_ENV", default=False) is True

    monkeypatch.setenv("BOOL_ENV", "0")
    assert settings._parse_bool_env("BOOL_ENV", default=True) is False


def test_parse_bool_env_invalid_value(monkeypatch) -> None:
    monkeypatch.setenv("BOOL_ENV", "maybe")
    with pytest.raises(ValueError):
        settings._parse_bool_env("BOOL_ENV", default=False)


def test_parse_positive_int_env_paths(monkeypatch) -> None:
    monkeypatch.delenv("INT_ENV", raising=False)
    assert settings._parse_positive_int_env("INT_ENV", default=3) == 3

    monkeypatch.setenv("INT_ENV", "2")
    assert settings._parse_positive_int_env("INT_ENV", default=1) == 2

    monkeypatch.setenv("INT_ENV", "0")
    with pytest.raises(ValueError):
        settings._parse_positive_int_env("INT_ENV", default=1)


def test_parse_positive_int_env_rejects_non_integer(monkeypatch) -> None:
    monkeypatch.setenv("INT_ENV", "abc")
    with pytest.raises(ValueError):
        settings._parse_positive_int_env("INT_ENV", default=1)


def test_get_settings_reads_env(monkeypatch) -> None:
    settings.get_settings.cache_clear()
    monkeypatch.setenv("AI_SC_ENV", "prod")
    monkeypatch.setenv("AI_SC_LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("AI_SC_DISABLE_SCHEDULER", "1")
    monkeypatch.setenv("AI_SC_GPU_REFRESH_INTERVAL_HOURS", "6")

    cfg = settings.get_settings()
    assert cfg.app_env == "prod"
    assert cfg.log_level == "DEBUG"
    assert cfg.disable_scheduler is True
    assert cfg.gpu_refresh_interval_hours == 6

    settings.get_settings.cache_clear()
