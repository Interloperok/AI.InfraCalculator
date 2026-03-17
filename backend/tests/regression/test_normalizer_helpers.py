from __future__ import annotations

from services.gpu_catalog_pipeline.normalizer import (
    _first_number,
    _get,
    _is_empty,
    _last_number,
    _make_id,
    _parse_bus_width,
    _parse_clock_mhz,
    _parse_date,
    _parse_fab,
    _parse_memory_gb,
    _parse_memory_type,
    _parse_nm,
    _parse_price,
    _parse_tdp,
    _parse_tflops,
    _parse_transistors_die,
    _parse_version,
    normalize_entry,
    normalize,
)


def test_is_empty_variants() -> None:
    assert _is_empty(None)
    assert _is_empty("nan")
    assert _is_empty("Unknown")
    assert not _is_empty("RTX 4090")


def test_number_parsers() -> None:
    assert _first_number("1,097.7") == 1097.7
    assert _first_number("-42", allow_negative=True) == -42.0
    assert _last_number("$35-45") == 45.0


def test_parse_price_variants() -> None:
    assert _parse_price("$2999") == 2999.0
    assert _parse_price("$35-45") == 45.0
    assert _parse_price("¥12999") is None
    assert _parse_price("OEM") is None


def test_parse_process_and_fab() -> None:
    assert _parse_nm("28") == 28
    assert _parse_nm("TSMC N7") == 7
    assert _parse_nm("Samsung 14LPP") == 14
    assert _parse_nm("unknown") is None
    assert _parse_fab("TSMC 4N") == "TSMC"
    assert _parse_fab("custom process") is None


def test_parse_date_variants() -> None:
    assert _parse_date("2024-01-15 00:00:00") == "2024-01-15"
    assert _parse_date("March 27, 2014") == "2014-03-27"
    assert _parse_date("Mar 27, 2014") == "2014-03-27"
    assert _parse_date("2019") == "2019"
    assert _parse_date("n/a") is None


def test_parse_memory_and_types() -> None:
    assert _parse_memory_gb("24 GB") == 24.0
    assert _parse_memory_gb("2048 MB") == 2.0
    assert _parse_memory_gb("24576") == 24.0
    assert _parse_memory_gb("2× 6") == 6.0
    assert _parse_memory_gb("0.5 1") == 1.0
    assert _parse_memory_type("GDDR6X 384-bit") == "GDDR6X"
    assert _parse_memory_type("unknown") is None


def test_parse_perf_and_bus() -> None:
    assert _parse_tflops("82.6", "tflops") == 82.6
    assert _parse_tflops("82600", "gflops") == 82.6
    assert _parse_tflops("2x 65.5", "tflops") == 65.5
    assert _parse_tflops("No", "tflops") is None
    assert _parse_tdp("<150") == 150.0
    assert _parse_bus_width("GDDR5 128-bit") == 128
    assert _parse_bus_width("2× 384") == 384
    assert _parse_bus_width("4") is None


def test_parse_versions_and_clock() -> None:
    assert _parse_version("11.2b/12.0") == "12.0"
    assert _parse_version("1.1.101") == "1.1"
    assert _parse_version("none") is None
    assert _parse_clock_mhz("1752.5 (7010)") == 1752.5
    assert _parse_clock_mhz("0 0") is None
    assert _parse_clock_mhz("nan") is None


def test_parse_transistors_die() -> None:
    t, d = _parse_transistors_die("690×10⁶ 56mm²")
    assert t == 0.69
    assert d == 56.0


def test_get_and_make_id() -> None:
    raw = {"a": "", "b": "value"}
    assert _get(raw, "a", "b") == "value"
    assert (
        _make_id("NVIDIA", "A100 GPU accelerator (PCIe card)")
        == "nvidia-a100-gpu-accelerator-pcie-card"
    )


def test_normalize_entry_smoke() -> None:
    raw = {
        "Vendor": "AMD",
        "Model": "Radeon RX 7900 XTX",
        "Launch": "December 13, 2022",
        "Memory Size (GB)": "24 GB",
        "Memory Bus type": "GDDR6",
        "TDP (W)": "355",
        "Processing power (TFLOPS) Single precision": "61.4",
        "Release Date & Price": "$999",
    }
    entry = normalize_entry("gpu_test", raw)
    assert entry["model_name"] == "Radeon RX 7900 XTX"
    assert entry["vendor"] == "AMD"
    assert entry["launch_date"] == "2022-12-13"
    assert entry["memory_gb"] == 24.0
    assert entry["memory_type"] == "GDDR6"
    assert entry["tflops_fp32"] == 61.4
    assert entry["price_usd"] == 999.0


def test_normalize_skips_broken_entries(tmp_path) -> None:
    raw_path = tmp_path / "raw.json"
    out_path = tmp_path / "out.json"
    raw_path.write_text(
        '{"ok":{"Vendor":"NVIDIA","Model":"RTX","Launch":"2022","Memory Size (GB)":"24 GB"},"bad":"oops"}',
        encoding="utf-8",
    )
    normalized = normalize(str(raw_path), str(out_path))
    assert len(normalized) == 1
    assert normalized[0]["vendor"] == "NVIDIA"


def test_normalize_entry_fallback_paths() -> None:
    raw = {
        "Vendor": "AMD",
        "Model (Code name)": "Radeon Special",
        "Launch": "2019",
        "Process": "Samsung 14LPP",
        "Transistors (million)": "1040",
        "Transistors & die size": "1.8×10⁹ 90 mm²",
        "Memory Size (MiB)": "8192",
        "Memory Bus type & width": "GDDR5 128-bit",
        "Memory configuration Bandwidth (GB/s)": "512",
        "Clock speeds Memory (GT/s)": "7.0",
        "Processing power (GFLOPS) Half precision": "20000",
        "Processing power (GFLOPS) Single precision": "10000",
        "Processing power (GFLOPS) Double precision": "5000",
        "Release Date & Price": "$399",
    }

    entry = normalize_entry("gpu_fallback", raw)
    assert entry["model_name"] == "Radeon Special"
    assert entry["process_nm"] == 14
    assert entry["fab"] == "Samsung"
    assert entry["transistors_billion"] == 1.04
    assert entry["die_size_mm2"] == 90.0
    assert entry["memory_gb"] == 8.0
    assert entry["memory_bus_width_bit"] == 128
    assert entry["memory_bandwidth_gbs"] == 512.0
    assert entry["clock_memory_mhz"] == 7000.0
    assert entry["tflops_fp16"] == 20.0
    assert entry["tflops_fp32"] == 10.0
    assert entry["tflops_fp64"] == 5.0
    assert entry["price_usd"] == 399.0


def test_normalize_entry_uses_tensor_fallback_in_gflops() -> None:
    raw = {
        "Vendor": "NVIDIA",
        "Model": "Tensor Only",
        "Launch": "2019",
        "Memory Size (GB)": "8",
        "Processing power (GFLOPS) Tensor compute (FP16)": "64000",
    }

    entry = normalize_entry("gpu_tensor", raw)
    assert entry["tflops_fp16"] == 64.0
