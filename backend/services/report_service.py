"""
Excel report generator using the reportTemplate.xlsx template.

Populates the template cells marked as "input" with values from SizingInput.
Formula cells ("calculated") are preserved and recomputed by Excel on file
open.

The GPU, LLM and quantization inputs are dropdowns whose options live on the
Reference sheet and feed INDEX/MATCH lookups. The web selection is written
there as its own Reference row and the dropdown cell is pointed at it, so the
downloaded file shows the same choice and derives the same numbers as the
web calculation while the dropdowns keep working.
"""

from __future__ import annotations

import io
import logging
import re
from copy import copy
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.worksheet import Worksheet

from core.methodology_constants import DEFAULT_QUANTIZATION_LABEL
from models import SizingInput
from services.gpu_catalog_service import (
    load_gpu_catalog,
    lookup_gpu_bandwidth_gbs,
    lookup_gpu_name,
)
from services.llm_catalog_service import load_llm_catalog
from services.report_reference import capture_styles, write_reference

logger = logging.getLogger("sizing.report")

# Path to the Excel template at the backend root.
REPORT_TEMPLATE_PATH = str(Path(__file__).resolve().parents[1] / "reportTemplate.xlsx")

# Inputs dropdown cells backed by lists on the Reference sheet.
GPU_CELL = "D25"
MODEL_CELL = "D35"
QUANT_CELL = "D53"

# Preferred Reference label for a bytes-per-parameter value when the request
# carries no explicit ``quantization`` label (single source: §3.1 constants).
QUANTIZATION_LABELS = DEFAULT_QUANTIZATION_LABEL

WEB_LABEL_SUFFIX = " (web)"
WEB_ROW_NOTE = "Web session"

REFERENCE_COLUMNS = "ABCDEFGHIJKLMNOP"

_LIST_RANGE_RE = re.compile(r"Reference!\$A\$(\d+):\$A\$(\d+)")


