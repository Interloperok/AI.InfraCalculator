"""Methodology v3 calibrated coefficients — single source of truth.

Default values for sizing coefficients used by Pydantic field defaults in
``models/sizing.py`` and as fallbacks for env-driven settings in ``settings.py``.

When the methodology re-calibrates (Appendix Е runs periodically), only this
module changes — Pydantic field defaults and settings fallbacks pick up the
new values automatically.

References:
- Methodology Appendix Е.5 — typical ranges per engine × model × quantization
- Methodology Appendix Е.6 — calibration procedure (decode-heavy + prefill-heavy)
- Calibration source: vLLM FP8 fixture, 180 TTFT points + 180 TPOT points
"""

# Compute efficiency coefficients (§Е.5)
ETA_PF_DEFAULT = 0.167
ETA_DEC_DEFAULT = 0.20

# Memory bandwidth efficiency (§Е.5, decode mem-bound branch in §6.1)
ETA_MEM_DEFAULT = 0.36

# Batch saturation coefficient (§А — Tensor Parallelism derivation)
C_SAT_DEFAULT = 6.0

# TTFT per-request overhead (§7.1) — tokenization + proxy + admission
T_OVERHEAD_DEFAULT = 0.026

# Throughput modifiers (§3.1 H-5)
ETA_CACHE_DEFAULT = 0.0
K_SPEC_DEFAULT = 1.0

# Per-forward memory overhead (§6.2) — Dense BF16 = 0; FP8 MoE up to ~9 GB
O_FIXED_DEFAULT = 0.0

# Weight quantization formats (§3.1) — single source for the web forms
# (frontend/src/data/quantization.json is generated from this list by
# scripts/export_methodology_constants.py), the MCP/OpenAPI schema and the
# Excel Reference sheet. ``default_for_bytes`` marks the label used when only
# bytes_per_param is known (2 → FP16, 0.5 → INT4 are ambiguous otherwise).
QUANTIZATION_FORMATS: tuple[dict, ...] = (
    {
        "label": "FP32",
        "bytes_per_param": 4.0,
        "description": "Полная точность — обучение и исследование",
        "default_for_bytes": True,
    },
    {
        "label": "FP16",
        "bytes_per_param": 2.0,
        "description": "Стандарт для инференса с высокой точностью",
        "default_for_bytes": True,
    },
    {
        "label": "BF16",
        "bytes_per_param": 2.0,
        "description": "Стандарт для Qwen/Llama/DeepSeek native weights",
        "default_for_bytes": False,
    },
    {
        "label": "FP8",
        "bytes_per_param": 1.0,
        "description": "Baseline для современных инференс-движков",
        "default_for_bytes": True,
    },
    {
        "label": "INT8",
        "bytes_per_param": 1.0,
        "description": "W8A8/W8A16 (SmoothQuant, LLM.int8)",
        "default_for_bytes": False,
    },
    {
        "label": "FP4",
        "bytes_per_param": 0.5,
        "description": "NVFP4/MXFP4 на Blackwell (B200/GB200/B300)",
        "default_for_bytes": False,
    },
    {
        "label": "INT4",
        "bytes_per_param": 0.5,
        "description": "GPTQ/AWQ — агрессивная квантизация",
        "default_for_bytes": True,
    },
)

QUANTIZATION_LABELS: dict[str, float] = {
    q["label"]: q["bytes_per_param"] for q in QUANTIZATION_FORMATS
}
DEFAULT_QUANTIZATION_LABEL: dict[float, str] = {
    q["bytes_per_param"]: q["label"] for q in QUANTIZATION_FORMATS if q["default_for_bytes"]
}
