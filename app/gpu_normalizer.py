"""
GPU Catalog Normalizer
======================
Reads raw gpu_data_raw.json (output of gpu_scraper.py) and produces
gpu_data.json with a unified, typed schema.

Every GPU entry in the output has exactly the same set of fields.
Missing values are ``null`` (not "nan", "Unknown", "?", "N/a").
Numbers are always numbers (int/float), never strings.

Usage:
    python gpu_normalizer.py                        # default paths
    python gpu_normalizer.py raw.json out.json      # custom paths

Can also be imported:
    from gpu_normalizer import normalize
    normalize("gpu_data_raw.json", "gpu_data.json")
"""

import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# ─────────────────────────────────────────────
#  Normalized schema — every output entry has
#  exactly these keys (value may be null).
# ─────────────────────────────────────────────
SCHEMA_FIELDS: List[str] = [
    "model_name",
    "vendor",
    "code_name",
    "launch_date",
    "process_nm",
    "fab",
    "transistors_billion",
    "die_size_mm2",
    "bus_interface",
    "core_config",
    "memory_gb",
    "memory_type",
    "memory_bus_width_bit",
    "memory_bandwidth_gbs",
    "clock_base_mhz",
    "clock_boost_mhz",
    "clock_memory_mhz",
    "tdp_watts",
    "tflops_fp16",
    "tflops_fp32",
    "tflops_fp64",
    "price_usd",
    "direct3d_version",
    "opengl_version",
    "opencl_version",
    "vulkan_version",
    "cuda_version",
]

# Strings that mean "no value"
_EMPTY = {"nan", "n/a", "unknown", "?", "-", "—", "", "oem", "none", "no"}

# ─────────────────────────────────────────────
#  Low-level parsing helpers
# ─────────────────────────────────────────────

def _is_empty(val: Any) -> bool:
    """Return True if val is meaningless / missing."""
    if val is None:
        return True
    s = str(val).strip().lower()
    return s in _EMPTY


