# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### v1.3.0 — Methodology v3 parity (P0–P3 of 7)

Brings the calculator from methodology v2 to v3 in four backwards-
compatible phases. Stacks under a single semver-major release because
default-relying callers see numeric shifts (TTFT, decode throughput,
server counts) when their inputs match the regimes the new formulas
correct.

Phases P4–P6 (iterative servers-by-compute, MLA branch, loaded
latency) remain ahead of v1.3.0 but the formulas in P0–P3 stand on
their own and are independently verifiable. Future v1.4.x / v1.5.x
will land them.

#### P3: MoE accounting (P_active / P_effective)

Implements §6.1 MoE expansion from methodology v3 — fixes a v2 bug
where `FPS = 2·P_total·10⁹` overcounted FLOPs for MoE models (where
only `P_active` weights actually participate in a forward pass).

**Added:**
- `core.sizing_math.calc_p_effective(p_dense, p_moe, n_experts, k_experts, bs_real)`:
  `P_eff(BS) = P_dense + P_moe · [1 − (1 − k/N)^BS]`. For dense
  models (P_moe=0) returns P_dense.
- `SizingInput` new optional MoE fields (Section 3.1):
  - `params_active` — activated parameters (B). DeepSeek-V3: 37.
  - `params_dense` — dense part (B).
  - `params_moe` — sum of all experts (B).
  - `n_experts` — total experts in MoE layer.
  - `k_experts` — top-k activated per token.
- `SizingOutput`:
  - `p_active_used` — what was used in FPS.
  - `p_effective_used` — what was used in mem-bound formula at BS=1.
  - `is_moe_detailed` — true when full MoE config supplied.
- 6 unit tests covering dense fallback, Mixtral, DeepSeek-V3, coverage
  growth with batch.

**Changed:**
- `services.sizing_service.run_sizing()`:
  - Resolves `p_active = inp.params_active or inp.params_billions`.
  - When all 4 MoE fields supplied (params_dense, params_moe, n_experts,
    k_experts > 0), computes `p_effective(BS=1)`. Otherwise
    `p_effective = p_active`.
  - `FPS = 2·p_active·1e9` (was 2·params_billions).
  - `calc_th_decode_mem` uses `p_effective` (was params_billions).
- Goldens add the 3 new dense-default output fields:
  `p_active_used = params_billions`, `p_effective_used = p_active_used`,
  `is_moe_detailed = false`. No numeric shifts in existing fixtures.

**Notes:**
- Dense path (no MoE fields supplied) is fully unchanged — golden
  numerics preserved.
- Real MoE configs see large compute-throughput increases (smaller FPS)
  and proportionally lower mem-traffic per decode step. Net effect
  depends on the regime: for typical decode-heavy MoE workloads on
  H100/H200, mem-bound dominates → effective `Th_decode` rises along
  with `Th_dec_mem`.
- `BS_real = 1` for now. P4 will couple `BS_real` to `Servers_count`
  via fixed-point iteration → `P_eff(BS_real)` grows with batch.

#### P2: TTFT corrections + SL_pf separation

