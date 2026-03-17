from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from services.gpu_catalog_pipeline import scraper as catalog_scraper


def test_scrape_gpu_catalog_raw_fallback_writes_file(monkeypatch, tmp_path: Path) -> None:
    output_path = tmp_path / "gpu_data_raw.json"

    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)

    assert output_path.exists()
    persisted = json.loads(output_path.read_text(encoding="utf-8"))
    assert persisted == result
    assert len(result) >= 1


def test_scrape_gpu_catalog_raw_merge_keeps_existing_records(monkeypatch, tmp_path: Path) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    output_path.write_text(
        json.dumps({"existing_gpu": {"Vendor": "NVIDIA", "Model": "Legacy"}}), encoding="utf-8"
    )

    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)

    sample_df = pd.DataFrame(
        {
            "Model name": ["GeForce RTX 4090"],
            "Launch": ["October 12, 2022"],
            "Memory": ["24 GB GDDR6X"],
            "Cores": ["16384 CUDA"],
        }
    )
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [sample_df])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    assert "existing_gpu" in result
    assert any("NVIDIA_" in key for key in result)

    persisted = json.loads(output_path.read_text(encoding="utf-8"))
    assert persisted == result


def test_scrape_gpu_catalog_raw_deduplicates_record_keys(monkeypatch, tmp_path: Path) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)

    sample_df = pd.DataFrame(
        {
            "Model name": ["GeForce RTX 4090", "GeForce RTX 4090"],
            "Launch": ["October 12, 2022", "October 12, 2022"],
            "Memory": ["24 GB GDDR6X", "24 GB GDDR6X"],
            "Cores": ["16384 CUDA", "16384 CUDA"],
        }
    )
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [sample_df])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    keys = sorted(result.keys())
    assert any(key.endswith("_2") for key in keys)


def test_scrape_gpu_catalog_raw_handles_vendor_exception(monkeypatch, tmp_path: Path) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)

    def _boom(vendor: str, url: str):  # noqa: ARG001
        raise RuntimeError("vendor failure")

    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", _boom)

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    assert output_path.exists()
    assert len(result) >= 1


def test_scrape_gpu_catalog_raw_fallback_handles_broken_existing_json(
    monkeypatch, tmp_path: Path
) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    output_path.write_text("{bad-json", encoding="utf-8")

    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    assert len(result) >= 1


def test_scrape_gpu_catalog_raw_fallback_preserves_existing_fallback_keys(
    monkeypatch,
    tmp_path: Path,
) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    output_path.write_text(
        json.dumps({"NVIDIA_RTX_4090": {"Vendor": "NVIDIA", "Model": "Custom"}}),
        encoding="utf-8",
    )

    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    assert result["NVIDIA_RTX_4090"]["Model"] == "Custom"


def test_scrape_gpu_catalog_raw_merge_handles_existing_json_decode_error(
    monkeypatch, tmp_path: Path
) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    output_path.write_text("{bad-json", encoding="utf-8")

    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)

    sample_df = pd.DataFrame(
        {
            "Model name": ["GeForce RTX 4090"],
            "Launch": ["October 12, 2022"],
            "Memory": ["24 GB GDDR6X"],
            "Cores": ["16384 CUDA"],
        }
    )
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [sample_df])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    assert any("NVIDIA_" in key for key in result)


def test_scrape_gpu_catalog_raw_handles_third_duplicate_suffix(monkeypatch, tmp_path: Path) -> None:
    output_path = tmp_path / "gpu_data_raw.json"
    monkeypatch.setattr(catalog_scraper, "data", {"NVIDIA": {"url": "https://example.test"}})
    monkeypatch.setattr(catalog_scraper.time, "sleep", lambda _: None)

    sample_df = pd.DataFrame(
        {
            "Model name": ["GeForce RTX 4090", "GeForce RTX 4090", "GeForce RTX 4090"],
            "Launch": ["October 12, 2022", "October 12, 2022", "October 12, 2022"],
            "Memory": ["24 GB GDDR6X", "24 GB GDDR6X", "24 GB GDDR6X"],
            "Cores": ["16384 CUDA", "16384 CUDA", "16384 CUDA"],
        }
    )
    monkeypatch.setattr(catalog_scraper, "fetch_vendor_tables", lambda vendor, url: [sample_df])

    result = catalog_scraper.scrape_gpu_catalog_raw(output_path)
    keys = sorted(result.keys())
    assert any(key.endswith("_3") for key in keys)


def test_fetch_vendor_tables_handles_clean_html_failure(monkeypatch) -> None:
    class _Resp:
        text = "<html></html>"

        def raise_for_status(self) -> None:
            return None

    def _fake_get(url: str, timeout: int, headers: dict[str, str]) -> _Resp:
        return _Resp()

    monkeypatch.setattr(catalog_scraper.requests, "get", _fake_get)
    monkeypatch.setattr(
        catalog_scraper, "clean_html", lambda html: (_ for _ in ()).throw(RuntimeError("bad html"))
    )

    assert catalog_scraper.fetch_vendor_tables("AMD", "https://example.test") == []