def _first_number(text: Any, allow_negative: bool = False) -> Optional[float]:
    """Extract the first numeric value from *text*.

    Handles: "14.4", "1,097.7", "2× 336.5", "$2999", "<150",
    "5046 x2", "1 / 2", "0.5 1", ranges like "5.591-8.736" (takes first).
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").replace("\u00a0", "").strip()
    # Remove leading currency/comparison symbols
    s = re.sub(r'^[<>≥≤~$¥€£]+\s*', '', s)
    # Remove "2×" / "2x" prefixes
    s = re.sub(r'^\d+\s*[×x]\s*', '', s, flags=re.I)
    pattern = r'-?\d+(?:\.\d+)?' if allow_negative else r'\d+(?:\.\d+)?'
    m = re.search(pattern, s)
    if m:
        return float(m.group())
    return None


def _last_number(text: Any) -> Optional[float]:
    """Extract the *last* numeric value — useful for ranges like '$35-45'."""
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").replace("\u00a0", "").strip()
    matches = re.findall(r'\d+(?:\.\d+)?', s)
    return float(matches[-1]) if matches else None


def _parse_price(text: Any) -> Optional[float]:
    """Parse a price string.

    "$2999" → 2999, "$35-45" → 45 (upper bound), "OEM"/"N/a" → None.
    Handles "¥12,999" by returning None (non-USD).
    """
    if _is_empty(text):
        return None
    s = str(text).strip()
    # Non-USD currencies → None
    if re.search(r'[¥€£]', s):
        return None
    # Must contain a dollar sign or a digit to be parseable
    if '$' not in s and not re.search(r'\d', s):
        return None
    # Range: take upper bound
    range_m = re.search(r'\$?\s*[\d,]+(?:\.\d+)?\s*[-–]\s*\$?\s*([\d,]+(?:\.\d+)?)', s)
    if range_m:
        return float(range_m.group(1).replace(",", ""))
    # Single value
    m = re.search(r'\$?\s*([\d,]+(?:\.\d+)?)', s)
    if m:
        return float(m.group(1).replace(",", ""))
    return None


def _parse_nm(text: Any) -> Optional[int]:
    """Extract process node in nm from strings like 'TSMC 40 nm', 'TSMC 4N',
    'Samsung 14LPP', '28', 'GCN 1 28 nm', 'RDNA 2 TSMC N7',
    'GCN 1 gen (28 nm)'.
    """
    if _is_empty(text):
        return None
    s = str(text).strip()
    # Direct integer (standalone)
    try:
        v = int(s)
        if 1 <= v <= 1000:
            return v
    except (ValueError, TypeError):
        pass
    # TSMC node names: "N7", "N5", "N4", "N3" etc.
    m = re.search(r'\bN(\d+)\b', s)
    if m:
        return int(m.group(1))
    # Explicit "nm": "40 nm", "28nm", "(28 nm)", "TSMC 40 nm"
    m = re.search(r'(\d+)\s*nm\b', s, re.I)
    if m:
        return int(m.group(1))
    # Process suffixes: "14LPP", "7FF", "5LPE", "28HP"
    m = re.search(r'\b(\d+)\s*(?:LP[PECU]?|FF|HP|HPC|SOI)\b', s, re.I)
    if m:
        return int(m.group(1))
    return None


def _parse_fab(text: Any) -> Optional[str]:
    """Extract fabrication company from strings like 'TSMC 40 nm', 'Samsung 14LPP'."""
    if _is_empty(text):
        return None
    s = str(text).strip()
    for fab_name in ("TSMC", "Samsung", "Intel", "GlobalFoundries", "SMIC", "UMC"):
        if fab_name.lower() in s.lower():
            return fab_name
    return None


def _parse_date(text: Any) -> Optional[str]:
    """Parse a date string to 'YYYY-MM-DD' or 'YYYY' format."""
    if _is_empty(text):
        return None
    s = str(text).strip()
    # Already in datetime format: "2014-03-27 00:00:00"
    m = re.match(r'(\d{4}-\d{2}-\d{2})', s)
    if m:
        return m.group(1)
    # "March 27, 2014" or "Mar 27, 2014"
    m = re.search(r'([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})', s)
    if m:
        from datetime import datetime
        try:
            dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            try:
                dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%b %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
    # Just a year
    m = re.search(r'\b(20\d{2})\b', s)
    if m:
        return m.group(1)
    return None


def _parse_memory_gb(text: Any) -> Optional[float]:
    """Parse memory size to GiB (float).

    Handles: "80", "24576" (MiB auto-detect), "2× 6", "0.5 1" (take max),
    "4 GB", "2048 MB", "1 / 2".
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").strip()

    # "2× 6" → strip multiplier prefix
    s = re.sub(r'^\d+\s*[×x]\s*', '', s, flags=re.I)

    # Explicit units: "4 GB", "2048 MB", "4096 MiB"
    gb_m = re.findall(r'([\d.]+)\s*(?:GiB|GB)', s, re.I)
    if gb_m:
        return max(float(v) for v in gb_m)
    mb_m = re.findall(r'([\d.]+)\s*(?:MiB|MB)', s, re.I)
    if mb_m:
        return max(float(v) for v in mb_m) / 1024.0

    # Plain numbers — could be GiB or MiB
    nums = re.findall(r'[\d.]+', s)
    if nums:
        vals = [float(v) for v in nums if float(v) > 0]
        if not vals:
            return None
        biggest = max(vals)
        # Heuristic: if >= 256, probably MiB
        if biggest >= 256:
            return biggest / 1024.0
        return biggest
    return None


def _parse_tflops(text: Any, unit: str = "tflops") -> Optional[float]:
    """Parse a compute performance value.

    *unit* is 'tflops' or 'gflops'. GFLOPS values are converted to TFLOPS.
    Handles ranges (takes the larger value), "x2" suffixes, etc.
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").strip()

    # "No", "?" → None
    if s.lower() in _EMPTY or s.lower() == "no":
        return None

    # Remove "x2" suffix (dual-GPU)
    s = re.sub(r'\s*x\s*2\s*$', '', s, flags=re.I)
    # Remove "2× " prefix
    s = re.sub(r'^\d+\s*[×x]\s*', '', s, flags=re.I)

    # Extract all numbers
    nums = re.findall(r'[\d.]+', s)
    if not nums:
        return None

    vals = [float(v) for v in nums if float(v) > 0]
    if not vals:
        return None

    result = max(vals)  # take the larger (boost) value
    if unit == "gflops":
        result /= 1000.0
    return round(result, 4)


def _parse_tdp(text: Any) -> Optional[float]:
    """Parse TDP/TBP value in watts.

    Handles: "29", "375", "<150", "19 W", "Unknown", etc.
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").strip()
    s = s.replace("<", "").replace(">", "").replace("~", "")
    # Remove " W" suffix
    s = re.sub(r'\s*W\s*$', '', s, flags=re.I)
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    if m:
        return float(m.group(1))
    return None


