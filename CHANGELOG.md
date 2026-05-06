# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### v1.3.0 — Methodology v3 parity (P0–P11)

Brings the calculator from methodology v2 to v3 across calibration,
memory-bandwidth-bound decode, TTFT corrections, MoE accounting,
iterative servers-by-compute fixed-point, MLA support, loaded-latency
SLA, continuous-batching prefill, agentic K_calls, parallelism
beyond TP, prefill/decode pool disaggregation, and VLM single-pass
online sizing. Stacks under a single semver-bump because default-relying
callers see numeric shifts when their inputs match the regimes the
new formulas correct.

P9 ships in phases: P9a (VLM single-pass online) is in this release;
P9b (OCR+LLM two-pass), P9c (batch mode), and P9d (multi-class
workloads) follow in v1.4.x.

#### P9a: VLM single-pass online sizing (Appendix И.3.1, И.4.1)

Adds a dedicated endpoint `POST /v1/size-vlm` for sizing visual-language
models (Qwen2.5-VL, InternVL-2.5, etc.) running single-pass document
extraction in online (per-page SLA) mode. v2 had no VLM support — vision
tokens, per-page latency, and replicas-from-`C_peak` are all new
concepts that don't fit the LLM `S_sim`/req-sec framing.

**Added:**
- `core.sizing_math.calc_v_tok(w_px, h_px, patch_eff, n_ch=1)`:
  visual-token count `V_tok = ⌈(W·H) / patch_eff²⌉ · n_ch` (И.3.1).
- `core.sizing_math.calc_sl_pf_vlm(v_tok, n_prompt_txt)`:
  prefill length `SL_pf^VLM = V_tok + N_prompt^txt`.
- `core.sizing_math.calc_sl_dec_vlm(n_fields, tok_field)`:
  decode length `SL_dec^VLM = N_fields · tok_field`.
- `core.sizing_math.calc_t_page_vlm(...)`:
  per-page latency `t_page^VLM = SL_pf^eff/Th_pf + SL_dec/Th_dec + T_ovh^VLM`
  (И.4.1).
- New Pydantic models `VLMSizingInput` and `VLMSizingOutput` covering
  workload (`λ_online`, `C_peak`, `SLA_page`), image profile
  (`w_px`, `h_px`, `patch_eff`, `n_ch`, `n_prompt_txt`, `n_fields`,
  `tok_field`), VLM model parameters, hardware, and calibration
  coefficients (`η_vlm,pf` default 0.15 per И.7.1, `η_cache_VLM` default 0,
  `T_ovh^VLM` from methodology constants).
- `services.vlm_sizing_service.run_vlm_sizing(VLMSizingInput) -> VLMSizingOutput`
  orchestrator: token profile → §3.1/§3.2 memory → §4.1/§4.4 GPU/TP →
  §6.1 throughput → И.4.1 BS_real* search (max BS satisfying
  `t_page ≤ SLA_page`) → replicas `N_repl_VLM = ⌈C_peak / BS_real*⌉`,
  total GPUs `N_repl · Z · gpus_per_instance`, total servers.
- `POST /v1/size-vlm` FastAPI endpoint (tag: `VLM/OCR`).
- 12 pure-function unit tests + 18 service-level integration tests.

**Changed:**
- `models/__init__.py` re-exports `VLMSizingInput`, `VLMSizingOutput`.
- `api/sizing_handlers.py` adds `vlm_size_endpoint_handler` reusing the
  existing error-mapping pattern.

**Notes:**
- BS_real* search iterates 1..S_TP_z. Compute branch scales linearly
  with `1/BS` per session; mem branch (when bandwidth provided)
  recomputes via `calc_th_*_cb_mem` at each BS. Stops at the largest
  BS satisfying SLA, or at the first BS where SLA fails (search is
  monotonic in BS for the workloads modeled).
- Memory budget reuses `calc_kv_per_session_gb` with full session
  length `min(SL_pf + SL_dec, TSmax)`. MLA architectures (DeepSeek-VL2)
  out of scope for P9a — add in P9d alongside detailed MoE handling.
