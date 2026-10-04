"""Модель сессия / запрос / вызов (методика §6.4, §7.3, §8; Прил. В.3, В.4.3).

Профиль — агентный кредитный анализ МСБ (Qwen3-235B FP8, H100, K_calls = 6), из
каталога аналитической модели ai-standards/_model.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models.sizing import SizingInput  # noqa: E402
from services.sizing_service import run_sizing  # noqa: E402

AGENT = {
    "model_name": "Qwen3-235B-A22B-Instruct-2507",
    "params_billions": 235,
    "params_active": 22,
    "layers_L": 94,
    "hidden_size_H": 4096,
    "num_attention_heads": 64,
    "num_kv_heads": 4,
    "head_dim": 128,
    "max_context_window_TSmax": 262144,
    "k_experts": 8,
    "n_experts": 128,
    "bytes_per_param": 1,
    "quantization": "FP8",
    "bytes_per_kv_state": 2,
    "tp_multiplier_Z": 1,
    "gpu_id": "nvidia-h100-gpu-accelerator-sxm-card",
    "gpu_name": "NVIDIA H100 SXM",
    "gpu_mem_gb": 80,
    "gpu_flops_Fcount": 989.4,
    "bw_gpu_gbs": 3352,
    "gpus_per_server": 8,
    "sla_reserve_KSLA": 1.25,
    "internal_users": 250,
    "penetration_internal": 0.9,
    "concurrency_internal": 0.3,
    "sessions_per_user_J": 1,
    "system_prompt_tokens_SP": 2500,
    "user_prompt_tokens_Prp": 400,
    "answer_tokens_A": 600,
    "reasoning_tokens_MRT": 1500,
    "dialog_turns": 1,
    "k_calls": 6,
    "sp_tools": 1500,
    "c_rag_dynamic": 6000,
    "a_tool": 150,
    "eta_cache": 0.5,
    "rps_per_session_R": 0.0006,
    "e2e_latency_sla": 90.0
}


def _run(**kw):
    return run_sizing(SizingInput(**{**AGENT, **kw}))


def test_consistent_profile_q_below_one():
    r = _run()
    assert r.servers_final == 5 and r.session_consistent is True
    assert r.session_load_q == pytest.approx(0.0006 * 6 * 1.25 * r.e2e_latency_load, rel=1e-3)


@pytest.mark.parametrize("R, servers", [(0.002, 21), (0.004, 66)])
def test_inconsistent_input_flagged(R, servers):
    r = _run(rps_per_session_R=R)
    assert r.iteration_status == "converged" and r.servers_final == servers
    assert r.session_consistent is False and r.sizing_status == "input_inconsistent"


def test_request_scope_latency():
    r = _run(e2e_sla_scope="request")
    assert r.e2e_latency_request == pytest.approx(6 * r.e2e_latency_load, rel=1e-6)
    assert r.sla_passed is False


def test_sla_fit_servers_call_scope():
    r = _run(sla_fit_servers=True)
    assert r.sla_fit_status == "fitted" and r.servers_before_sla_fit == 5
    assert r.servers_final == 17 and r.BS_real == 2 and r.sla_passed is True


def test_sla_fit_unreachable_request_scope():
    r = _run(sla_fit_servers=True, e2e_sla_scope="request")
    assert r.sla_fit_status == "unreachable" and r.sizing_status == "sla_unreachable"
    assert r.servers_final == 5


def test_sla_fit_disabled_by_default():
    r = _run()
    assert r.sla_fit_status == "disabled" and r.sla_passed is False


def test_parallel_branches_scale_sessions():
    base, par = _run(), _run(parallel_branches_P=5)
    assert par.Ssim_concurrent_sessions == pytest.approx(5 * base.Ssim_concurrent_sessions)
    assert par.servers_by_memory >= base.servers_by_memory
