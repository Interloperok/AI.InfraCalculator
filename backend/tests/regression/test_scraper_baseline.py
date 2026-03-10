from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from services.gpu_catalog_pipeline import scraper as catalog_scraper


class _ResponseStub:
    def __init__(self, text: str) -> None:
        self.text = text

    def raise_for_status(self) -> None:
        return None


def test_scraper_parses_fixture_table(monkeypatch) -> None:
    fixture_path = Path(__file__).parent / "fixtures" / "scraper_html" / "nvidia_sample.html"
    html = fixture_path.read_text(encoding="utf-8")

    def _fake_get(url: str, timeout: int, headers: dict[str, str]) -> _ResponseStub:
        assert url == "https://example.test/nvidia"
        assert timeout == 45
        assert "User-Agent" in headers
        return _ResponseStub(html)

    monkeypatch.setattr(catalog_scraper.requests, "get", _fake_get)

    tables = catalog_scraper.fetch_vendor_tables("NVIDIA", "https://example.test/nvidia")
    assert tables, "fixture table should be parsed by pandas.read_html"

    processed = catalog_scraper.process_dataframe(tables[0], vendor="NVIDIA")
    assert len(processed) == 2
    assert set(["Vendor", "Launch", "Memory_GB", "Memory_Type", "Cores"]).issubset(processed.columns)

    first = processed.iloc[0]
    assert first["Vendor"] == "NVIDIA"
    assert float(first["Memory_GB"]) == 24.0
    assert int(first["Cores"]) == 16384
    assert str(first["Memory_Type"]) == "GDDR6X"


def test_record_key_is_deterministic() -> None:
    row: dict[str, Any] = {"Vendor": "NVIDIA", "Model": "GeForce RTX 4090"}
    assert catalog_scraper.record_key(row) == "NVIDIA_GeForce_RTX_4090"


def test_record_key_uses_code_name_when_present() -> None:
    row: dict[str, Any] = {"Vendor": "AMD", "Code name": "NAVI31"}
    assert catalog_scraper.record_key(row) == "AMD_NAVI31"


def test_extract_helpers_cover_branches() -> None:
    assert catalog_scraper.extract_memory_gb("8192 MB") == 8.0
    assert catalog_scraper.extract_memory_gb("no data") is None
    assert catalog_scraper.extract_cores("96 stream processors") == 96
    assert catalog_scraper.extract_cores("unknown") is None
    assert catalog_scraper.extract_memory_type("HBM2E 4096-bit") == "HBM2E"
    assert catalog_scraper.extract_memory_type("plain text") is None


def test_process_dataframe_without_launch_column() -> None:
    raw = pd.DataFrame({"Model name": ["GPU X"], "Memory": ["16 GB GDDR6"], "Cores": ["4096 CUDA"]})
    processed = catalog_scraper.process_dataframe(raw, vendor="NVIDIA")
    assert "Launch" in processed.columns
    assert processed["Launch"].isna().all()


def test_remove_bracketed_references() -> None:
    df = pd.DataFrame({"Model name": ["RTX 4090[1]"], "Other": ["ok"]})
    cleaned = catalog_scraper.remove_bracketed_references(df, ["Model name"])
    assert cleaned.iloc[0]["Model name"] == "RTX 4090"


def test_fetch_vendor_tables_handles_network_error(monkeypatch) -> None:
    def _raise(*args, **kwargs):  # noqa: ANN002, ANN003
        raise catalog_scraper.requests.RequestException("network down")

    monkeypatch.setattr(catalog_scraper.requests, "get", _raise)
    assert catalog_scraper.fetch_vendor_tables("NVIDIA", "https://example.test") == []


def test_fetch_vendor_tables_handles_parse_error(monkeypatch) -> None:
    class _Resp:
        text = "<html></html>"

        def raise_for_status(self) -> None:
            return None

    def _fake_get(url: str, timeout: int, headers: dict[str, str]) -> _Resp:
        return _Resp()

    def _broken_read_html(*args, **kwargs):  # noqa: ANN002, ANN003
        raise ValueError("broken html")

    monkeypatch.setattr(catalog_scraper.requests, "get", _fake_get)
    monkeypatch.setattr(catalog_scraper.pd, "read_html", _broken_read_html)
    assert catalog_scraper.fetch_vendor_tables("NVIDIA", "https://example.test") == []


def test_normalize_columns_multiindex_and_standardise_mapping() -> None:
    df = pd.DataFrame([[1, 2]], columns=pd.MultiIndex.from_tuples([("Model", "Model"), ("Code", "name")]))
    cols = catalog_scraper.normalize_columns(df.columns)
    assert cols == ["Model", "Code name"]

    mapped = catalog_scraper.standardise_column_names(pd.DataFrame(columns=["GPU die", "Model", "Radeon RX 7900"]))
    assert "Code name" in mapped.columns
    assert "Model name" in mapped.columns


def test_fetch_vendor_tables_exhausts_patterns_without_match(monkeypatch) -> None:
    class _Resp:
        text = "<html></html>"

        def raise_for_status(self) -> None:
            return None

    def _fake_get(url: str, timeout: int, headers: dict[str, str]) -> _Resp:
        return _Resp()

    calls: dict[str, int] = {"count": 0}

    def _empty_read_html(*args, **kwargs):  # noqa: ANN002, ANN003
        calls["count"] += 1
        return []

    monkeypatch.setattr(catalog_scraper.requests, "get", _fake_get)
    monkeypatch.setattr(catalog_scraper.pd, "read_html", _empty_read_html)
    assert catalog_scraper.fetch_vendor_tables("AMD", "https://example.test") == []
    assert calls["count"] == 5


def test_fetch_vendor_tables_uses_nvidia_transposed_fallback(monkeypatch) -> None:
    class _Resp:
        text = "<html></html>"

        def raise_for_status(self) -> None:
            return None

    def _fake_get(url: str, timeout: int, headers: dict[str, str]) -> _Resp:
        return _Resp()

    transposed_source = pd.DataFrame(
        [
            ["Release date", "Code name", "Model"],
            ["October 12, 2022", "Ada", "GeForce RTX 4090"],
            ["November 1, 2023", "Ada+", "GeForce RTX 4090 Ti"],
        ]
    )

    def _fake_read_html(*args, **kwargs):  # noqa: ANN002, ANN003
        pattern = kwargs["match"].pattern
        if pattern == "Release date":
            return [transposed_source]
        return []

    monkeypatch.setattr(catalog_scraper.requests, "get", _fake_get)
    monkeypatch.setattr(catalog_scraper.pd, "read_html", _fake_read_html)

    tables = catalog_scraper.fetch_vendor_tables("NVIDIA", "https://example.test")
    assert len(tables) == 1
    assert not tables[0].empty