- Empirical OCR throughput, OCR+LLM two-pass, batch mode, and
  multi-class workloads remain in P9b/P9c/P9d.
- New endpoint is additive — no impact on existing `/v1/size`,
  `/v1/whatif`, `/v1/auto-optimize` callers.

#### P10: PD-disaggregation — split prefill/decode pools (Appendix Ж)

Implements the §Ж.2 split-pool sizing model `Servers_total =
Servers_pf + Servers_dec`. v2 modeled a single co-located pool where
both phases share each instance's time slice — for prefill-heavy or
decode-heavy workloads this over-provisions because both phases must
scale together even when only one saturates the hardware. PD-disagg
sizes each pool independently against its dominant coefficient
(η_pf for prefill, BW_GPU·η_mem·BS_real for decode), matching modern
deployments on NVIDIA Dynamo, vLLM 0.8+ disaggregated prefill, SGLang,
and DistServe.

**Added:**
- `core.sizing_math.calc_th_server_pf(NcountTP, th_pf, sl_pf_eff)`:
  prefill-pool server throughput `Th_pf^server = NcountTP · Th_pf / SL_pf^eff`
  (req/sec).
- `core.sizing_math.calc_th_server_dec(NcountTP, th_dec_per_session, bs_real, Tdec)`:
  decode-pool server throughput `Th_dec^server = NcountTP · BS_real · Th_dec_per_session / T_dec`
  (req/sec).
- `SizingInput` optional fields:
  - `use_pd_disagg` (default `False`) — when `True`, `servers_final`
    is sized as `max(servers_mem, servers_pf + servers_dec)`.
  - `pd_eta_pf_pool` — per-pool η_pf override (Ж.2 / §Е.1.2). Defaults
    to `inp.eta_prefill` when not set.
  - `pd_eta_mem_pool` — per-pool η_mem override (Ж.2 / §Е.1.1). Defaults
    to `inp.eta_mem` when not set.
- `SizingOutput` optional fields:
  - `pd_disagg_used` — bool echo of the input flag.
  - `th_server_pf`, `th_server_dec` — per-server pool throughput
    diagnostics, always populated.
  - `servers_pf`, `servers_dec`, `servers_pd_total` — per-pool counts
    + sum, always populated for what-if comparison.
  - `pd_eta_pf_pool_used`, `pd_eta_mem_pool_used` — applied eta echoes.
  - `pd_recommendation` — surfaced when `use_pd_disagg=False` and
    PD-disagg would save >30% of compute servers; references
    Приложение Ж and quotes the % savings.
- 8 unit tests for the pure pool-throughput functions and 9 service-
  level integration tests for the `use_pd_disagg` branch (regression,
  on/off behavior, eta override flow, recommendation format).

**Changed:**
- `services.sizing_service.run_sizing()`: after the §6.4 iteration
  converges on `BS_real`, computes pool-specific `Th_pf` and
  `Th_dec_per_session` by linearly scaling the relevant compute/mem
  branch with `eta_pf_pool_used / eta_prefill` and
  `eta_mem_pool_used / eta_mem` respectively. Empirical overrides
  bypass scaling. Pool counts use the existing `calc_servers_by_compute`
  with `effective_R = R · K_calls`.
- Goldens regenerated with the 9 new output fields. Numeric values
  unchanged for existing fixtures (`use_pd_disagg=False` and pool eta
  overrides default to global etas).

**Notes:**
- Memory sizing is shared across pools in this implementation —
  `servers_mem` acts as a floor on `servers_final`. Methodology Ж.2
  describes per-pool memory budgets but in practice the decode pool
  dominates KV memory; first-pass split-pool sizing maps directly onto
  the existing `servers_mem` calculation.
- Eta overrides scope to the dominant coefficient per pool. Per the
  methodology, prefill pool throughput is dominated by η_pf and decode
  pool by η_mem. `eta_decode` (compute branch) is not split because
  the per-session compute branch is independent of η_mem and the §6.4
  iteration has already converged.
- The 30% threshold for `pd_recommendation` is a heuristic. For
  exact savings, set `use_pd_disagg=True` and compare `servers_final`
  before/after.
