from __future__ import annotations

import io
import json
import re
from pathlib import Path

import openpyxl
import pytest

from models import SizingInput
from services.report_service import ReportGenerator


def test_report_service_outputs_xlsx_and_expected_cells() -> None:
    payload_path = Path(__file__).parent.parent / "payload.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    sizing_input = SizingInput(**payload)

    generator = ReportGenerator()
    result = generator.generate(sizing_input)

    assert isinstance(result, io.BytesIO)
    assert result.getbuffer().nbytes > 0
    assert result.getvalue().startswith(b"PK")

    workbook = openpyxl.load_workbook(io.BytesIO(result.getvalue()))
    inputs = workbook["Inputs"]

    # Cell addresses follow `llm_calc.inputs.build_inputs()` layout —
    # see services/report_service.py:_fill_template for the mapping.
    assert inputs["D7"].value == payload["internal_users"]
    assert inputs["D8"].value == payload["penetration_internal"]
    assert inputs["D15"].value == payload["system_prompt_tokens_SP"]
    assert inputs["D29"].value == payload["gpus_per_server"]
    assert inputs["D58"].value == payload["safe_margin"]
    assert inputs["D75"].value == payload["rps_per_session_R"]


def test_report_service_raises_when_template_missing(tmp_path: Path) -> None:
    payload_path = Path(__file__).parent.parent / "payload.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    sizing_input = SizingInput(**payload)

    generator = ReportGenerator(template_path=str(tmp_path / "missing.xlsx"))
    try:
        generator.generate(sizing_input)
        raise AssertionError("expected FileNotFoundError")
    except FileNotFoundError:
        pass


def test_report_service_wraps_template_fill_errors(monkeypatch) -> None:
    payload_path = Path(__file__).parent.parent / "payload.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    sizing_input = SizingInput(**payload)

    generator = ReportGenerator()

    def _boom(inp: SizingInput):  # noqa: ARG001
        raise ValueError("broken template")

    monkeypatch.setattr(generator, "_fill_template", _boom)
    with pytest.raises(RuntimeError):
        generator.generate(sizing_input)


# ── Web selection -> Excel dropdowns ──────────────────────────────────────────
#
# The Inputs sheet drives GPU / LLM / quantization through dropdowns whose
# options live on the Reference sheet (INDEX/MATCH lookups). The report must
# show exactly what the web session used, so the generator injects the web
# values as Reference rows and points the dropdown cells at them.

_RANGE_RE = re.compile(r"Reference!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)")


def _workbook_for(overrides: dict) -> openpyxl.Workbook:
    payload_path = Path(__file__).parent.parent / "payload.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    payload.update(overrides)
    result = ReportGenerator().generate(SizingInput(**payload))
    return openpyxl.load_workbook(io.BytesIO(result.getvalue()))


def _dropdown_rows(inputs, cell: str) -> tuple[int, int]:
    for dv in inputs.data_validations.dataValidation:
        if cell in dv.sqref:
            match = _RANGE_RE.search(dv.formula1)
            assert match, f"{cell} validation is not a Reference range: {dv.formula1}"
            return int(match.group(2)), int(match.group(4))
    raise AssertionError(f"no data validation on {cell}")


def _lookup_rows(inputs, cell: str) -> tuple[int, int]:
    match = _RANGE_RE.search(inputs[cell].value)
    assert match, f"{cell} is not a Reference lookup: {inputs[cell].value}"
    return int(match.group(2)), int(match.group(4))


def _reference_row(reference, label: str, first: int, last: int) -> int:
    rows = [r for r in range(first, last + 1) if reference[f"A{r}"].value == label]
    assert rows, f"{label!r} not found in Reference!A{first}:A{last}"
    assert len(rows) == 1, f"{label!r} appears more than once; MATCH would pick the wrong row"
    return rows[0]


def test_report_selects_web_gpu_in_dropdown_and_reference_row() -> None:
    wb = _workbook_for(
        {
            "gpu_id": "nvidia-h100-gpu-accelerator-sxm-card",
            "gpu_name": "NVIDIA H100 GPU accelerator (SXM card)",
            "gpu_mem_gb": 80,
            "gpu_flops_Fcount": 989.4,
            "bw_gpu_gbs": 3352,
        }
    )
    inputs, reference = wb["Inputs"], wb["Reference"]

    assert inputs["D25"].value == "NVIDIA H100 GPU accelerator (SXM card)"
    first, last = _dropdown_rows(inputs, "D25")
    row = _reference_row(reference, inputs["D25"].value, first, last)
    assert [reference[f"{c}{row}"].value for c in "BCD"] == [80, 989.4, 3352]
    for lookup in ("D26", "D27", "D28"):
        assert _lookup_rows(inputs, lookup) == (first, last)
    # Catalog rows above the injected one are untouched.
    assert reference["A11"].value == "H100 SXM 80GB"
    assert reference["C11"].value == 989


