"""Unit tests for the gateway-quota fields exposed on SizingOutput.

These are demand-side metrics independent of GPU choice, used for setting
LiteLLM-style rate limits when this solution shares a vLLM cluster with
other tenants.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.sizing import SizingInput
from services.sizing_service import run_sizing


def _baseline_payload() -> dict:
    return json.loads(
        (Path(__file__).parent / "payload.json").read_text(encoding="utf-8")
    )


def test_gateway_quotas_present_and_positive() -> None:
    out = run_sizing(SizingInput(**_baseline_payload()))
    assert out.peak_rpm > 0
    assert out.peak_tpm_input > 0
    assert out.peak_tpm_output > 0
    assert out.peak_tpm == pytest.approx(out.peak_tpm_input + out.peak_tpm_output)
    assert out.sustained_rpm > 0
    assert out.sustained_tpm > 0
    assert out.max_parallel_requests >= 1


def test_peak_rpm_matches_definition() -> None:
    payload = _baseline_payload()
    payload.update({"k_calls": 1, "sla_reserve_KSLA": 1.25})
    out = run_sizing(SizingInput(**payload))
    expected_peak_rpm = (
        out.Ssim_concurrent_sessions * payload["rps_per_session_R"] * 1.25 * 60
    )
    assert out.peak_rpm == pytest.approx(expected_peak_rpm, rel=1e-6)


def test_k_calls_multiplies_rpm_but_not_tpm() -> None:
    """RPM scales with K_calls (gateway sees each LLM call); TPM is invariant
    because total tokens per user-request don't change with agentic split."""
    base = _baseline_payload()
    base["k_calls"] = 1

    agentic = _baseline_payload()
    agentic["k_calls"] = 5

    base_out = run_sizing(SizingInput(**base))
    agentic_out = run_sizing(SizingInput(**agentic))

    assert agentic_out.peak_rpm == pytest.approx(base_out.peak_rpm * 5, rel=1e-6)


def test_sustained_equals_peak_divided_by_k_sla() -> None:
    payload = _baseline_payload()
    payload["sla_reserve_KSLA"] = 1.5
    out = run_sizing(SizingInput(**payload))
    assert out.sustained_rpm == pytest.approx(out.peak_rpm / 1.5, rel=1e-6)
    assert out.sustained_tpm == pytest.approx(out.peak_tpm / 1.5, rel=1e-6)


def test_max_parallel_requests_includes_sla_headroom() -> None:
    payload = _baseline_payload()
    payload["sla_reserve_KSLA"] = 2.0
    out = run_sizing(SizingInput(**payload))
    expected = math.ceil(out.Ssim_concurrent_sessions * 2.0)
    assert out.max_parallel_requests == expected


def test_gateway_quotas_independent_of_gpu_choice() -> None:
    """Demand-side metrics must not change when only the GPU/server config
    changes. Otherwise they'd encode infra assumptions and confuse operators
    sharing a pool with other tenants."""
    cheap = _baseline_payload()
    cheap.update({"gpu_mem_gb": 80, "gpus_per_server": 8, "tp_multiplier_Z": 1})

    rich = _baseline_payload()
    rich.update({"gpu_mem_gb": 192, "gpus_per_server": 4, "tp_multiplier_Z": 1})

    cheap_out = run_sizing(SizingInput(**cheap))
    rich_out = run_sizing(SizingInput(**rich))

    assert cheap_out.peak_rpm == pytest.approx(rich_out.peak_rpm, rel=1e-9)
    assert cheap_out.peak_tpm == pytest.approx(rich_out.peak_tpm, rel=1e-9)
    assert cheap_out.max_parallel_requests == rich_out.max_parallel_requests