- Off by default — existing API callers see no behavior change other
  than the new optional output fields.

#### P11: Parallelism beyond TP — DP/PP/EP/η_TP (Appendix Г)

Implements the §Г.7 total-GPU formula `Total = DP × TP × PP × EP` and
exposes Pipeline / Expert parallelism + interconnect efficiency
(η_TP) for sizing. v2 modeled only TP — workloads using PP for
memory-fit or EP for MoE distribution were sized with the wrong
per-instance footprint.

**Added:**
- `SizingInput` optional fields:
  - `pp_degree` (default 1) — Pipeline Parallelism degree.
  - `ep_degree` (default 1) — Expert Parallelism degree (MoE only).
  - `eta_tp` (default 1.0) — Tensor Parallelism efficiency.
  - `interconnect` (default None) — informational interconnect tag
    (`nvlink`, `pcie5`, `infiniband`, etc.).
- `SizingOutput` optional fields:
  - `total_gpu_per_instance` — TP × PP × EP × `gpus_per_instance`.
  - `total_gpu_count` — `servers_final × gpus_per_server`.
  - `eta_tp_used`, `pp_degree_used`, `ep_degree_used` — echoes.
- 4 unit tests covering Z_combined composition and η_TP scaling.

**Changed:**
- `services.sizing_service.run_sizing()`:
  - Computes `Z_combined = Z × PP × EP` and passes it as the
    multiplier to `calc_instances_per_server_tp`. Each PP/EP unit
    extends per-instance GPU footprint, reducing instances/server.
  - Multiplies nominal compute throughput branches (`th_dec_analyt`,
    `th_pf_compute_branch`) by `eta_tp` before they enter the
    iteration loop. Default 1.0 → no scaling.
- Goldens regenerated with the 5 new output fields. Numeric values
  unchanged for existing fixtures (PP=EP=1, η_TP=1.0).

**Notes:**
- Memory-side bookkeeping (`kv_free_per_instance_tp_gb`,
  `instance_total_mem_gb`) still uses TP-only sizing — not extended
  to PP/EP. Reasonable approximation: PP stages are sequential, only
  one active at a time per request, so KV is local to the TP group.
  Full PP-aware memory layout is a P14 polish item.
- Typical η_TP per interconnect (Appendix Г.7): NVLink 0.7-0.9,
  PCIe Gen5 0.4-0.6, InfiniBand NDR 0.3-0.5 between nodes.
- DP is implicit in the existing `instances_per_server` × `servers_final`
  product — not a separate input.

#### P8: Agentic K_calls / RAG / tool-use (Appendix В)

Implements the §В.4 generalization of the §2.2 token formula. v2
under-sized agentic workloads (ReAct, Self-Refine, multi-agent) by
3-20× because each user-level session triggers K_calls LLM
invocations, each carrying tool definitions and accumulated context.

**Added:**
- `core.sizing_math.calc_ts_agent(...)`:
  `TS_agent = SP_eff + N_prp · K_calls · (Prp_eff + MRT + A_eff)`
  with `SP_eff = SP + SP_tools + C_rag_static`,
  `Prp_eff = Prp + C_rag_dynamic`,
  `A_eff = A + A_tool`. Reduces to v2 (2.2) at `K_calls=1` + zero
  tool/RAG fields.
- `core.sizing_math.calc_sl_pf_agent(...)`: agentic generalization of
  `calc_sl_pf` for input-only prefill length.
- `SizingInput` new optional fields:
  - `k_calls` (default 1) — LLM invocations per user session.
  - `sp_tools` (default 0) — tool-definitions tokens.
  - `c_rag_static` (default 0) — static RAG context.
  - `c_rag_dynamic` (default 0) — dynamic per-query RAG.
  - `a_tool` (default 0) — tool_call JSON answer extras.
- 6 unit tests covering: reduction to v2, ReAct config, K_calls
  scaling, SP_tools vs A_tool placement (one-shot vs amplified).

