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
from services.report_service import ReportGenerator
from services.sizing_service import run_sizing
from services.vlm_sizing_service import run_vlm_sizing

report_builder = ReportGenerator(gpu_tflops_lookup=lookup_gpu_tflops)


def size_endpoint_handler(
    inp: SizingInput,
    run_sizing_fn: Callable[[SizingInput], SizingOutput] = run_sizing,
) -> SizingOutput:
    """Выполнить sizing-расчёт с единообразной обработкой ошибок."""
    try:
        return run_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc


def report_endpoint_handler(inp: SizingInput) -> StreamingResponse:
    """Сгенерировать Excel-отчёт по sizing-входу."""
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


def whatif_endpoint_handler(
    req: WhatIfRequest,
    run_sizing_fn: Callable[[SizingInput], SizingOutput] = run_sizing,
) -> list[WhatIfResponseItem]:
    """Выполнить пакетный расчёт по сценариям `what-if`."""
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
    """Вернуть top-N оптимальных конфигураций по выбранному режиму."""
    try:
        return auto_optimize(inp)
    except AppError as exc:
        raise to_http_exception(exc) from exc


def vlm_size_endpoint_handler(
    inp: VLMSizingInput,
    run_vlm_sizing_fn: Callable[[VLMSizingInput], VLMSizingOutput] = run_vlm_sizing,
) -> VLMSizingOutput:
    """Выполнить VLM single-pass online sizing (Приложение И.4.1)."""
    try:
        return run_vlm_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc


def ocr_size_endpoint_handler(
    inp: OCRSizingInput,
    run_ocr_sizing_fn: Callable[[OCRSizingInput], OCRSizingOutput] = run_ocr_sizing,
) -> OCRSizingOutput:
    """Выполнить OCR + LLM two-pass online sizing (Приложение И.4.2)."""
    try:
        return run_ocr_sizing_fn(inp)
    except (AppError, ValueError) as exc:
        error = exc if isinstance(exc, AppError) else ValidationAppError(str(exc))
        raise to_http_exception(error) from exc
