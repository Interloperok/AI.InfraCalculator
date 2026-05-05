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