**Changed:**
- `services.sizing_service.run_sizing()`:
  - `TS` now computed via `calc_ts_agent` (TS for KV cache).
  - `SL_pf` now computed via `calc_sl_pf_agent` (input-only for TTFT/Cmodel).
  - **R amplification:** `effective_R = R · K_calls` is passed to
    `calc_servers_by_compute` — each user session generates K_calls
    requests/sec to the LLM, not just R.
- Old `calc_session_context_TS` and `calc_sl_pf` imports removed from
  the service (functions still exported from `core` for direct test use).

**Notes:**
- Backwards compatible: existing fixtures (no agentic fields specified)
  use `K_calls=1` defaults → `TS_agent = TS` and `SL_pf_agent = SL_pf`,
  numerics preserved. Goldens unchanged.
- For ReAct with `K_calls=5`, `sp_tools=2000`, `c_rag_dynamic=1000`,
  `a_tool=150`: TS jumps from ~24k (v2 form) to ~150k (matches the
  В.4 worked example in the methodology — Example 2А-2В).
- The R-amplification means servers_by_compute scales linearly with
  K_calls in compute-dominated regimes. For Mixtral-style configs in
  ReAct mode, expect 5-10× more servers vs single-turn assumption.

#### P7: Continuous-batching prefill (`engine_mode`, `C_pf`)

Implements §6.1 prefill-side selector for modern inference engines.
v2 unconditionally applied K_batch to prefill, which is correct for
static batching but wrong for vLLM/SGLang/TGI continuous-batching —
where prefill chunks share memory bandwidth with active decoders.

**Added:**
- `core.sizing_math.calc_th_prefill_cb_compute`: same form as the
  static branch with K_batch=1, uses `SL_pf_eff` (post-prefix-cache).
- `core.sizing_math.calc_th_prefill_cb_mem`:
  `Th_pf^cb,mem = (C_pf · BW · 1e9 · η_mem) / (P_eff(BS+1)·1e9·B_quant
  + BS·MKV·1024³ + O_fixed·1024³)`. Returns 0 when `bw_gpu_gbs <= 0`
  or `c_pf <= 0`.
- `core.sizing_math.select_th_prefill`: min selector with mode
  signal, analogous to `select_th_decode`.
- `SizingInput.engine_mode` (default `"continuous"`), `c_pf` (default 256).
- `SizingOutput.th_pf_compute`, `th_pf_mem`, `mode_prefill_bound`.
- 8 unit tests: cb_compute = static-with-K_batch=1; cb_mem grows with
  C_pf and shrinks with BS_real; selector mode reporting.

**Changed:**
- Default `engine_mode = "continuous"` — matches modern inference
  engines (vLLM/SGLang/TGI/Triton+inflight). For legacy / offline
  workloads, set `engine_mode = "static"` explicitly.
- `services.sizing_service.run_sizing()`:
  - Computes the BS-independent prefill compute branch once outside
    the iteration loop.
  - Inside the iteration loop, computes the BS-dependent prefill mem
    branch (using `P_effective(BS_real + 1)` for the new prefill
    request joining BS_real decoders) and selects min(compute, mem).
  - Empirical override (`th_prefill_empir`) still takes top priority.
- Goldens regenerated. With fixture-gpu (no bw resolution → mem branch
  empty), all 3 fixtures get `mode_prefill_bound = "compute_only"` and
  `th_pf` drops by the K_batch factor:
  - `baseline_small`: th_pf 2664 → 2299 (K_batch=1.19; small impact).
  - `high_load_enterprise`: th_pf 8563 → **944** (K_batch=9.36; ~9× drop
    drives Cmodel down 33%, servers_by_compute 3 → 4. Memory still
    dominates at 22.).
  - `long_context_compute_bound`: th_pf 3559 → 2826 (K_batch=1.36).
- `test_sizing.py::EXCEL_EXPECTED` updated for new pipeline values.
- `test_sizing.py::TestSection6Compute::test_th_prefill_analyt` now
  asserts the **static-form** value directly (8563.06) rather than
  matching `EXCEL_EXPECTED["th_prefill"]`, since the pipeline default
  is continuous and the values differ.

**Notes:**
- Static-batching callers (offline scripts, Triton w/o inflight) get
  the v2 K_batch behavior by setting `engine_mode = "static"`.