Implements §7.1 from methodology v3 — fixes the long-standing v2 bug
where TTFT used the full session length `SL` (including answer and
reasoning tokens that haven't been generated yet).

**Added:**
- `core.sizing_math.calc_sl_pf()` — input-only sequence length:
  `SL_pf = SP + N_prp·Prp + (N_prp − 1)·MRT`. Used for prefill/TTFT,
  distinct from `SL` which stays for KV-cache sizing.
- `SizingOutput.SL_pf_input_length` — raw `SL_pf` (before prefix-cache).
- `SizingOutput.SL_pf_eff_after_cache` — after `η_cache` reduction.
- 6 unit tests for `calc_sl_pf` and the new `calc_ttft` signature.

**Changed:**
- `core.sizing_math.calc_ttft()` signature:
  `calc_ttft(sl_pf_eff, th_pf, th_dec, t_overhead=0.0)`. New formula:
  `TTFT = SL_pf^eff/Th_pf + 1/Th_dec + T_overhead`.
- `services.sizing_service.run_sizing()`:
  - Computes `SL_pf` and `SL_pf_eff = SL_pf · (1 − η_cache)`.
  - Applies `K_spec` multiplier to `th_dec` after `select_th_decode()` —
    flows into `Cmodel`, `generation_time`, `e2e_latency`, and TTFT's
    decode term. Default `K_spec = 1.0` → no shift.
- Golden TTFT and `e2e_latency_analyt` values updated:
  - `baseline_small`: TTFT 0.9015 → 0.5521 (-39%).
  - `high_load_enterprise`: TTFT 0.4673 → 0.2597 (-44%).
  - `long_context_compute_bound`: TTFT 2.866 → 1.7401 (-39%).
- `tests/test_sizing_math_guards.py`: updated `calc_ttft` call to use
  `sl_pf_eff=` keyword (was `SL=`).

**Notes:**
- The TTFT drops are large because v2 was using the post-generation
  length (multi-turn full session) where it should have been using the
  input length only. Real-world callers will see lower TTFT estimates
  matching what production load testing reports.
- `T_overhead` default `0.026 s` adds a small constant (subtracted from
  the TTFT drop above).
- `η_cache` default `0.0` means no prefix-cache reduction by default.
  Operators using vLLM APC / SGLang RadixAttention can set
  `eta_cache=0.3..0.5` to reflect realistic chat workloads.

#### P1: Memory-bandwidth-bound decode

Implements §6.1 H-7 from methodology v3:
`Th_dec = min(Th_dec^compute, Th_dec^mem)`.

**Added:**
- `core.sizing_math.calc_th_decode_mem()` — memory-bandwidth-bound decode formula:
  `Th_dec_mem = (BW_GPU·1e9·η_mem) / (P·1e9·B_quant + BS·M_KV·1024³ + O_fixed·1024³)`.
  Returns 0.0 if `bw_gpu_gbs` is None/0 (mem branch silently skipped).
- `core.sizing_math.select_th_decode()` — selector returning
  `(value, mode)` where mode ∈ `{compute, memory, compute_only, memory_only, none}`.
- `services.gpu_catalog_service.lookup_gpu_bandwidth_gbs()` — strict `gpu_id`-only
  lookup for `memory_bandwidth_gbs` field (no memory-fallback to avoid spurious
  matches with fixture/fake gpu_ids).
- `SizingOutput` new fields: `th_dec_compute`, `th_dec_mem`, `mode_decode_bound`,
  `bw_gpu_gbs_used`. All optional — `None` when not applicable.
- 10 unit tests covering mem-bound formula behavior and selector cases.

**Changed:**
- `services.sizing_service.run_sizing()` — decode throughput now resolves from
  `min(compute, mem)`. Empirical override (`th_decode_empir`) still takes
  highest priority. `mode_decode_bound` records which branch dominated.
- Golden fixtures updated with new output fields. All 3 fixtures use
  `gpu_id="fixture-gpu"` which resolves to no bandwidth → `compute_only` →
  `th_decode` numeric value preserved (regression-safe).

**Notes:**
- For BS_real, P1 uses **BS=1**. Iterative coupling between `Servers_count`
  and `BS_real` lands in P4 (§6.4 fixed-point loop).
- `params_billions` is treated as `P_active` for now. P3 will add
  `P_active`/`P_dense`/`P_moe` distinction with `P_effective(BS_real)`.
- Existing API callers without `gpu_id` (or with fake gpu_id) keep their
  current compute-bound numeric output unchanged. Real-world callers with
  catalog-resolvable `gpu_id` automatically get the v3 min(compute,mem)
  behavior — for typical decode workloads this means lower `th_decode`
  and higher `servers_by_compute`.

#### P0: Methodology v3 calibration baseline

Aligns calculator defaults with the v3-calibrated coefficients from the published methodology
(see `Interloperok/AI.ServerCalculation.Methodology`, Appendix Е).

**Added:**
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

**Changed:**
- `SizingInput` calibration defaults shifted to v3 values:
  - `eta_prefill`: `0.20` → `0.167`.
  - `eta_decode`: `0.15` → `0.20`.
  - `saturation_coeff_C`: `8.0` → `6.0`.
- `tests/payload.json`, `tests/whatif.json` — example payloads updated to v3 defaults.

**Removed:**
- `backend/reportTemplate_old.xlsx` — legacy template, no references.

**Notes:**
- **No formulas changed in this release.** Only defaults and field declarations.
- Existing API callers that pass explicit `eta_prefill` / `eta_decode` / `saturation_coeff_C`
  values are unaffected.
- Existing API callers that rely on defaults will see a small shift in numeric outputs
  (TTFT changes within ±10%, server count typically ±1).
- Golden fixtures in `backend/tests/fixtures/golden/` are unaffected: they specify all inputs
  explicitly, so default changes do not move expected values.
