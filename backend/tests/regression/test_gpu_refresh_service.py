from __future__ import annotations

import json
from pathlib import Path

from services import gpu_refresh_service


def test_refresh_gpu_data_internal_success(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(gpu_refresh_service, "BACKEND_DIR", tmp_path)

    def _scrape(path):
        Path(path).write_text(json.dumps({"gpu": {"Vendor": "NVIDIA"}}), encoding="utf-8")

    def _normalize(raw_path: str, out_path: str):
        raw = json.loads(Path(raw_path).read_text(encoding="utf-8"))
        Path(out_path).write_text(json.dumps(list(raw.values())), encoding="utf-8")

    monkeypatch.setattr(gpu_refresh_service, "scrape_gpu_catalog_raw", _scrape)
    monkeypatch.setattr(gpu_refresh_service, "normalize_gpu_data", _normalize)

    assert gpu_refresh_service.refresh_gpu_data_internal() is True
    assert (tmp_path / "gpu_data.json").exists()


def test_refresh_gpu_data_internal_failure(monkeypatch) -> None:
    def _boom(path):
        raise RuntimeError("boom")

    monkeypatch.setattr(gpu_refresh_service, "scrape_gpu_catalog_raw", _boom)
    assert gpu_refresh_service.refresh_gpu_data_internal() is False


def test_scheduled_refresh_calls_function() -> None:
    called = {"value": False}

    def _refresh() -> bool:
        called["value"] = True
        return True

    gpu_refresh_service.scheduled_refresh(_refresh)
    assert called["value"] is True


def test_start_scheduler_wires_interval_job(monkeypatch) -> None:
    class _FakeScheduler:
        def __init__(self) -> None:
            self.started = False
            self.jobs = []

        def add_job(self, **kwargs) -> None:  # noqa: ANN003
            self.jobs.append(kwargs)

        def start(self) -> None:
            self.started = True

    monkeypatch.setattr(gpu_refresh_service, "BackgroundScheduler", _FakeScheduler)
    monkeypatch.setattr(gpu_refresh_service, "IntervalTrigger", lambda hours: {"hours": hours})

    scheduler = gpu_refresh_service.start_scheduler(refresh_fn=lambda: True, interval_hours=2)

    assert scheduler.started is True
    assert len(scheduler.jobs) == 1
    assert scheduler.jobs[0]["id"] == "gpu_refresh_hourly"
    assert scheduler.jobs[0]["trigger"] == {"hours": 2}


def test_start_scheduler_uses_settings_interval_when_not_provided(monkeypatch) -> None:
    class _FakeScheduler:
        def __init__(self) -> None:
            self.started = False
            self.jobs = []

        def add_job(self, **kwargs) -> None:  # noqa: ANN003
            self.jobs.append(kwargs)

        def start(self) -> None:
            self.started = True

    class _Settings:
        gpu_refresh_interval_hours = 3

    monkeypatch.setattr(gpu_refresh_service, "BackgroundScheduler", _FakeScheduler)
    monkeypatch.setattr(gpu_refresh_service, "IntervalTrigger", lambda hours: {"hours": hours})
    monkeypatch.setattr(gpu_refresh_service, "get_settings", lambda: _Settings())

    scheduler = gpu_refresh_service.start_scheduler(refresh_fn=lambda: True)

    assert scheduler.started is True
    assert scheduler.jobs[0]["trigger"] == {"hours": 3}
