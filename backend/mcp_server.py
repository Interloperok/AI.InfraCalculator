"""MCP server for the AI Infrastructure Calculator.

The same process that serves ``/v1/*`` also serves Streamable HTTP at ``/mcp/``.
``python -m mcp_server`` speaks stdio for a local checkout.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import TypeVar

from fastapi import HTTPException
from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations

from api.gpu_handlers import get_gpu_details_handler, get_gpus_handler
from api.sizing_handlers import (
    auto_optimize_endpoint_handler,
    ocr_size_endpoint_handler,
    publish_report_download,
    size_endpoint_handler,
    vlm_size_endpoint_handler,
    whatif_endpoint_handler,
)
from models import (
    AutoOptimizeInput,
    AutoOptimizeResponse,
    GPUInfo,
    GPUListResponse,
    LLMInfo,
    LLMListResponse,
    OCRSizingInput,
    OCRSizingOutput,
    SizingInput,
    SizingOutput,
    VLMSizingInput,
    VLMSizingOutput,
    WhatIfRequest,
    WhatIfResponseItem,
)
from services.llm_catalog_service import build_list_response, get_model_by_name
from services.report_downloads import ReportDownload

_T = TypeVar("_T")

_READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)

_REPORT = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=False,
)

_INSTRUCTIONS = """
Size GPU clusters for LLM, VLM, and OCR inference. Calculations are read-only.

Before size_llm, size_vlm, size_ocr, compare_scenarios, or auto_optimize:
1. Call get_llm (or list_llms) and copy architecture numbers. Do not invent them.
2. Call get_gpu (or list_gpus) and copy memory_gb. Do not invent GPU memory.

bytes_per_param: FP8 = 1, FP16/BF16 = 2, FP32 = 4.
gpus_per_server is an integer from 1 to 8.
Tensor-parallel degree (tp_multiplier_Z) is 1, 2, 4, 6, or 8.
servers_final is max(servers_by_memory, servers_by_compute).

Read the calculator://playbook resource for the field mapping.

When the user asks for an Excel report, call build_report with the same
workload you passed to size_llm and give them download_url.
""".strip()

_PLAYBOOK = """
# AI Infrastructure Calculator

Use the catalog tools, then a sizing tool. The math matches the web calculator.

## Lookup

- `list_llms` / `get_llm` — parameter counts, layers, hidden size, attention heads,
  KV heads, head_dim, context window, MoE and MLA fields.
- `list_gpus` / `get_gpu` — `memory_gb` becomes `gpu_mem_gb`. `id` becomes `gpu_id`.

## LLM (`size_llm`)

Map catalog fields onto the workload:

- `params_total_b` → `params_billions`
- `params_active_b` → `params_active` (omit for dense models)
- `layers` → `layers_L`
- `hidden_size` → `hidden_size_H`
- `num_attention_heads`, `num_kv_heads`, `head_dim`, `max_context` → the same names
  (`max_context` → `max_context_window_TSmax`)
- MoE: `params_dense_b`, `params_moe_b`, `n_experts`, `k_moe` → `k_experts`
- MLA: `kv_lora_rank`, `qk_rope_head_dim`

Required load inputs the catalog does not know: users, penetration, concurrency,
prompt and answer lengths, and the GPU.

## VLM and OCR

`size_vlm` is single-pass image-to-JSON. `size_ocr` is a two-pass OCR + LLM pipeline.
Both take their own input objects; do not reuse an LLM payload.

## What-if and auto-optimize

`compare_scenarios` reruns one LLM baseline with named overrides.
`auto_optimize` searches GPU, tensor parallel, GPUs per server, and quantization.
It is slower than a single size call.

## Excel report

`build_report` takes the same workload as `size_llm`. Give the user `download_url`.
The link lasts 30 minutes. The file is an .xlsx; Excel recalculates formulas on open.

