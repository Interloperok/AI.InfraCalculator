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


def test_scheduler_status_when_running(client, main_module) -> None:
    class _Job:
        id = "job-1"
        name = "refresh"
        next_run_time = None

    class _RunningScheduler:
        running = True

        def get_jobs(self):
            return [_Job()]

        def shutdown(self):
            return None

    main_module.scheduler = _RunningScheduler()
    response = client.get("/v1/scheduler/status")
    assert response.status_code == 200
    body = response.json()
    assert body["scheduler_running"] is True
    assert body["jobs_count"] == 1
    assert body["jobs"][0]["id"] == "job-1"


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


def test_report_endpoint_returns_xlsx_stream(client, test_data_dir) -> None:
    payload = _load_json(test_data_dir / "payload.json")

    response = client.post("/v1/report", json=payload)
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment; filename=\"sizing_report_" in response.headers["content-disposition"]
    assert response.content.startswith(b"PK")


def test_refresh_endpoint_returns_success(client) -> None:
    response = client.post("/v1/gpus/refresh")
    assert response.status_code == 200

    body = response.json()
    assert body["success"] is True
    assert "Successfully updated" in body["message"]
    assert body["gpus_updated"] >= 0


def test_refresh_endpoint_failure_path(client, main_module, monkeypatch) -> None:
    monkeypatch.setattr(main_module, "refresh_gpu_data_internal", lambda: False)

    response = client.post("/v1/gpus/refresh")
    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to refresh GPU data"


def test_export_gpu_catalog_route_calls_handler(client, main_module, monkeypatch) -> None:
    from fastapi.responses import JSONResponse

    monkeypatch.setattr(
        main_module,
        "export_gpu_catalog_handler",
        lambda: JSONResponse(content={"ok": True}),
    )

    response = client.get("/v1/gpus/export")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_gpu_details_route_calls_handler(client, main_module, monkeypatch) -> None:
    monkeypatch.setattr(
        main_module,
        "get_gpu_details_handler",
        lambda gpu_id: {
            "id": gpu_id,
            "vendor": "NVIDIA",
            "model": "RTX 4090",
            "memory_gb": 24,
            "cores": 16384,
            "launch_date": "2022-10-12",
            "memory_type": "GDDR6X",
            "recommended_gpus_per_server": 8,
            "estimated_tps_per_instance": 1000.0,
            "full_name": "NVIDIA RTX 4090",
            "tdp_watts": "450 W",
            "tflops": 82.6,
            "price_usd": 1599.0,
        },
    )

    response = client.get("/v1/gpus/custom-id")
    assert response.status_code == 200
    assert response.json()["id"] == "custom-id"


def test_gpu_stats_function_calls_handler(main_module, monkeypatch) -> None:
    monkeypatch.setattr(
        main_module,
        "get_gpu_stats_handler",
        lambda: {
            "total_gpus": 1,
            "vendors": {"NVIDIA": 1},
            "memory_ranges": {"16-32GB": 1},
            "year_ranges": {"2020s": 1},
        },
    )

    response = main_module.get_gpu_stats()
    assert response["total_gpus"] == 1