- The cb mem branch only fires when `bw_gpu_gbs` is resolvable (real
  `gpu_id` from catalog or explicit input). For fixture / fake gpu_ids
  the prefill stays compute-only by design.
- For MoE workloads in continuous mode, prefill is doubly batch-aware:
  via `P_effective(BS_real+1)` (more experts covered as batch grows)
  and via `BS_real · MKV` denominator term.

#### P6: Loaded latency `e2eLatency_load` (Little's law)

Adds a queueing-aware end-to-end latency form for SLA validation.

**Added:**
- `core.sizing_math.calc_e2e_latency_load(bs_real, cmodel_rps)`:
  `e2eLatency_load = BS_real / C_model(BS_real)`. Inf when Cmodel ≤ 0.
- `SizingOutput`:
  - `e2e_latency_load` — load-form residence time.
  - `e2e_latency_for_sla` — `max(e2e_latency_analyt, e2e_latency_load)`,
    used for `e2e_latency_sla_pass`.
- 4 unit tests covering basic formula, infinity guards, BS scaling.

**Changed:**
- `services.sizing_service.run_sizing()`: SLA validation now compares
  `inp.e2e_latency_sla` against `e2e_latency_for_sla` (the stricter of
  the two forms) — catches load-induced violations the per-request
  form might miss.