def _parse_bus_width(text: Any) -> Optional[int]:
    """Parse memory bus width in bits.

    Handles: "64", "256", "2× 384", combined like "DDR3 64-bit".
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").strip()
    # Combined type & width: "GDDR5 128-bit"
    m = re.search(r'(\d+)\s*-?\s*bit', s, re.I)
    if m:
        return int(m.group(1))
    # "2× 384"
    s = re.sub(r'^\d+\s*[×x]\s*', '', s, flags=re.I)
    m = re.search(r'\b(\d+)\b', s)
    if m:
        v = int(m.group(1))
        # Sanity: bus widths are typically 32-8192
        if 16 <= v <= 8192:
            return v
    return None


def _parse_memory_type(text: Any) -> Optional[str]:
    """Extract memory type: GDDR6X, GDDR6, HBM3, HBM2e, etc."""
    if _is_empty(text):
        return None
    s = str(text).upper()
    # Ordered by specificity (longer matches first)
    for mem_type in [
        "HBM3E", "HBM3", "HBM2E", "HBM2", "HBM",
        "GDDR7", "GDDR6X", "GDDR6", "GDDR5X", "GDDR5", "GDDR4", "GDDR3",
        "DDR5", "DDR4", "DDR3", "DDR2",
        "LPDDR5X", "LPDDR5", "LPDDR4X", "LPDDR4",
    ]:
        if mem_type in s:
            return mem_type
    return None


def _parse_clock_mhz(text: Any) -> Optional[float]:
    """Parse a clock speed in MHz.

    Handles: "810", "980", "1752.5 (7010)", ranges "738-888" (take max).
    For GT/s values, multiply by 1000 to get MHz equivalent.
    """
    if _is_empty(text):
        return None
    s = str(text).replace(",", "").strip()
    # Remove parenthesised effective rate: "1752.5 (7010)" → "1752.5"
    s = re.sub(r'\s*\(.*?\)', '', s)
    # All numbers
    nums = re.findall(r'[\d.]+', s)
    if not nums:
        return None
    vals = [float(v) for v in nums if float(v) > 0]
    if not vals:
        return None
    return max(vals)


def _parse_version(text: Any) -> Optional[str]:
    """Parse an API version string. Returns first version-like token."""
    if _is_empty(text):
        return None
    s = str(text).strip()
    # "12 (12_1)" → "12"
    # "11.2b/12.0" → "12.0" (take the latest)
    # "4.6 ES 3.2" → "4.6"
    # "1.1.101" → "1.1"
    parts = re.split(r'[/,]', s)
    versions = []
    for part in parts:
        m = re.search(r'(\d+(?:\.\d+)?)', part.strip())
        if m:
            versions.append(m.group(1))
    if versions:
        # Return the highest version
        try:
            return max(versions, key=lambda v: tuple(int(x) for x in v.split('.')))
        except ValueError:
            return versions[-1]
    return None


def _parse_transistors_die(text: Any) -> Tuple[Optional[float], Optional[float]]:
    """Parse combined 'Transistors & die size' field.

    Handles: "690×10⁶ 56mm²", "1040×10⁶ 90 mm²", "370×10⁶ 67 mm²"
    Returns: (transistors_billion, die_size_mm2)
    """
    if _is_empty(text):
        return None, None
    s = str(text).strip()

    transistors = None
    die_size = None

    # Transistors: "690×10⁶" → 0.69 billion
    m = re.search(r'([\d,.]+)\s*[×x]\s*10⁶', s)
    if m:
        transistors = float(m.group(1).replace(",", "")) / 1000.0

    # Transistors: "1.8×10⁹" → 1.8 billion
    m2 = re.search(r'([\d,.]+)\s*[×x]\s*10⁹', s)
    if m2:
        transistors = float(m2.group(1).replace(",", ""))

    # Die size: "56mm²" or "56 mm²" or "56 mm2"
    dm = re.search(r'(\d+(?:\.\d+)?)\s*mm[²2]?', s)
    if dm:
        die_size = float(dm.group(1))

    return transistors, die_size


# ─────────────────────────────────────────────
#  Multi-key lookup helper
# ─────────────────────────────────────────────

def _get(raw: Dict[str, Any], *keys: str) -> Any:
    """Return the first non-empty value for any of *keys*."""
    for k in keys:
        v = raw.get(k)
        if not _is_empty(v):
            return v
    return None


# ─────────────────────────────────────────────
#  Main normalizer for a single GPU entry
# ─────────────────────────────────────────────

def normalize_entry(gpu_id: str, raw: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a single raw GPU entry to the normalized schema."""

    entry: Dict[str, Any] = {k: None for k in SCHEMA_FIELDS}

    # ── Identity ──
    model = _get(raw, "Model name", "Model name (Architecture)")
    if model and str(model).strip().lower() not in _EMPTY:
        entry["model_name"] = str(model).strip()
    else:
        model2 = _get(raw, "Model")
        if model2 and str(model2).strip().lower() not in _EMPTY:
            entry["model_name"] = str(model2).strip()
        else:
            # Some AMD entries have the model name in "Model (Code name)" or "Model (Codename)"
            model3 = _get(raw, "Model (Code name)", "Model (Codename)", "Model (codename)")
            if model3 and str(model3).strip().lower() not in _EMPTY:
                entry["model_name"] = str(model3).strip()

    entry["vendor"] = str(raw.get("Vendor", "Unknown")).strip()

    code = _get(raw, "Code name", "Code name(s)")
    if code and str(code).strip().lower() not in _EMPTY:
        entry["code_name"] = str(code).strip()

    # ── Launch date ──
    entry["launch_date"] = _parse_date(_get(raw, "Launch"))

    # ── Process / Fab ──
    fab_text = _get(raw, "Fab (nm)", "Process",
                     "Architecture & fab", "Architecture (Fab)", "Architecture & Fab")
    entry["process_nm"] = _parse_nm(fab_text)
    entry["fab"] = _parse_fab(fab_text)

    # ── Transistors & die size ──
    # Try dedicated fields first
    trans = _get(raw, "Transistors (billion)")
    if trans is not None:
        v = _first_number(trans)
        if v is not None:
            entry["transistors_billion"] = round(v, 3)
    if entry["transistors_billion"] is None:
        trans_m = _get(raw, "Transistors (million)")
        if trans_m is not None:
            v = _first_number(trans_m)
            if v is not None:
                entry["transistors_billion"] = round(v / 1000.0, 3)

    die = _get(raw, "Die size (mm)")
    if die is not None:
        entry["die_size_mm2"] = _first_number(die)

    # Combined field fallback
    if entry["transistors_billion"] is None or entry["die_size_mm2"] is None:
        combined = _get(raw, "Transistors & die size",
                         "Transistors & Die Size", "Transistors Die Size")
        if combined is not None:
            t, d = _parse_transistors_die(combined)
            if entry["transistors_billion"] is None and t is not None:
                entry["transistors_billion"] = round(t, 3)
            if entry["die_size_mm2"] is None and d is not None:
                entry["die_size_mm2"] = d

    # ── Bus interface ──
    bus = _get(raw, "Bus interface", "Bus Interface")
    if bus and str(bus).strip().lower() not in _EMPTY:
        entry["bus_interface"] = str(bus).strip()

    # ── Core config ──
    cc = _get(raw, "Core config", "Core Config", "Core config,",
              "Core config,,", "Core Config (CU)", "Shaders Core config")
    if cc and str(cc).strip().lower() not in _EMPTY:
        entry["core_config"] = str(cc).strip()

    # ── Memory ──
    mem_text = _get(raw,
                    "Memory Size (GiB)", "Memory configuration Size (GiB)",
                    "Memory Size (GB)", "Memory Size",
                    "Memory Size (MiB)", "Memory Size (MB)",
                    "Memory_GB")
    entry["memory_gb"] = _parse_memory_gb(mem_text)

    # Memory type
    mem_type_text = _get(raw,
                         "Memory Bus type", "Memory_Type", "Memory Type",
                         "Memory configuration DRAM type", "Memory RAM type",
                         "Memory Bus type & width", "Memory Bus type & width (bit)")
    entry["memory_type"] = _parse_memory_type(mem_type_text)

    # Memory bus width
    bus_w_text = _get(raw,
                      "Memory Bus width (bit)", "Memory configuration Bus width (bit)",
                      "Memory Bus type & width", "Memory Bus type & width (bit)")
    entry["memory_bus_width_bit"] = _parse_bus_width(bus_w_text)

    # Memory bandwidth
    bw_text = _get(raw,
                   "Memory Bandwidth (GB/s)", "Memory configuration Bandwidth (GB/s)")
    if bw_text is not None:
        entry["memory_bandwidth_gbs"] = _first_number(bw_text)

    # ── Clock speeds ──
    # Base clock
    base_text = _get(raw,
                     "Clock speeds Base core clock (MHz)",
                     "Clock speeds Base core (MHz)",
                     "Clock rate Base (MHz)",
                     "Clock rate Core (MHz)",
                     "Core Clock (MHz)",
                     "Core clock (MHz)",
                     "Clock Speeds Base (MHz)",
                     "Clock speed Core (MHz)",
                     "Clock speed Min (MHz)",
                     "Shaders Base clock (MHz)")
    entry["clock_base_mhz"] = _parse_clock_mhz(base_text)

    # Boost clock
    boost_text = _get(raw,
                      "Clock speeds Boost core clock (MHz)",
                      "Clock speeds Boost core (MHz)",
                      "Clock rate Max Boost (MHz)",
                      "Clock rate Average Boost (MHz)",
                      "Boost clock (MHz)",
                      "Clock Speeds Boost (MHz)",
                      "Shaders Max boost clock (MHz)")
    entry["clock_boost_mhz"] = _parse_clock_mhz(boost_text)

    # Memory clock — only use explicitly MHz-labeled fields.
    # GT/s and MT/s have ambiguous conversion factors depending on memory type,
    # so we skip them and prefer direct MHz values.
    mem_clk_text = _get(raw,
                        "Memory clock (MHz)",
                        "Memory Clock (MHz)",
                        "Clock rate Memory (MHz)")
    if mem_clk_text is not None:
        entry["clock_memory_mhz"] = _parse_clock_mhz(mem_clk_text)
    else:
        # Fallback: GT/s × 1000 for a rough MHz-equivalent
        gts_text = _get(raw,
                        "Clock speeds Memory (GT/s)",
                        "Clock Speeds Memory (GT/s)",
                        "Clock speed Memory (GT/s)",
                        "Memory (GT/s)")
        if gts_text is not None:
            v = _first_number(gts_text)
            if v is not None:
                entry["clock_memory_mhz"] = round(v * 1000, 1)

    # ── TDP ──
    tdp_text = _get(raw, "TDP (Watts)", "TDP (W)", "TDP", "TBP (W)", "TBP")
    entry["tdp_watts"] = _parse_tdp(tdp_text)

    # ── Processing power ──
    # FP16 (half precision)
    fp16 = _get(raw,
                "Processing power (TFLOPS) Half precision",
                "Processing power (TFLOPS) Half",
                "Processing power (TFLOPS) Half precision Tensor Core FP32 Accumulate",
                "Vector TFLOPS FP16")
    if fp16 is not None:
        entry["tflops_fp16"] = _parse_tflops(fp16, "tflops")
    else:
        fp16_g = _get(raw,
                      "Processing power (GFLOPS) Half precision",
                      "Processing power (GFLOPS) Half")
        if fp16_g is not None:
            entry["tflops_fp16"] = _parse_tflops(fp16_g, "gflops")

    # FP32 (single precision)
    fp32 = _get(raw,
                "Processing power (TFLOPS) Single precision",
                "Processing power (TFLOPS) Single",
                "Processing power (TFLOPS) Single precision (MAD or FMA)",
                "Vector TFLOPS FP32")
    if fp32 is not None:
        entry["tflops_fp32"] = _parse_tflops(fp32, "tflops")
    else:
        fp32_g = _get(raw,
                      "Processing power (GFLOPS) Single precision",
                      "Processing power (GFLOPS) Single",
                      "Processing power (GFLOPS) Single precision (Boost)",
                      "Processing power (GFLOPS)")
        if fp32_g is not None:
            entry["tflops_fp32"] = _parse_tflops(fp32_g, "gflops")

    # FP64 (double precision)
    fp64 = _get(raw,
                "Processing power (TFLOPS) Double precision",
                "Processing power (TFLOPS) Double",
                "Processing power (TFLOPS) Double precision (FMA)",
                "Vector TFLOPS FP64")
    if fp64 is not None:
        entry["tflops_fp64"] = _parse_tflops(fp64, "tflops")
    else:
        fp64_g = _get(raw,
                      "Processing power (GFLOPS) Double precision",
                      "Processing power (GFLOPS) Double")
        if fp64_g is not None:
            entry["tflops_fp64"] = _parse_tflops(fp64_g, "gflops")

    # Fallback: if fp16 is None but tensor data exists, use tensor
    if entry["tflops_fp16"] is None:
        tensor = _get(raw,
                      "Processing power (TFLOPS) Tensor compute (FP16)",
                      "Processing power (TFLOPS) Tensor compute (FP16) (sparse)",
                      "Processing power (TFLOPS) Tensor compute (FP16) (2:1 sparse)",
                      "Processing power (TFLOPS) Tensor compute FP16 (2:1 sparse)",
                      "Processing power (TFLOPS) Tensor",
                      "Processing power (GFLOPS) Tensor compute (FP16)")
        if tensor is not None:
            # Check if GFLOPS key
            is_gflops = "GFLOPS" in str(
                [k for k in raw.keys() if "Tensor" in k and not _is_empty(raw.get(k))])
            entry["tflops_fp16"] = _parse_tflops(tensor,
                                                  "gflops" if is_gflops else "tflops")

    # ── Price ──
    price_text = _get(raw,
                      "Release Price (USD)",
                      "Release price (USD)",
                      "Release price (USD) MSRP")
    entry["price_usd"] = _parse_price(price_text)

    # Fallback: "Release Date & Price" combined field (AMD)
    # Only parse price if field contains a "$" sign (to avoid parsing dates as prices)
    if entry["price_usd"] is None:
        combined_price = raw.get("Release Date & Price")
        if combined_price and not _is_empty(combined_price) and "$" in str(combined_price):
            entry["price_usd"] = _parse_price(combined_price)

    # ── API versions ──
    entry["direct3d_version"] = _parse_version(
        _get(raw, "Supported API version Direct3D",
             "API compliance (version) Direct3D",
             "API compliance (version) DirectX",
             "Supported API version DirectX"))

    entry["opengl_version"] = _parse_version(
        _get(raw, "Supported API version OpenGL",
             "API compliance (version) OpenGL",
             "Latest supported API version OpenGL"))

    entry["opencl_version"] = _parse_version(
        _get(raw, "Supported API version OpenCL",
             "API compliance (version) OpenCL"))

    entry["vulkan_version"] = _parse_version(
        _get(raw, "Supported API version Vulkan",
             "API compliance (version) Vulkan",
             "Latest supported API version Vulkan"))

    entry["cuda_version"] = _parse_version(
        _get(raw, "Supported API version CUDA",
             "CUDA compute capability",
             "Supported API version CUDA Compute Capability"))

    return entry


