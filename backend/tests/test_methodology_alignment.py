"""Tests for the methodology 1.7 alignment (context model, d_attn, §6.4 statuses, §7, §9)."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.workload import calc_d_attn, normalize_context  # noqa: E402
from errors import ValidationAppError  # noqa: E402
from models.sizing import SizingInput  # noqa: E402
from services.sizing_service import run_sizing  # noqa: E402
from tests.test_sizing import EXCEL_INPUT  # noqa: E402


class TestContextModel:
    def test_basic_chat(self):
        c = normalize_context(SP=1000, Prp=200, MRT=0, A=400, n_prp=5, ts_max=32768)
        assert c.sl_pf_raw == 1000 + 5 * 200 + 4 * 400
        assert c.t_dec == 400
        assert c.ts == 4000
        assert c.sl == 4000
        assert not c.truncated

    def test_reasoning_not_in_history_by_default(self):
        c = normalize_context(SP=1000, Prp=200, MRT=4096, A=400, n_prp=5, ts_max=131072)
        assert c.sl_pf == 3600
        assert c.t_dec == 4496
        assert c.ts == 8096

    def test_reasoning_in_history(self):
        c = normalize_context(
            SP=1000, Prp=200, MRT=4096, A=400, n_prp=5, ts_max=131072, reasoning_in_history=True
        )
        # Legacy (2.2) form SP + N·(Prp + A + MRT) is recovered with h_reason = 1
        assert c.ts == 1000 + 5 * (200 + 400 + 4096)

    def test_agentic_methodology_example_2(self):
        # Appendix В.7, example 2: SP_eff=2500, m=15, Prp_eff=1200, A_eff=550, MRT=4096
        c = normalize_context(
            SP=1000,
            Prp=200,
            MRT=4096,
            A=400,
            n_prp=3,
            ts_max=131072,
            k_calls=5,
            sp_tools=1500,
            c_rag_dynamic=1000,
            a_tool=150,
        )
        assert c.ts == 32846
        assert c.t_dec == 550 + 4096
        c1 = normalize_context(
            SP=1000,
            Prp=200,
            MRT=4096,
            A=400,
            n_prp=3,
            ts_max=131072,
            k_calls=5,
            sp_tools=1500,
            c_rag_dynamic=1000,
            a_tool=150,
            reasoning_in_history=True,
        )
        assert c1.ts == 90190

    def test_window_applied_to_input(self):
        c = normalize_context(SP=1000, Prp=200, MRT=0, A=400, n_prp=5, ts_max=2000)
        assert c.sl_pf == 1600
        assert c.sl == 2000
        assert c.truncated

    def test_generation_exceeding_window_is_error(self):
        with pytest.raises(ValidationAppError):
            normalize_context(SP=10, Prp=10, MRT=4000, A=200, n_prp=1, ts_max=4096)

    def test_prefix_cache_only_affects_token_count(self):
        c = normalize_context(SP=1000, Prp=200, MRT=0, A=400, n_prp=5, ts_max=32768, eta_cache=0.5)
        assert c.sl_pf == 3600
        assert c.sl_pf_eff == 1800


class TestAttentionWidth:
    def test_gqa_uses_query_heads(self):
        # Llama-3-70B-like: H=8192, 64 query heads × 128
        assert calc_d_attn(hidden_size=8192, num_attention_heads=64, head_dim=128) == (8192, 8192)

    def test_head_dim_differs_from_hidden(self):
        # Qwen3-32B-like: H=5120, 64 heads × 128 = 8192
        assert calc_d_attn(hidden_size=5120, num_attention_heads=64, head_dim=128) == (8192, 8192)

    def test_mla_deepseek_v3(self):
        pf, dec = calc_d_attn(
            hidden_size=7168,
            num_attention_heads=128,
            head_dim=192,
            kv_lora_rank=512,
            qk_rope_head_dim=64,
        )
        assert pf == 20480
        assert dec == 69632


class TestPipeline:
    def test_single_final_state_and_status(self):
        r = run_sizing(SizingInput(**EXCEL_INPUT))
        assert r.iteration_status == "converged"
        assert r.servers_final == max(r.servers_by_memory, r.servers_by_compute)
        assert r.servers_trajectory[0] == r.servers_by_memory
        # e2e_load is computed at the final BS and never below the BS = 1 bound
        assert r.e2e_latency_load >= r.e2e_latency_analyt
        assert r.e2e_latency_for_sla == r.e2e_latency_load
        assert r.ttft_bs1 <= r.ttft_analyt
        assert r.rho_pf is not None and r.rho_pf > 0

    def test_tdec_includes_tool_tokens(self):
        r = run_sizing(SizingInput(**{**EXCEL_INPUT, "a_tool": 150, "k_calls": 3}))
        assert r.Tdec_tokens == 550

    def test_quotas_scale_with_k_calls(self):
        base = run_sizing(SizingInput(**EXCEL_INPUT))
        agent = run_sizing(SizingInput(**{**EXCEL_INPUT, "k_calls": 3}))
        assert agent.peak_rpm == pytest.approx(3 * base.peak_rpm)
        assert agent.peak_tpm_output == pytest.approx(agent.peak_rpm * agent.Tdec_tokens)
        assert agent.peak_tpm_input == pytest.approx(agent.peak_rpm * agent.SL_pf_input_length)

    def test_sla_checked_at_final_batch(self):
        r = run_sizing(SizingInput(**{**EXCEL_INPUT, "ttft_sla": 1.01, "e2e_latency_sla": 100, "sla_fit_servers": False}))
        # TTFT(BS*) > 1.01 ≥ TTFT(1): SLA must use the loaded value
        assert r.ttft_bs1 <= 1.01 < r.ttft_analyt
        assert r.ttft_sla_pass is False
        assert r.sla_passed is False


class TestReportPrecheck:
    @pytest.mark.parametrize(
        "override",
        [{"pp_degree": 2}, {"ep_degree": 2}, {"eta_tp": 0.9}, {"use_pd_disagg": True}],
    )
    def test_unsupported_features_rejected(self, override):
        from fastapi import HTTPException

        from api.sizing_handlers import _report_precheck

        with pytest.raises(HTTPException) as exc:
            _report_precheck(SizingInput(**{**EXCEL_INPUT, **override}))
        assert exc.value.status_code in (400, 422)

    def test_supported_workload_passes(self):
        from api.sizing_handlers import _report_precheck

        _report_precheck(SizingInput(**EXCEL_INPUT))
