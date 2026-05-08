"""
Golden-fixture regression tests for sizing behavior.

Fixtures in tests/fixtures/golden encode representative scenarios:
- valid baseline/load/stress calculations (LLM, default endpoint)
- valid VLM single-pass online and multi-class scenarios (endpoint=size-vlm)
- valid OCR+LLM two-pass scenarios (endpoint=size-ocr)
- invalid runtime memory-fit scenario
- invalid input validation scenario

Each fixture may declare an `endpoint` field ("size" | "size-vlm" |
"size-ocr"). Default is "size" (LLM endpoint) for backward compatibility.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from errors import ValidationAppError
from pydantic import ValidationError

# Preserve the current style of direct module imports for backend tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.sizing import OCRSizingInput, SizingInput, VLMSizingInput  # noqa: E402
from services.ocr_sizing_service import run_ocr_sizing  # noqa: E402
from services.sizing_service import run_sizing  # noqa: E402
from services.vlm_sizing_service import run_vlm_sizing  # noqa: E402


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "golden"


# Endpoint dispatch table: {endpoint: (InputModel, run_fn)}
ENDPOINTS = {
    "size": (SizingInput, run_sizing),
    "size-vlm": (VLMSizingInput, run_vlm_sizing),
    "size-ocr": (OCRSizingInput, run_ocr_sizing),
}


def _load_fixtures(kind: str) -> list[object]:
    params = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("kind") == kind:
            params.append(pytest.param(data, id=path.stem))
    return params


VALID_FIXTURES = _load_fixtures("valid")
HTTP_ERROR_FIXTURES = _load_fixtures("http_error")
VALIDATION_ERROR_FIXTURES = _load_fixtures("validation_error")


@pytest.mark.parametrize("fixture", VALID_FIXTURES)
def test_golden_valid_outputs(fixture):
    endpoint = fixture.get("endpoint", "size")
    if endpoint not in ENDPOINTS:
        raise ValueError(f"Unknown endpoint in fixture: {endpoint!r}")
    input_cls, run_fn = ENDPOINTS[endpoint]
    result = run_fn(input_cls(**fixture["input"])).model_dump()
    expected = fixture["expected"]

    assert set(result.keys()) == set(expected.keys())
    for key, expected_value in expected.items():
        actual_value = result[key]
        if isinstance(expected_value, float):
            assert actual_value == pytest.approx(expected_value, rel=1e-9, abs=1e-9)
        else:
            assert actual_value == expected_value


@pytest.mark.parametrize("fixture", HTTP_ERROR_FIXTURES)
def test_golden_runtime_http_errors(fixture):
    with pytest.raises(ValidationAppError) as exc_info:
        run_sizing(SizingInput(**fixture["input"]))

    assert exc_info.value.status_code == fixture["expected_status_code"]
    assert fixture["expected_error_contains"] in str(exc_info.value)


@pytest.mark.parametrize("fixture", VALIDATION_ERROR_FIXTURES)
def test_golden_validation_errors(fixture):
    with pytest.raises(ValidationError) as exc_info:
        SizingInput(**fixture["input"])

    assert fixture["expected_error_contains"] in str(exc_info.value)
