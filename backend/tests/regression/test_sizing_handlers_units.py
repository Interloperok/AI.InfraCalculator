from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from api import sizing_handlers
from errors import ValidationAppError
from models import SizingInput, WhatIfRequest
from services.sizing_service import run_sizing


def _load_payload() -> dict:
    payload_path = Path(__file__).parent.parent / "payload.json"
    return json.loads(payload_path.read_text(encoding="utf-8"))


def test_size_endpoint_handler_wraps_value_error() -> None:
    inp = SizingInput(**_load_payload())
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.size_endpoint_handler(
            inp,
            run_sizing_fn=lambda x: (_ for _ in ()).throw(ValueError("bad input")),
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "bad input"


def test_report_endpoint_handler_wraps_file_not_found(monkeypatch) -> None:
    inp = SizingInput(**_load_payload())

    class _BrokenBuilder:
        def generate(self, payload: SizingInput) -> io.BytesIO:  # noqa: ARG002
            raise FileNotFoundError("missing template")

        @staticmethod
        def make_filename() -> str:
            return "x.xlsx"

    monkeypatch.setattr(sizing_handlers, "report_builder", _BrokenBuilder())
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.report_endpoint_handler(inp)
    assert exc.value.status_code == 500
    assert "missing template" in str(exc.value.detail)


def test_report_endpoint_handler_wraps_runtime_error(monkeypatch) -> None:
    inp = SizingInput(**_load_payload())

    class _BrokenBuilder:
        def generate(self, payload: SizingInput) -> io.BytesIO:  # noqa: ARG002
            raise RuntimeError("generation failed")

        @staticmethod
        def make_filename() -> str:
            return "x.xlsx"

    monkeypatch.setattr(sizing_handlers, "report_builder", _BrokenBuilder())
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.report_endpoint_handler(inp)
    assert exc.value.status_code == 500
    assert "generation failed" in str(exc.value.detail)


def test_whatif_endpoint_handler_rejects_unknown_override_field() -> None:
    req = WhatIfRequest(
        base=SizingInput(**_load_payload()),
        scenarios=[{"name": "bad", "overrides": {"unknown_field": 1}}],
    )
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.whatif_endpoint_handler(req, run_sizing_fn=run_sizing)
    assert exc.value.status_code == 400
    assert "Unknown field in overrides" in str(exc.value.detail)


def test_whatif_endpoint_handler_wraps_domain_errors() -> None:
    req = WhatIfRequest(
        base=SizingInput(**_load_payload()),
        scenarios=[{"name": "x", "overrides": {"internal_users": 100}}],
    )
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.whatif_endpoint_handler(
            req,
            run_sizing_fn=lambda inp: (_ for _ in ()).throw(ValidationAppError("boom")),  # noqa: ARG005
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "boom"


def test_auto_optimize_endpoint_handler_wraps_domain_errors(monkeypatch) -> None:
    inp = sizing_handlers.AutoOptimizeInput(
        params_billions=7,
        layers_L=32,
        hidden_size_H=4096,
        internal_users=1000,
        penetration_internal=0.2,
        concurrency_internal=0.1,
    )

    monkeypatch.setattr(
        sizing_handlers,
        "auto_optimize",
        lambda req: (_ for _ in ()).throw(ValidationAppError("bad optimize")),  # noqa: ARG005
    )
    with pytest.raises(HTTPException) as exc:
        sizing_handlers.auto_optimize_endpoint_handler(inp)
    assert exc.value.status_code == 400
    assert exc.value.detail == "bad optimize"
