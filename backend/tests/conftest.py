"""Shared fixtures for backend API integration tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main


class _SchedulerStub:
    """Minimal scheduler stub for deterministic tests."""

    running = False

    def get_jobs(self) -> list:
        return []

    def shutdown(self) -> None:
        return None


@pytest.fixture(scope="session")
def test_data_dir() -> Path:
    return Path(__file__).parent


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("AI_SC_DISABLE_SCHEDULER", "1")
    monkeypatch.setattr(main, "refresh_gpu_data_internal", lambda: True)
    monkeypatch.setattr(main, "start_scheduler", lambda: _SchedulerStub())

    with TestClient(main.app) as api_client:
        yield api_client
