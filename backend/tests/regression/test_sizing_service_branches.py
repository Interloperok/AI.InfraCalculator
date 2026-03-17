from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from models import SizingInput
from services import sizing_service


def _load_payload() -> dict:
    payload_path = Path(__file__).parent.parent / "payload.json"
    return json.loads(payload_path.read_text(encoding="utf-8"))


def test_run_sizing_uses_lookup_when_gpu_tflops_missing(monkeypatch) -> None:
    payload = _load_payload()
    payload["gpu_flops_Fcount"] = None
    inp = SizingInput(**payload)

    monkeypatch.setattr(sizing_service, "lookup_gpu_tflops", lambda gpu_id, gpu_mem_gb: 456.0)
    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", lambda *args: None)

    result = sizing_service.run_sizing(inp)
    assert result.gpu_tflops_used == 456.0


def test_run_sizing_sla_recommendations_when_both_targets_fail(monkeypatch) -> None:
    payload = _load_payload()
    payload["ttft_sla"] = 1e-6
    payload["e2e_latency_sla"] = 1e-6
    inp = SizingInput(**payload)

    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", lambda *args: None)
    result = sizing_service.run_sizing(inp)

    assert result.sla_passed is False
    assert result.sla_recommendations is not None
    assert any(item.startswith("1.") for item in result.sla_recommendations)
    assert any(item.startswith("7.") for item in result.sla_recommendations)


def test_run_sizing_sla_recommendations_when_only_ttft_fails(monkeypatch) -> None:
    payload = _load_payload()
    payload["ttft_sla"] = 1e-6
    payload["e2e_latency_sla"] = 1e9
    inp = SizingInput(**payload)

    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", lambda *args: None)
    result = sizing_service.run_sizing(inp)

    assert result.sla_passed is False
    assert result.sla_recommendations is not None
    assert any(item.startswith("3.") for item in result.sla_recommendations)


def test_run_sizing_sla_recommendations_when_only_e2e_fails(monkeypatch) -> None:
    payload = _load_payload()
    payload["ttft_sla"] = 1e9
    payload["e2e_latency_sla"] = 1e-6
    inp = SizingInput(**payload)

    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", lambda *args: None)
    result = sizing_service.run_sizing(inp)

    assert result.sla_passed is False
    assert result.sla_recommendations is not None
    assert any(item.startswith("4.") for item in result.sla_recommendations)


def test_run_sizing_passes_custom_catalog_list_to_price_lookup(monkeypatch) -> None:
    payload = _load_payload()
    payload["custom_gpu_catalog"] = [{"id": "x"}]
    inp = SizingInput(**payload)

    observed = {"arg": None}

    def _price_lookup(gpu_id: str, gpu_mem_gb: float, custom_catalog):  # noqa: ANN001
        observed["arg"] = custom_catalog
        return 0.0

    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", _price_lookup)
    sizing_service.run_sizing(inp)
    assert isinstance(observed["arg"], list)
    assert observed["arg"] == [{"id": "x"}]


def test_run_sizing_passes_custom_catalog_dict_values_to_price_lookup(monkeypatch) -> None:
    payload = _load_payload()
    payload["custom_gpu_catalog"] = {"a": {"id": "x"}, "b": {"id": "y"}}
    inp = SizingInput(**payload)

    observed = {"arg": None}

    def _price_lookup(gpu_id: str, gpu_mem_gb: float, custom_catalog):  # noqa: ANN001
        observed["arg"] = custom_catalog
        return 100.0

    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", _price_lookup)
    result = sizing_service.run_sizing(inp)

    assert isinstance(observed["arg"], list)
    assert len(observed["arg"]) == 2
    assert result.cost_estimate_usd is not None


def test_run_sizing_raises_when_compute_throughput_zero(monkeypatch) -> None:
    inp = SizingInput(**_load_payload())
    monkeypatch.setattr(sizing_service, "calc_servers_by_compute", lambda *args: math.inf)
    monkeypatch.setattr(sizing_service, "lookup_gpu_price_usd", lambda *args: None)
    with pytest.raises(
        sizing_service.ValidationAppError, match="Пропускная способность сервера = 0"
    ):
        sizing_service.run_sizing(inp)
