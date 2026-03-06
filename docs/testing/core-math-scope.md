# Core Math Scope

This document defines the critical GPU-sizing math scope used for strict coverage targets.

## In Scope (core math)
- `./backend/core/sizing_math.py`

## Functions In Scope
- `calc_Ssim`
- `calc_T`
- `calc_model_mem_gb`
- `calc_session_context_TS`
- `calc_SL`
- `calc_kv_per_session_gb`
- `calc_gpus_per_instance`
- `calc_instances_per_server`
- `calc_kv_free_per_instance_gb`
- `calc_S_TP`
- `calc_Kbatch`
- `calc_instances_per_server_tp`
- `calc_sessions_per_server`
- `calc_servers_by_memory`
- `calc_FPS`
- `calc_Tdec`
- `calc_th_prefill_analyt`
- `calc_th_decode_analyt`
- `calc_Cmodel`
- `calc_th_server_comp`
- `calc_ttft`
- `calc_generation_time`
- `calc_e2e_latency`
- `calc_servers_by_compute`

## Out of Scope (non-core)
- API transport, request routing, and HTTP exception mapping in `./backend/main.py`
- GPU catalog I/O (`gpu_data.json`, scraper/normalizer)
- report generation and scheduler logic

## Coverage Intent
- Core math module is the target for elevated thresholds in later milestones:
  - line coverage >= 95%
  - branch coverage >= 90%