def test_report_selects_web_model_in_dropdown_and_reference_row() -> None:
    wb = _workbook_for(
        {
            "model_name": "Qwen/Qwen3-0.6B",
            "params_billions": 0.6,
            "layers_L": 28,
            "hidden_size_H": 1024,
            "num_attention_heads": 16,
            "num_kv_heads": 8,
            "head_dim": 128,
            "max_context_window_TSmax": 40960,
        }
    )
    inputs, reference = wb["Inputs"], wb["Reference"]

    assert inputs["D35"].value == "Qwen/Qwen3-0.6B"
    first, last = _dropdown_rows(inputs, "D35")
    row = _reference_row(reference, "Qwen/Qwen3-0.6B", first, last)
    values = [reference[f"{c}{row}"].value for c in "BCDEFGHIJKLMNOP"]
    assert values == [0.6, 0.6, 28, 1024, 16, 8, 128, "dense/GQA", 40960, 0, 0, 0, 0, 0, 0]
    for lookup in ("D36", "D37", "D38", "D39", "D40", "D41", "D42", "D43", "D44"):
        assert _lookup_rows(inputs, lookup) == (first, last)


def test_report_model_row_carries_moe_and_mla_fields() -> None:
    wb = _workbook_for(
        {
            "model_name": "deepseek-ai/DeepSeek-V3",
            "params_billions": 671,
            "params_active": 37,
            "params_dense": 20,
            "params_moe": 651,
            "n_experts": 256,
            "k_experts": 8,
            "layers_L": 61,
            "hidden_size_H": 7168,
            "num_attention_heads": 128,
            "num_kv_heads": 128,
            "kv_lora_rank": 512,
            "qk_rope_head_dim": 64,
        }
    )
    inputs, reference = wb["Inputs"], wb["Reference"]
    first, last = _dropdown_rows(inputs, "D35")
    row = _reference_row(reference, "deepseek-ai/DeepSeek-V3", first, last)
    assert reference[f"C{row}"].value == 37
    assert reference[f"I{row}"].value == "MoE/MLA"
    assert [reference[f"{c}{row}"].value for c in "KLMNOP"] == [512, 64, 20, 651, 8, 256]


def test_report_disambiguates_model_label_that_exists_in_reference() -> None:
    # Same name as a catalog row but different architecture numbers: the
    # web row must win the MATCH, so its label gets a suffix.
    wb = _workbook_for({"model_name": "Qwen3-32B", "params_billions": 32, "hidden_size_H": 4096})
    inputs, reference = wb["Inputs"], wb["Reference"]
    assert inputs["D35"].value == "Qwen3-32B (web)"
    first, last = _dropdown_rows(inputs, "D35")
    row = _reference_row(reference, "Qwen3-32B (web)", first, last)
    assert reference[f"E{row}"].value == 4096
    assert reference["E25"].value == 5120


def test_report_maps_standard_bytes_per_param_to_existing_quantization() -> None:
    for bytes_per_param, label in ((4, "FP32"), (2, "FP16"), (1, "FP8"), (0.5, "INT4")):
        wb = _workbook_for({"bytes_per_param": bytes_per_param})
        inputs, reference = wb["Inputs"], wb["Reference"]
        assert inputs["D53"].value == label
        assert _dropdown_rows(inputs, "D53") == (89, 94)
        assert reference["A95"].value is None


def test_report_adds_quantization_row_for_custom_bytes_per_param() -> None:
    wb = _workbook_for({"bytes_per_param": 1.5})
    inputs, reference = wb["Inputs"], wb["Reference"]
    first, last = _dropdown_rows(inputs, "D53")
    row = _reference_row(reference, inputs["D53"].value, first, last)
    assert reference[f"B{row}"].value == 1.5
    assert _lookup_rows(inputs, "D54") == (first, last)


def test_report_gpu_label_falls_back_to_catalog_then_generic() -> None:
    wb = _workbook_for({"gpu_id": "nvidia-h100-gpu-accelerator-sxm-card"})
    assert wb["Inputs"]["D25"].value == "NVIDIA H100 GPU accelerator (SXM card)"

    wb = _workbook_for({"gpu_id": "preset-a100-80", "gpu_mem_gb": 80})
    inputs, reference = wb["Inputs"], wb["Reference"]
    assert inputs["D25"].value == "Custom GPU 80 GB"
    first, last = _dropdown_rows(inputs, "D25")
    row = _reference_row(reference, "Custom GPU 80 GB", first, last)
    assert reference[f"B{row}"].value == 80
    assert reference[f"C{row}"].value == 312


def test_report_model_label_falls_back_to_generic() -> None:
    wb = _workbook_for({"params_billions": 7})
    assert wb["Inputs"]["D35"].value == "Custom model 7B"


def test_report_fills_engine_calibration_and_agentic_inputs() -> None:
    wb = _workbook_for(
        {
            "eta_mem": 0.4,
            "k_spec": 1.8,
            "engine_mode": "static",
            "c_pf": 128,
            "t_overhead": 0.03,
            "o_fixed": 8,
            "k_calls": 5,
            "sp_tools": 1000,
            "c_rag_static": 300,
            "c_rag_dynamic": 2000,
            "a_tool": 150,
        }
    )
    inputs, agentic = wb["Inputs"], wb["Agentic"]
    assert [inputs[c].value for c in ("D63", "D68", "D69", "D70", "D71", "D72")] == [
        0.4,
        1.8,
        "static",
        128,
        0.03,
        8,
    ]
    # Excel folds static RAG context into SP_tools (SP_eff = SP + SP_tools),
    # matching the backend's SP_eff = SP + SP_tools + C_rag_static.
    assert [agentic[c].value for c in ("D23", "D24", "D25", "D26")] == [5, 1300, 2000, 150]
