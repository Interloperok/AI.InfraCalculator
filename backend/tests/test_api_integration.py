"""Integration tests for public backend API endpoints."""

from __future__ import annotations

import json
from pathlib import Path


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_healthz_returns_ok(client) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_scheduler_status_is_deterministic(client) -> None:
    response = client.get("/v1/scheduler/status")
    assert response.status_code == 200

    body = response.json()
    assert body["scheduler_running"] is False
    assert body["jobs_count"] == 0
    assert body["jobs"] == []


def test_size_endpoint_returns_consistent_result(client, test_data_dir) -> None:
    payload = _load_json(test_data_dir / "payload.json")

    response = client.post("/v1/size", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["servers_final"] >= 0
    assert body["servers_by_memory"] >= 0
    assert body["servers_by_compute"] >= 0
    assert body["servers_final"] == max(body["servers_by_memory"], body["servers_by_compute"])
    assert body["Ssim_concurrent_sessions"] >= 0
    assert body["th_server_comp"] >= 0


def test_size_endpoint_validation_error(client, test_data_dir) -> None:
    payload = _load_json(test_data_dir / "payload.json")
    payload["internal_users"] = -1

    response = client.post("/v1/size", json=payload)
    assert response.status_code == 422


def test_size_endpoint_returns_memory_fit_error(client, test_data_dir) -> None:
    payload = _load_json(test_data_dir / "payload.json")
    payload.update(
        {
            "params_billions": 400,
            "gpu_mem_gb": 8,
            "gpus_per_server": 1,
            "tp_multiplier_Z": 1,
        }
    )

    response = client.post("/v1/size", json=payload)
    assert response.status_code == 400
    assert "Невозможно разместить сессии по памяти" in response.json()["detail"]


def test_whatif_endpoint_returns_named_scenarios(client, test_data_dir) -> None:
    payload = _load_json(test_data_dir / "whatif.json")

    response = client.post("/v1/whatif", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert isinstance(body, list)
    assert len(body) == len(payload["scenarios"])

    expected_names = [scenario["name"] for scenario in payload["scenarios"]]
    assert [item["name"] for item in body] == expected_names
    for item in body:
        assert item["output"]["servers_final"] >= 0
