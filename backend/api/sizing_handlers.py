from __future__ import annotations

from collections.abc import Callable

from fastapi.responses import StreamingResponse

from errors import AppError, ServiceAppError, ValidationAppError, to_http_exception
from models import (
    AutoOptimizeInput,
    AutoOptimizeResponse,
    OCRSizingInput,
    OCRSizingOutput,
    SizingInput,
    SizingOutput,
    VLMSizingInput,
    VLMSizingOutput,
    WhatIfRequest,
    WhatIfResponseItem,
)
from services.auto_optimize_service import auto_optimize
from services.gpu_catalog_service import lookup_gpu_tflops
from services.ocr_sizing_service import run_ocr_sizing
from services.report_downloads import ReportDownload, report_downloads
from services.report_service import ReportGenerator
from settings import get_settings
from services.sizing_service import run_sizing
from services.vlm_sizing_service import run_vlm_sizing

report_builder = ReportGenerator(gpu_tflops_lookup=lookup_gpu_tflops)


def size_endpoint_handler(
    inp: SizingInput,
    run_sizing_fn: Callable[[SizingInput], SizingOutput] = run_sizing,
) -> SizingOutput:
    """Run a sizing calculation with uniform error handling."""
    try:
        return run_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc


def _report_precheck(inp: SizingInput) -> None:
    """Reject report requests the workbook cannot reproduce.

    The Excel template models co-located TP deployments only. Pipeline /
    expert parallelism, a TP communication factor and PD-disaggregation are
    API-only features; a report for them would silently show different
    numbers. The workload is also run through ``run_sizing`` first so that an
    infeasible configuration fails with the same error as ``size_llm``
    instead of producing a workbook full of #DIV/0!.
    """
    unsupported = []
    if (inp.pp_degree or 1) > 1:
        unsupported.append("pp_degree > 1")
    if (inp.ep_degree or 1) > 1:
        unsupported.append("ep_degree > 1")
    if inp.eta_tp is not None and inp.eta_tp < 1.0:
        unsupported.append("eta_tp < 1")
    if inp.use_pd_disagg:
        unsupported.append("use_pd_disagg")
    if unsupported:
        raise to_http_exception(
            ValidationAppError(
                "Excel-отчёт не поддерживает: "
                + ", ".join(unsupported)
                + ". Используйте результат size_llm или уберите эти параметры."
            )
        )
    size_endpoint_handler(inp)


def report_endpoint_handler(inp: SizingInput) -> StreamingResponse:
    """Generate an Excel report from a sizing input."""
    _report_precheck(inp)
    try:
        buf = report_builder.generate(inp)
    except FileNotFoundError as exc:
        raise to_http_exception(ServiceAppError(str(exc))) from exc
    except RuntimeError as exc:
        raise to_http_exception(ServiceAppError(str(exc))) from exc

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{report_builder.make_filename()}"',
        },
    )


def publish_report_download(inp: SizingInput) -> ReportDownload:
    """Fill the Excel template and publish a short-lived download link."""
    _report_precheck(inp)
    try:
        buf = report_builder.generate(inp)
    except FileNotFoundError as exc:
        raise to_http_exception(ServiceAppError(str(exc))) from exc
    except RuntimeError as exc:
        raise to_http_exception(ServiceAppError(str(exc))) from exc

    filename = report_builder.make_filename()
    report_id, expires_at = report_downloads.put(buf.getvalue(), filename)
    base = get_settings().public_base_url
    return ReportDownload(
        filename=filename,
        download_url=f"{base}/v1/reports/{report_id}",
        expires_at=expires_at,
    )


def whatif_endpoint_handler(
    req: WhatIfRequest,
    run_sizing_fn: Callable[[SizingInput], SizingOutput] = run_sizing,
) -> list[WhatIfResponseItem]:
    """Run a batch sizing pass over `what-if` scenarios."""
    items: list[WhatIfResponseItem] = []
    try:
        for scenario in req.scenarios:
            data = req.base.model_dump()
            for key, value in scenario.overrides.items():
                if key not in data:
                    raise ValidationAppError(f"Unknown field in overrides: {key}")
                data[key] = value

            output = run_sizing_fn(SizingInput(**data))
            items.append(WhatIfResponseItem(name=scenario.name, output=output))
    except AppError as exc:
        raise to_http_exception(exc) from exc

    return items


def auto_optimize_endpoint_handler(inp: AutoOptimizeInput) -> AutoOptimizeResponse:
    """Return top-N optimal configurations for the selected mode."""
    try:
        return auto_optimize(inp)
    except AppError as exc:
        raise to_http_exception(exc) from exc


def vlm_size_endpoint_handler(
    inp: VLMSizingInput,
    run_vlm_sizing_fn: Callable[[VLMSizingInput], VLMSizingOutput] = run_vlm_sizing,
) -> VLMSizingOutput:
    """Run VLM single-pass online sizing (Приложение И.4.1)."""
    try:
        return run_vlm_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc


def ocr_size_endpoint_handler(
    inp: OCRSizingInput,
    run_ocr_sizing_fn: Callable[[OCRSizingInput], OCRSizingOutput] = run_ocr_sizing,
) -> OCRSizingOutput:
    """Run OCR + LLM two-pass online sizing (Приложение И.4.2)."""
    try:
        return run_ocr_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc
