"""Shared fixtures for backend API integration tests."""

from __future__ import annotations

import importlib
from pathlib import Path
from types import ModuleType
import warnings

import pytest
from fastapi.testclient import TestClient


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


@pytest.fixture(scope="session")
def main_module() -> ModuleType:
    # FastAPI (transitively) triggers this Python 3.14 deprecation during route setup.
    # Keep strict deprecation mode for project code, but ignore this third-party warning.
    warnings.filterwarnings(
        "ignore",
        message=(
            r"'asyncio\.iscoroutinefunction' is deprecated and slated for removal in Python 3\.16; "
            r"use inspect\.iscoroutinefunction\(\) instead"
        ),
        category=DeprecationWarning,
    )
    return importlib.import_module("main")


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, main_module: ModuleType) -> TestClient:
    monkeypatch.setenv("AI_SC_DISABLE_SCHEDULER", "1")
    monkeypatch.setattr(main_module, "refresh_gpu_data_internal", lambda: True)
    monkeypatch.setattr(main_module, "start_scheduler", lambda: _SchedulerStub())

    with TestClient(main_module.app) as api_client:
        yield api_client