**Notes:**
- Implementation caveat: with our current Cmodel definition (already
  BS-aware after P4's per-session th_dec), `e2e_latency_load` reduces to
  `time_per_request = SL_pf_eff/Th_pf + Tdec/Th_dec_per_session`, which
  is always smaller than `e2e_latency_analyt` (= same + `1/Th_dec_per_session
  + T_overhead`). So `for_sla = analyt` in steady-state convergence —
  the load field is mostly diagnostic in this release.
- Methodology may intend `C_model(BS=1)` baseline in the load formula;
  if so, a future `v1.4.x` revision can reinterpret. For now the field
  is exposed and consistent with the literal §7.2 expression.

#### P5: Multi-Head Latent Attention (MLA) for DeepSeek V2/V3/R1

Implements the §3.2 MLA branch of KV-cache sizing. v2 over-estimated
KV memory by ~10-50× for DeepSeek-style architectures because it
applied the standard `2·L·H·SL·B` formula even when models actually
cache a single low-rank latent + small RoPE part per token per layer.

**Added:**
- `core.sizing_math.calc_kv_mla(L, SL, kv_lora_rank, qk_rope_head_dim,
  bytes_state, emp_kv)`:
  `MKV_MLA = L · SL · (kv_lora_rank + qk_rope_head_dim) · B_state · EMP_kv / 1024³`.
  No factor of 2 — MLA caches one latent vector per token (not separate K and V).
- `SizingInput`:
  - `kv_lora_rank: Optional[int]` — DeepSeek-V3: 512.
  - `qk_rope_head_dim: Optional[int]` — DeepSeek-V3: 64.
- `SizingOutput.kv_arch_mode`: `'mla'` / `'mha'` / `'gqa'` / `'mqa'`,
  auto-detected from input fields (`kv_lora_rank > 0` → mla; otherwise
  from `num_kv_heads` vs `num_attention_heads` ratio).
- 5 unit tests for `calc_kv_mla` covering DeepSeek-V3 numerics,
  no-2× invariant, ratio vs standard form, EMP_kv linearity.

**Changed:**
- `services.sizing_service.run_sizing()`: branches on `is_mla =
  kv_lora_rank > 0` to choose between `calc_kv_mla` and `calc_kv_per_session_gb`.
  Auto-detects `kv_arch_mode` for diagnostic output.
- Goldens regenerated with `kv_arch_mode` field (mha/mha/gqa for the 3
  existing fixtures — none use MLA so no other numerics shift).

**Notes:**
- For DeepSeek-V3 at 4k context: MLA cache ≈ 0.26 GiB/session vs
  standard form's ~6.99 GiB/session (≈27× reduction). Translates
  directly into ~27× more sessions per GPU at the same memory budget.
- `qk_rope_head_dim` is optional; defaults to 0 if unspecified — useful
  for the case where you only know the LoRA rank.
- Backwards compatible: callers without `kv_lora_rank` continue to use
  the standard formula. No existing fixture changes.

#### P4: Iterative servers-by-compute (§6.4 fixed-point)

Couples `BS_real` (real batch size per instance) back to
`Servers_count`. v2's single-shot calculation under-counted Cmodel by
ignoring batch parallelism; with iteration, `Cmodel` rises with
`BS_real` (batch amortizes prefill time across requests) and
`Servers_comp` drops accordingly. For memory-tight configurations
(BS_real capped at S_TP_z), memory still dominates so `servers_final`
stays the same. For compute-tight or batch-friendly configs,
`servers_final` can shift down (or up — depends on regime).

**Added:**
- `core.sizing_math.calc_bs_real(ssim, ncount, servers, bs_max)`:
  `BS_real = min(bs_max, ⌈Ssim/(Ncount·Servers)⌉)`. Edge cases: 0
  servers / 0 sessions → returns 1.
- `SizingOutput`:
  - `BS_real` — converged batch size per instance.
  - `iteration_count` — number of iterations to convergence (typically 2-5; max 10).
  - `th_dec_compute_per_session_at_bs` — diagnostic; per-session compute branch at converged BS.
- 8 unit tests for `calc_bs_real` and the new `calc_Cmodel` v3 form.
- 4 new pipeline assertions in `test_sizing.py::TestFullPipeline` covering
  `BS_real`, `iteration_count`, the per-session vs instance-level th_dec
  branches.

**Changed:**
- `core.sizing_math.calc_Cmodel` signature is now
  `calc_Cmodel(sl_pf_eff, th_pf, Tdec, th_dec_per_session, bs_real=1)`.
  Formula: `BS_real / (SL_pf^eff/Th_pf + T_dec/Th_dec_per_session)`.
  At `bs_real=1` numerically equivalent to the v2 form. First parameter
  is renamed `TS` → `sl_pf_eff`; positional callers unaffected.
- `services.sizing_service.run_sizing()`:
  - Computes `SL_pf` and `SL_pf_eff` *before* the iteration (used in `Cmodel`).
  - Replaces the single-shot servers_comp pass with a fixed-point loop
    over `_iteration_state(servers)` — recomputes `BS_real`,
    `P_effective(BS_real)`, per-session `Th_dec_compute = Th_dec^analyt / BS_real`,
    `Th_dec_mem(BS_real)` (denominator now includes `BS_real·MKV`),
    `Cmodel`, `Th_server_comp`, `Servers_comp` per iteration.
  - Convergence: `|Δ servers| ≤ 1` after iteration ≥ 1; `max(servers, new_servers)`
    on convergence to absorb 1-cycle oscillations near the
    compute↔memory boundary. Max 10 iterations.
- `Cmodel` for `Cmodel_rps` output now uses `SL_pf_eff` (per §7.1) rather than
  `SL` — corrects a v2 inconsistency that was carried into P2 but not
  fully addressed.
- Goldens (3 fixtures) regenerated:
  - `baseline_small`: servers_final 3 → **2** (BS=50, compute now over-supplied).
  - `high_load_enterprise`: servers_final 22 → 22 (memory still dominates; BS=57=S_TP_z).
  - `long_context_compute_bound`: servers_final 37 → **6** (BS=57, single-shot v2 dramatically over-counted).
- `test_sizing.py` `EXCEL_EXPECTED` updated for shifted `Cmodel`,
  `th_decode` (now per-session), `th_server_comp`, `servers_by_compute`.

**Notes:**
- Convergence in 2 iterations on every existing fixture. Loop budget
  set to 10 for safety against oscillation; haven't observed it in the
  current test suite.
- The shift in `long_context_compute_bound` (37 → 6 servers) reflects
  v2's bias toward over-counting in compute-bound regimes when
  per-instance batch parallelism is high.
- `th_decode` semantics changed: now reports per-session at converged
  BS, was instance-level. The instance-level rate is still surfaced as
  `th_dec_compute` for diagnostic purposes.

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
