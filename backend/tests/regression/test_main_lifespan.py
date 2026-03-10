from __future__ import annotations

import asyncio
from pathlib import Path

import main


def test_lifespan_triggers_initial_refresh_and_scheduler(monkeypatch, tmp_path: Path) -> None:
    class _Settings:
        disable_scheduler = False
        gpu_data_path = tmp_path / "missing_gpu_data.json"

    called = {"refresh": False, "started": False, "shutdown": False}

    class _Scheduler:
        running = True

        def get_jobs(self):  # noqa: ANN201
            return []

        def shutdown(self) -> None:
            called["shutdown"] = True

    def _refresh() -> bool:
        called["refresh"] = True
        return True

    def _start() -> _Scheduler:
        called["started"] = True
        return _Scheduler()

    monkeypatch.setattr(main, "get_settings", lambda: _Settings())
    monkeypatch.setattr(main, "refresh_gpu_data_internal", _refresh)
    monkeypatch.setattr(main, "start_scheduler", _start)

    async def _run() -> None:
        async with main.lifespan(main.app):
            pass

    asyncio.run(_run())

    assert called["refresh"] is True
    assert called["started"] is True
    assert called["shutdown"] is True
