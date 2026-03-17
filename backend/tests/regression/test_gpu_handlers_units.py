from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from api import gpu_handlers


def test_get_gpus_handler_file_not_found(monkeypatch) -> None:
    monkeypatch.setattr(
        gpu_handlers, "list_gpus", lambda **kwargs: (_ for _ in ()).throw(FileNotFoundError())
    )
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.get_gpus_handler(None, None, None, None, None, None, None, 1, 20, None)
    assert exc.value.status_code == 404


def test_get_gpu_details_handler_key_error(monkeypatch) -> None:
    monkeypatch.setattr(
        gpu_handlers, "get_gpu_details", lambda gpu_id: (_ for _ in ()).throw(KeyError(gpu_id))
    )
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.get_gpu_details_handler("missing")
    assert exc.value.status_code == 404


def test_get_gpu_details_handler_file_not_found(monkeypatch) -> None:
    monkeypatch.setattr(
        gpu_handlers,
        "get_gpu_details",
        lambda gpu_id: (_ for _ in ()).throw(FileNotFoundError(gpu_id)),
    )
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.get_gpu_details_handler("missing")
    assert exc.value.status_code == 404


def test_export_gpu_catalog_handler_missing_file(monkeypatch, tmp_path: Path) -> None:
    missing = tmp_path / "gpu_catalog.json"
    monkeypatch.setattr(gpu_handlers, "export_gpu_catalog_path", lambda: missing)
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.export_gpu_catalog_handler()
    assert exc.value.status_code == 404


def test_export_gpu_catalog_handler_success(monkeypatch, tmp_path: Path) -> None:
    path = tmp_path / "gpu_catalog.json"
    path.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(gpu_handlers, "export_gpu_catalog_path", lambda: path)

    response = gpu_handlers.export_gpu_catalog_handler()
    assert response.path == str(path)


def test_refresh_gpu_data_handler_failure() -> None:
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.refresh_gpu_data_handler(refresh_fn=lambda: False)
    assert exc.value.status_code == 500


def test_refresh_gpu_data_handler_handles_catalog_load_errors(monkeypatch) -> None:
    monkeypatch.setattr(
        gpu_handlers, "load_gpu_catalog", lambda: (_ for _ in ()).throw(ValueError("bad json"))
    )
    response = gpu_handlers.refresh_gpu_data_handler(refresh_fn=lambda: True)
    assert response.success is True
    assert response.gpus_updated == 0


def test_get_gpu_stats_handler_file_not_found(monkeypatch) -> None:
    monkeypatch.setattr(
        gpu_handlers, "get_gpu_stats", lambda: (_ for _ in ()).throw(FileNotFoundError())
    )
    with pytest.raises(HTTPException) as exc:
        gpu_handlers.get_gpu_stats_handler()
    assert exc.value.status_code == 404