class ReportGenerator:
    """
    Excel report generator backed by a template.

    Accepts sizing input parameters (SizingInput) and optionally a
    callable for looking up GPU TFLOPS in the catalog.
    """

    def __init__(
        self,
        template_path: str = REPORT_TEMPLATE_PATH,
        gpu_tflops_lookup: Optional[Callable] = None,
    ):
        self.template_path = template_path
        self._gpu_tflops_lookup = gpu_tflops_lookup

    @property
    def template_exists(self) -> bool:
        """Check whether the template file exists."""
        return Path(self.template_path).exists()

    def _resolve_gpu_tflops(self, inp: SizingInput) -> float:
        """
        Resolve the GPU TFLOPS value.

        Priority:
        1. Explicit value in the input (gpu_flops_Fcount)
        2. Lookup in the GPU catalog by gpu_id / gpu_mem_gb
        3. 0 (if nothing is found)
        """
        if inp.gpu_flops_Fcount is not None:
            return inp.gpu_flops_Fcount

        if self._gpu_tflops_lookup is not None:
            tflops = self._gpu_tflops_lookup(inp.gpu_id, inp.gpu_mem_gb)
            if tflops:
                return tflops

        return 0

    def _fill_template(self, inp: SizingInput) -> openpyxl.Workbook:
        """
        Loads the template and populates the Inputs sheet's INPUT cells with
        values from SizingInput. Cell addresses match the layout produced by
        `llm_calc.inputs.build_inputs()` — keep these in sync if the source
        Inputs layout changes.
        """
        wb = openpyxl.load_workbook(self.template_path)
        ws = wb["Inputs"]

        # Reference lists come from the API catalogs on every download, so a
        # catalog refresh never leaves the workbook with stale numbers.
        reference = wb["Reference"]
        write_reference(
            reference, load_gpu_catalog(), load_llm_catalog(), capture_styles(reference)
        )

        # ── Workload (4 segments; web sends 2: internal + external) ──
        # Segment columns: D=internal (Внутренние), E=external (Внешние), F/G=spare segments.
        ws["D7"] = inp.internal_users
        ws["D8"] = inp.penetration_internal
        ws["D9"] = inp.concurrency_internal
        ws["D10"] = inp.sessions_per_user_J

        ws["E7"] = inp.external_users
        ws["E8"] = inp.penetration_external
        ws["E9"] = inp.concurrency_external
        ws["E10"] = inp.sessions_per_user_J

        for col in ("F", "G"):
            ws[f"{col}7"] = 0
            ws[f"{col}8"] = 0
            ws[f"{col}9"] = 0
            ws[f"{col}10"] = 0

        # ── Tokens (Section 2.2) ──
        ws["D15"] = inp.system_prompt_tokens_SP
        ws["D16"] = inp.user_prompt_tokens_Prp
        ws["D17"] = inp.answer_tokens_A
        ws["D18"] = inp.reasoning_tokens_MRT
        ws["D19"] = inp.dialog_turns
        # h_reason (§2.2): reasoning of past turns kept in history.
        ws["D23"] = 1 if inp.reasoning_in_history else 0

        # ── Hardware (Section 4) ──
        self._select_gpu(wb, inp)
        ws["D29"] = inp.gpus_per_server
        ws["D30"] = inp.kavail
        ws["D31"] = inp.tp_multiplier_Z

        # ── Model (Section 3) ──
        self._select_model(wb, inp)
        self._select_quantization(wb, inp)

        # ── Calibration coefficients (Section 3.1 / Е) ──
        ws["D55"] = inp.bytes_per_kv_state
        ws["D56"] = inp.emp_model
        ws["D57"] = inp.emp_kv
        ws["D58"] = inp.safe_margin

        # ── Compute calibration (Section 6 / Е.5) ──
        ws["D61"] = inp.eta_prefill
        ws["D62"] = inp.eta_decode
        ws["D63"] = inp.eta_mem
        ws["D64"] = inp.saturation_coeff_C
        ws["D65"] = inp.th_prefill_empir if inp.th_prefill_empir else 0
        ws["D66"] = inp.th_decode_empir if inp.th_decode_empir else 0
        ws["D67"] = inp.eta_cache
        ws["D68"] = inp.k_spec
        ws["D69"] = inp.engine_mode.value if inp.engine_mode is not None else "continuous"
        if inp.c_pf is not None:
            ws["D70"] = inp.c_pf
        ws["D71"] = inp.t_overhead
        ws["D72"] = inp.o_fixed

        # ── SLA section (6.4 / 7) ──
        ws["D75"] = inp.rps_per_session_R
        ws["D76"] = inp.sla_reserve_KSLA
        ws["D77"] = inp.ttft_sla if inp.ttft_sla else 0
        ws["D78"] = inp.e2e_latency_sla if inp.e2e_latency_sla else 0

        # ── Agentic / RAG / tool-use (Appendix В) ──
        # The sheet has one SP_tools slot; the backend folds static RAG
        # context into SP_eff the same way (SP_eff = SP + SP_tools + C_rag_static).
        agentic = wb["Agentic"]
        agentic["D23"] = inp.k_calls or 1
        agentic["D24"] = (inp.sp_tools or 0) + (inp.c_rag_static or 0)
        agentic["D25"] = inp.c_rag_dynamic or 0
        agentic["D26"] = inp.a_tool or 0

        return wb

    # ── Dropdown-backed inputs ────────────────────────────────────────────

    def _select_gpu(self, wb: openpyxl.Workbook, inp: SizingInput) -> None:
        label = inp.gpu_name or lookup_gpu_name(inp.gpu_id) or f"Custom GPU {inp.gpu_mem_gb:g} GB"
        bandwidth = inp.bw_gpu_gbs or lookup_gpu_bandwidth_gbs(inp.gpu_id) or 0
        _select_reference_row(
            wb,
            GPU_CELL,
            label,
            {
                "B": inp.gpu_mem_gb,
                "C": self._resolve_gpu_tflops(inp),
                "D": bandwidth,
                "E": WEB_ROW_NOTE,
            },
        )

    @staticmethod
    def _select_model(wb: openpyxl.Workbook, inp: SizingInput) -> None:
        label = inp.model_name or f"Custom model {inp.params_billions:g}B"
        head_dim = inp.head_dim or (
            inp.hidden_size_H // inp.num_attention_heads if inp.num_attention_heads else 0
        )
        _select_reference_row(
            wb,
            MODEL_CELL,
            label,
            {
                "B": inp.params_billions,
                "C": inp.params_active or inp.params_billions,
                "D": inp.layers_L,
                "E": inp.hidden_size_H,
                "F": inp.num_attention_heads,
                "G": inp.num_kv_heads,
                "H": head_dim,
                "I": _architecture_label(inp),
                "J": inp.max_context_window_TSmax,
                "K": inp.kv_lora_rank or 0,
                "L": inp.qk_rope_head_dim or 0,
                "M": inp.params_dense or 0,
                "N": inp.params_moe or 0,
                "O": inp.k_experts or 0,
                "P": inp.n_experts or 0,
            },
        )

    @staticmethod
    def _select_quantization(wb: openpyxl.Workbook, inp: SizingInput) -> None:
        ws, reference = wb["Inputs"], wb["Reference"]
        first, last = _list_bounds(ws, QUANT_CELL)
        preferred = inp.quantization or QUANTIZATION_LABELS.get(float(inp.bytes_per_param))
        for row in range(first, last + 1):
            if reference[f"A{row}"].value == preferred and reference[f"B{row}"].value == float(
                inp.bytes_per_param
            ):
                ws[QUANT_CELL] = preferred
                return
        _select_reference_row(
            wb,
            QUANT_CELL,
            f"Custom ({inp.bytes_per_param:g} B/param)",
            {"B": inp.bytes_per_param, "C": WEB_ROW_NOTE},
        )

    def generate(self, inp: SizingInput) -> io.BytesIO:
        """
        Generate the populated Excel file and return it as a BytesIO buffer.

        Raises:
            FileNotFoundError: if the template is not found.
            RuntimeError: on generation error.
        """
        if not self.template_exists:
            raise FileNotFoundError(f"Шаблон отчёта не найден: {self.template_path}")

        try:
            wb = self._fill_template(inp)
        except Exception as exc:
            logger.error("Ошибка при заполнении шаблона: %s", exc)
            raise RuntimeError(f"Ошибка генерации отчёта: {exc}") from exc

        self._write_api_result(wb, inp)
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf

    @staticmethod
    def _write_api_result(wb: openpyxl.Workbook, inp: SizingInput) -> None:
        """Лист «Итог API»: результат после §7.3 (объект SLA, t_tools) и §8 (подбор под SLA).

        Формулы листов Sizing/Iterations считают §6.4 без подбора под SLA и проверяют
        SLA вызова. Итог для бюджета (AI-MET-04.02 п. 6.1.1) — значения этого листа.
        """
        from services.sizing_service import run_sizing

        try:
            r = run_sizing(inp)
        except Exception as exc:  # отчёт формируется и при ошибке расчёта
            logger.warning("Итог API не рассчитан: %s", exc)
            return
        ws = wb["Итог API"] if "Итог API" in wb.sheetnames else wb.create_sheet("Итог API")
        rows = [
            ("Итог API после подбора под SLA (§8) — используется для бюджета", None, None),
            ("Формулы листа Sizing считают §6.4 без подбора под SLA и проверяют SLA одного вызова; "
             "при расхождении действует этот лист.", None, None),
            (None, None, None),
            ("Величина", "Значение", "Пояснение"),
            ("Servers_final", r.servers_final, "Итоговое число серверов (§8)"),
            ("Servers^* до подбора", r.servers_before_sla_fit, "Решение итераций §6.4 = Sizing!D67"),
            ("Подбор под SLA", r.sla_fit_status, "not_required | fitted | unreachable | disabled"),
            ("BS_real", r.BS_real, "В итоговом состоянии"),
            ("e2eLatency_load, с", r.e2e_latency_load, "Один LLM-вызов"),
            ("t_tools, с", inp.t_tools_request, "Время вне LLM на запрос"),
            ("e2eLatency_request, с", r.e2e_latency_request, "K_calls · e2eLatency_load + t_tools"),
            ("Объект e2e-SLA", r.e2e_sla_scope, "call | request (§7.3)"),
            ("SLA выполнен", r.sla_passed, ""),
            ("q", r.session_load_q, "Самосогласованность нагрузки сессии, допустимо ≤ 1 (§6.4)"),
            ("Статус результата", r.sizing_status, "ok | input_inconsistent | sla_unreachable"),
        ]
        for i, row in enumerate(rows, start=1):
            for j, v in enumerate(row, start=1):
                if v is not None:
                    ws.cell(row=i, column=j, value=v)
        ws.column_dimensions["A"].width = 34
        ws.column_dimensions["B"].width = 16
        ws.column_dimensions["C"].width = 60

    @staticmethod
    def make_filename() -> str:
        """Build a filename stamped with the current date/time."""
        return f"sizing_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"