This server does not scrape or refresh catalogs.
""".strip()


def _call(fn: Callable[[], _T]) -> _T:
    """Surface handler failures as tool errors instead of HTTP responses."""
    try:
        return fn()
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail)
        raise ValueError(detail) from exc


calculator_mcp = MCPServer(
    name="AI Infra Calculator",
    title="AI Infrastructure Calculator",
    description="Size GPU clusters for LLM, VLM, and OCR inference.",
    instructions=_INSTRUCTIONS,
    website_url="https://calc.aicolab.space/",
    version="1.6.0",
)


@calculator_mcp.tool(annotations=_READ_ONLY)
def list_llms(
    search: str | None = None,
    vendor: str | None = None,
    family: str | None = None,
    is_moe: bool | None = None,
    is_mla: bool | None = None,
    verified: bool | None = None,
    page: int = 1,
    per_page: int = 20,
) -> LLMListResponse:
    """Search the curated LLM catalog. Use this before inventing model dimensions."""
    return build_list_response(
        page=max(page, 1),
        per_page=max(1, min(per_page, 50)),
        vendor=vendor,
        family=family,
        is_moe=is_moe,
        is_mla=is_mla,
        verified=verified,
        search=search,
    )


@calculator_mcp.tool(annotations=_READ_ONLY)
def get_llm(name: str) -> LLMInfo:
    """Fetch one curated LLM by its exact catalog name (not the Hugging Face id)."""
    entry = get_model_by_name(name)
    if entry is None:
        raise ValueError(f"LLM not found: {name}. Call list_llms and use the exact name.")
    return entry


@calculator_mcp.tool(annotations=_READ_ONLY)
def list_gpus(
    search: str | None = None,
    vendor: str | None = None,
    min_memory_gb: float | None = None,
    max_memory_gb: float | None = None,
    memory_type: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> GPUListResponse:
    """Search the GPU catalog. Copy memory_gb into gpu_mem_gb when sizing."""
    return _call(
        lambda: get_gpus_handler(
            vendor=vendor,
            min_memory=min_memory_gb,
            max_memory=max_memory_gb,
            min_cores=None,
            min_year=None,
            max_year=None,
            memory_type=memory_type,
            page=max(page, 1),
            per_page=max(1, min(per_page, 50)),
            search=search,
        )
    )


@calculator_mcp.tool(annotations=_READ_ONLY)
def get_gpu(gpu_id: str) -> GPUInfo:
    """Fetch one GPU by catalog id, for example NVIDIA_H100."""
    return _call(lambda: get_gpu_details_handler(gpu_id))


@calculator_mcp.tool(annotations=_READ_ONLY)
def size_llm(workload: SizingInput) -> SizingOutput:
    """Size servers and GPUs for an LLM chat or completion workload.

    Call get_llm and get_gpu first and copy their numbers. Do not invent
    parameter counts, layer sizes, or GPU memory. bytes_per_param is 1 (FP8),
    2 (FP16/BF16), or 4 (FP32). gpus_per_server is 1-8. tp_multiplier_Z is
    1, 2, 4, 6, or 8. servers_final is max(servers_by_memory, servers_by_compute).
    """
    return _call(lambda: size_endpoint_handler(workload))


@calculator_mcp.tool(annotations=_REPORT)
def build_report(workload: SizingInput) -> ReportDownload:
    """Build an Excel workbook for the same LLM workload passed to size_llm.

    Pass that workload unchanged. Do not invent fields and do not reuse a VLM
    or OCR payload. Show the user download_url so they can save the .xlsx.
    The link expires after 30 minutes. Excel recalculates formulas on open.
    """
    return _call(lambda: publish_report_download(workload))


@calculator_mcp.tool(annotations=_READ_ONLY)
def size_vlm(workload: VLMSizingInput) -> VLMSizingOutput:
    """Size a single-pass VLM workload (image to JSON). Do not reuse an LLM payload."""
    return _call(lambda: vlm_size_endpoint_handler(workload))


@calculator_mcp.tool(annotations=_READ_ONLY)
def size_ocr(workload: OCRSizingInput) -> OCRSizingOutput:
    """Size a two-pass OCR + LLM pipeline. Do not reuse an LLM or VLM payload."""
    return _call(lambda: ocr_size_endpoint_handler(workload))


@calculator_mcp.tool(annotations=_READ_ONLY)
def compare_scenarios(comparison: WhatIfRequest) -> list[WhatIfResponseItem]:
    """Rerun one LLM baseline under named overrides. Each override key must exist on the baseline."""
    return _call(lambda: whatif_endpoint_handler(comparison))


@calculator_mcp.tool(annotations=_READ_ONLY)
def auto_optimize(goal: AutoOptimizeInput) -> AutoOptimizeResponse:
    """Search GPU, tensor parallel, GPUs per server, and quantization for a top-N LLM setup.

    Slower than size_llm. mode is min_servers, min_cost, max_performance, best_sla, or balanced.
    """
    return _call(lambda: auto_optimize_endpoint_handler(goal))


@calculator_mcp.resource(
    "calculator://playbook",
    name="playbook",
    title="Sizing playbook",
    description="How to map catalog fields onto a sizing call.",
    mime_type="text/markdown",
)
def playbook() -> str:
    """Field mapping and tool order for the calculator."""
    return _PLAYBOOK


@calculator_mcp.prompt(
    title="Size an LLM cluster",
    description="Look up a model and a GPU, then size an LLM deployment.",
)
def size_llm_workload(model_name: str, gpu_query: str, internal_users: int = 100) -> str:
    """Prompt a client to size one LLM workload from catalog data."""
    return (
        f"Size an LLM inference cluster for {internal_users} internal users.\n"
        f"1. Call get_llm with name {model_name!r}. If it is missing, list_llms with that search.\n"
        f"2. Call list_gpus with search {gpu_query!r}, then get_gpu for the chosen id.\n"
        "3. Call size_llm. Copy catalog numbers into the workload. "
        "bytes_per_param is 2 unless the user asked for FP8 (1) or FP32 (4).\n"
        "4. Report servers_final, total GPUs, and whether memory or compute binds."
    )


# DNS-rebinding protection defaults to localhost. This app is reached through
# nginx (and through Starlette's TestClient host "testserver"), so the Host
# header is not known here. The proxy is the network boundary.
mcp_asgi = calculator_mcp.streamable_http_app(
    streamable_http_path="/",
    json_response=True,
    stateless_http=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@asynccontextmanager
async def mcp_http_lifespan() -> AsyncIterator[None]:
    """Run the streamable-HTTP session manager for the mounted ASGI app.

    The SDK allows ``run()`` once per manager. Tests enter the FastAPI lifespan
    once per test, so the guard is cleared after a clean shutdown.
    """
    manager = calculator_mcp.session_manager
    try:
        async with manager.run():
            yield
    finally:
        manager._has_started = False  # noqa: SLF001


def main() -> None:
    """Serve the calculator over stdio for a local MCP client."""
    calculator_mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
