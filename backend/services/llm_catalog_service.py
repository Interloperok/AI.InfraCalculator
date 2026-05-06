"""LLM catalog loader. Reads llm_data.json (a copy of /llm_catalog.json from
the project root) and exposes filter/paginate helpers for the /v1/llms
endpoint. Schema mirrors llm_catalog.schema.json.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from models import LLMInfo, LLMListResponse

BACKEND_DIR = Path(__file__).resolve().parent.parent
LLM_DATA_PATH = BACKEND_DIR / "llm_data.json"


def _read_llm_catalog(path: Path = LLM_DATA_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return []
    if data.get("schema_version") != 1:
        return []
    models = data.get("models", [])
    if not isinstance(models, list):
        return []
    return [m for m in models if isinstance(m, dict)]


def load_llm_catalog() -> list[dict[str, Any]]:
    return _read_llm_catalog()


def filter_models(
    models: list[dict[str, Any]],
    *,
    vendor: Optional[str] = None,
    family: Optional[str] = None,
    is_moe: Optional[bool] = None,
    is_mla: Optional[bool] = None,
    verified: Optional[bool] = None,
    search: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Apply optional filters to a catalog list."""
    out = models
    if vendor:
        v = vendor.lower()
        out = [m for m in out if str(m.get("vendor", "")).lower() == v]
    if family:
        f = family.lower()
        out = [m for m in out if str(m.get("family", "")).lower() == f]
    if is_moe is not None:
        out = [m for m in out if bool(m.get("is_moe")) == is_moe]
    if is_mla is not None:
        out = [m for m in out if bool(m.get("is_mla")) == is_mla]
    if verified is not None:
        out = [m for m in out if bool(m.get("verified")) == verified]
    if search:
        q = search.lower()
        out = [
            m
            for m in out
            if q in str(m.get("name", "")).lower()
            or q in str(m.get("hf_id", "")).lower()
            or q in str(m.get("family", "")).lower()
        ]
    return out


def build_list_response(
    *,
    page: int = 1,
    per_page: int = 100,
    vendor: Optional[str] = None,
    family: Optional[str] = None,
    is_moe: Optional[bool] = None,
    is_mla: Optional[bool] = None,
    verified: Optional[bool] = None,
    search: Optional[str] = None,
) -> LLMListResponse:
    """Build an LLMListResponse with optional filters + pagination."""
    all_models = load_llm_catalog()
    filtered = filter_models(
        all_models,
        vendor=vendor,
        family=family,
        is_moe=is_moe,
        is_mla=is_mla,
        verified=verified,
        search=search,
    )
    total = len(filtered)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = filtered[start:end]
    return LLMListResponse(
        models=[LLMInfo(**m) for m in page_items],
        total=total,
        page=page,
        per_page=per_page,
        has_next=end < total,
        has_prev=page > 1,
    )


def get_model_by_name(name: str) -> Optional[LLMInfo]:
    """Lookup a single entry by exact `name` match."""
    for m in load_llm_catalog():
        if m.get("name") == name:
            return LLMInfo(**m)
    return None