def _architecture_label(inp: SizingInput) -> str:
    """Informational architecture tag in the Reference sheet's convention (e.g. "MoE/GQA")."""
    is_moe = (inp.n_experts or 0) > 1 or (
        inp.params_active is not None and inp.params_active < inp.params_billions
    )
    if (inp.kv_lora_rank or 0) > 0:
        attention = "MLA"
    elif inp.num_kv_heads < inp.num_attention_heads:
        attention = "GQA"
    else:
        attention = "MHA"
    return f"{'MoE' if is_moe else 'dense'}/{attention}"


def _data_validation(ws: Worksheet, cell: str) -> DataValidation:
    validations: Any = ws.data_validations.dataValidation
    for dv in validations:
        if cell in dv.sqref:
            return dv
    raise ValueError(f"Inputs!{cell} has no dropdown validation in the template")


def _list_bounds(ws: Worksheet, cell: str) -> tuple[int, int]:
    """First and last Reference row of the dropdown list behind ``cell``."""
    formula = str(_data_validation(ws, cell).formula1 or "")
    match = _LIST_RANGE_RE.search(formula)
    if match is None:
        raise ValueError(f"Inputs!{cell} dropdown is not a Reference list: {formula!r}")
    return int(match.group(1)), int(match.group(2))


def _extend_list(ws: Worksheet, cell: str, first: int, last: int) -> int:
    """Grow the list behind ``cell`` by one row in its validation and lookups."""
    new_last = last + 1
    dv = _data_validation(ws, cell)
    dv.formula1 = str(dv.formula1 or "").replace(f"$A${last}", f"$A${new_last}")
    pattern = re.compile(rf"(Reference!\$[A-Z]+\${first}:\$[A-Z]+\$){last}\b")
    for row in ws.iter_rows():
        for formula_cell in row:
            value = formula_cell.value
            if isinstance(value, str) and value.startswith("="):
                formula_cell.value = pattern.sub(rf"\g<1>{new_last}", value)
    return new_last