# ─────────────────────────────────────────────
#  Top-level normalize function
# ─────────────────────────────────────────────

def normalize(input_path: str = "gpu_data_raw.json",
              output_path: str = "gpu_data.json") -> Dict[str, Dict]:
    """Read raw GPU catalog, normalize every entry, write clean catalog."""
    with open(input_path, "r", encoding="utf-8") as f:
        raw_data: Dict[str, Dict] = json.load(f)

    result: Dict[str, Dict] = {}
    skipped = 0

    for gpu_id, gpu_raw in raw_data.items():
        try:
            entry = normalize_entry(gpu_id, gpu_raw)
            result[gpu_id] = entry
        except Exception as e:
            print(f"[WARN] Skipped {gpu_id}: {e}")
            skipped += 1

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    total = len(result)
    with_mem = sum(1 for e in result.values() if e["memory_gb"] is not None)
    with_tflops = sum(1 for e in result.values()
                      if e["tflops_fp16"] is not None or e["tflops_fp32"] is not None)
    with_price = sum(1 for e in result.values() if e["price_usd"] is not None)

    print(f"[OK] Normalized {total} GPUs -> {output_path}")
    print(f"   Memory: {with_mem}/{total} | TFLOPS: {with_tflops}/{total} | "
          f"Price: {with_price}/{total} | Skipped: {skipped}")

    return result


# ─────────────────────────────────────────────
#  CLI entry point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    inp = sys.argv[1] if len(sys.argv) > 1 else "gpu_data_raw.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "gpu_data.json"
    normalize(inp, out)
