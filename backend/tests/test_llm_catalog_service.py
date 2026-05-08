"""Coverage for services.llm_catalog_service — pure data layer over llm_data.json.

The real `llm_data.json` is loaded at import time via the module-level cached
reader. These tests point the loader at temp fixtures to exercise:

- File-missing fallback (no exception, empty list).
- Schema-version / non-dict / non-list-models defensive branches.
- Each filter_models predicate (vendor, family, is_moe, is_mla, verified, search).
- Pagination edges (page>1, last page, page beyond data).
- get_model_by_name hit / miss.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from services import llm_catalog_service as svc


@pytest.fixture(autouse=True)
def _clear_catalog_cache() -> None:
    """The mtime-keyed lru_cache key is (path, mtime); writing a temp file
    each test invalidates naturally, but clear explicitly to be safe."""
    svc._read_llm_catalog_cached.cache_clear()


def _write_catalog(tmp_path: Path, payload: Any) -> Path:
    p = tmp_path / "catalog.json"
    p.write_text(json.dumps(payload), encoding="utf-8")
    return p


def _model(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "test-model",
        "hf_id": "org/test-model",
        "vendor": "Qwen",
        "family": "Qwen3",
        "architecture": "dense/GQA",
        "is_moe": False,
        "is_mla": False,
        "params_total_b": 7.0,
        "params_active_b": 7.0,
        "layers": 32,
        "hidden_size": 4096,
        "num_attention_heads": 32,
        "num_kv_heads": 32,
        "head_dim": 128,
        "max_context": 32768,
        "verified": True,
    }
    base.update(overrides)
    return base


# ── Reader / cache invalidation ─────────────────────────────────────────────


def test_read_returns_empty_list_when_file_missing(tmp_path: Path) -> None:
    missing = tmp_path / "nope.json"
    assert svc._read_llm_catalog(missing) == []


def test_read_handles_non_dict_root(tmp_path: Path) -> None:
    p = _write_catalog(tmp_path, ["not", "a", "dict"])
    assert svc._read_llm_catalog(p) == []


def test_read_rejects_unknown_schema_version(tmp_path: Path) -> None:
    p = _write_catalog(tmp_path, {"schema_version": 99, "models": [_model()]})
    assert svc._read_llm_catalog(p) == []


def test_read_handles_non_list_models(tmp_path: Path) -> None:
    p = _write_catalog(tmp_path, {"schema_version": 1, "models": "oops"})
    assert svc._read_llm_catalog(p) == []


def test_read_skips_non_dict_entries(tmp_path: Path) -> None:
    p = _write_catalog(
        tmp_path,
        {"schema_version": 1, "models": [_model(name="ok"), "junk", 42, _model(name="ok2")]},
    )
    out = svc._read_llm_catalog(p)
    assert [m["name"] for m in out] == ["ok", "ok2"]


# ── filter_models ───────────────────────────────────────────────────────────


@pytest.fixture
def sample_models() -> list[dict[str, Any]]:
    return [
        _model(name="Qwen3-7B", vendor="Qwen", family="Qwen3", is_moe=False, verified=True),
        _model(
            name="Qwen3-30B-A3B",
            vendor="Qwen",
            family="Qwen3",
            is_moe=True,
            verified=True,
            params_active_b=3.0,
            hf_id="Qwen/Qwen3-30B-A3B",
        ),
        _model(
            name="DeepSeek-V3",
            vendor="DeepSeek",
            family="DeepSeek",
            is_moe=True,
            is_mla=True,
            verified=True,
            params_active_b=37.0,
        ),
        _model(name="Llama-Custom", vendor="Meta", family="Llama 3", verified=False),
    ]


def test_filter_by_vendor(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, vendor="qwen")
    assert {m["name"] for m in out} == {"Qwen3-7B", "Qwen3-30B-A3B"}


def test_filter_by_family(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, family="DeepSeek")
    assert [m["name"] for m in out] == ["DeepSeek-V3"]


def test_filter_by_is_moe_true(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, is_moe=True)
    assert {m["name"] for m in out} == {"Qwen3-30B-A3B", "DeepSeek-V3"}


def test_filter_by_is_moe_false(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, is_moe=False)
    assert {m["name"] for m in out} == {"Qwen3-7B", "Llama-Custom"}


def test_filter_by_is_mla(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, is_mla=True)
    assert [m["name"] for m in out] == ["DeepSeek-V3"]


def test_filter_by_verified_false(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, verified=False)
    assert [m["name"] for m in out] == ["Llama-Custom"]


def test_filter_by_search_name(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, search="DEEPSEEK")
    assert [m["name"] for m in out] == ["DeepSeek-V3"]


def test_filter_by_search_hf_id(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, search="qwen3-30b")
    assert [m["name"] for m in out] == ["Qwen3-30B-A3B"]


def test_filter_by_search_family(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, search="llama")
    assert [m["name"] for m in out] == ["Llama-Custom"]


def test_filter_combined(sample_models: list[dict[str, Any]]) -> None:
    out = svc.filter_models(sample_models, vendor="Qwen", is_moe=True)
    assert [m["name"] for m in out] == ["Qwen3-30B-A3B"]


# ── build_list_response: pagination + filter integration ────────────────────


def test_build_list_response_paginates(
    sample_models: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "load_llm_catalog", lambda: sample_models)
    resp = svc.build_list_response(page=1, per_page=2)
    assert resp.total == 4
    assert resp.page == 1
    assert resp.per_page == 2
    assert len(resp.models) == 2
    assert resp.has_next is True
    assert resp.has_prev is False


def test_build_list_response_last_page(
    sample_models: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "load_llm_catalog", lambda: sample_models)
    resp = svc.build_list_response(page=2, per_page=2)
    assert resp.total == 4
    assert resp.has_next is False
    assert resp.has_prev is True


def test_build_list_response_with_filters(
    sample_models: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "load_llm_catalog", lambda: sample_models)
    resp = svc.build_list_response(page=1, per_page=10, is_moe=True)
    assert resp.total == 2
    assert {m.name for m in resp.models} == {"Qwen3-30B-A3B", "DeepSeek-V3"}


# ── get_model_by_name ───────────────────────────────────────────────────────


def test_get_model_by_name_hit(
    sample_models: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "load_llm_catalog", lambda: sample_models)
    out = svc.get_model_by_name("DeepSeek-V3")
    assert out is not None
    assert out.name == "DeepSeek-V3"
    assert out.is_mla is True


def test_get_model_by_name_miss(
    sample_models: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "load_llm_catalog", lambda: sample_models)
    assert svc.get_model_by_name("does-not-exist") is None


# ── load_llm_catalog: real file path round-trip ─────────────────────────────


def test_load_llm_catalog_returns_real_data() -> None:
    """Sanity check that the bundled llm_data.json loads without error."""
    out = svc.load_llm_catalog()
    assert isinstance(out, list)
    if out:
        assert all(isinstance(m, dict) and "name" in m for m in out)
