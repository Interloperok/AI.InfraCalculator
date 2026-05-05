# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### v3.0.0-alpha — Methodology v3 calibration baseline (P0)

Aligns calculator defaults with the v3-calibrated coefficients from the published methodology
(see `Interloperok/AI.ServerCalculation.Methodology`, Appendix Е).

#### Added
- `backend/core/methodology_constants.py` — single source of truth for v3-calibrated defaults
  (`ETA_PF_DEFAULT`, `ETA_DEC_DEFAULT`, `ETA_MEM_DEFAULT`, `C_SAT_DEFAULT`, `T_OVERHEAD_DEFAULT`,
  `ETA_CACHE_DEFAULT`, `K_SPEC_DEFAULT`, `O_FIXED_DEFAULT`).
- `backend/settings.py` — env override hooks for each calibration coefficient
  (`AI_SC_ETA_PF`, `AI_SC_ETA_DEC`, `AI_SC_ETA_MEM`, `AI_SC_C_SAT`, `AI_SC_T_OVERHEAD`,
  `AI_SC_ETA_CACHE`, `AI_SC_K_SPEC`, `AI_SC_O_FIXED`). Declared for operator override at
  deploy time; not yet consumed by `sizing_service` (will be wired in subsequent v3 phases).
- `SizingInput` new fields (Optional, scaffolded for upcoming phases):
  - `bw_gpu_gbs` — GPU memory bandwidth (consumed in P1: memory-bandwidth-bound decode).
  - `eta_mem` — memory-bandwidth efficiency (P1).
  - `o_fixed` — per-forward memory overhead (P1).
  - `t_overhead` — TTFT overhead (P2).
  - `eta_cache` — prefix-cache fraction (P2).
  - `k_spec` — speculative-decoding multiplier (P2).

#### Changed
- `SizingInput` calibration defaults shifted to v3 values:
  - `eta_prefill`: `0.20` → `0.167`.
  - `eta_decode`: `0.15` → `0.20`.
  - `saturation_coeff_C`: `8.0` → `6.0`.
- `tests/payload.json`, `tests/whatif.json` — example payloads updated to v3 defaults.

#### Removed
- `backend/reportTemplate_old.xlsx` — legacy template, no references.

#### Notes
- **No formulas changed in this release.** Only defaults and field declarations.
- Existing API callers that pass explicit `eta_prefill` / `eta_decode` / `saturation_coeff_C`
  values are unaffected.
- Existing API callers that rely on defaults will see a small shift in numeric outputs
  (TTFT changes within ±10%, server count typically ±1).
- Golden fixtures in `backend/tests/fixtures/golden/` are unaffected: they specify all inputs
  explicitly, so default changes do not move expected values.