def _select_reference_row(
    wb: openpyxl.Workbook, cell: str, label: str, values: dict[str, Any]
) -> None:
    """Write the web selection as a Reference row and pick it in ``cell``.

    The row lands in the first free slot of the list; when the list is full
    the validation range and the INDEX/MATCH lookups are extended by one row.
    A label that already exists in the list is reused when the catalog row
    carries the same numbers; otherwise the web row gets a suffix so MATCH
    resolves to the web row rather than the catalog row.
    """
    ws, reference = wb["Inputs"], wb["Reference"]
    first, last = _list_bounds(ws, cell)
    for existing_row in range(first, last + 1):
        if reference[f"A{existing_row}"].value != label:
            continue
        if _same_numbers(reference, existing_row, values):
            ws[cell] = label
            return
        label = f"{label}{WEB_LABEL_SUFFIX}"
        break

    free = [row for row in range(first, last + 1) if reference[f"A{row}"].value is None]
    row = free[0] if free else _extend_list(ws, cell, first, last)

    for column in REFERENCE_COLUMNS:
        target = reference[f"{column}{row}"]
        target._style = copy(reference[f"{column}{last}"]._style)
        target.value = values.get(column)
    reference[f"A{row}"] = label
    ws[cell] = label


def _same_numbers(reference: Worksheet, row: int, values: dict[str, Any]) -> bool:
    """True when every numeric web value equals the Reference row (rel. 1e-9)."""
    for column, value in values.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        current = reference[f"{column}{row}"].value
        if not isinstance(current, (int, float)):
            current = 0 if current is None else current
            if not isinstance(current, (int, float)):
                return False
        if abs(float(current) - float(value)) > 1e-9 * max(1.0, abs(float(value))):
            return False
    return True
