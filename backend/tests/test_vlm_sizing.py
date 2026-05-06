"""P9a — VLM single-pass online sizing (Приложение И.4.1) integration tests."""

from __future__ import annotations

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from errors import ValidationAppError
from models import VLMSizingInput
from services.vlm_sizing_service import run_vlm_sizing


# ── Baseline VLM payload: 7B Qwen2.5-VL-class on H100 80GB ──
BASELINE_VLM = dict(
    lambda_online=1.0,
    c_peak=4,
    sla_page=5.0,
    w_px=1240,  # A4 @ 150 dpi
    h_px=1754,
    patch_eff=28,
    n_ch=1,
    n_prompt_txt=100,
    n_fields=20,
    tok_field=50,
    params_billions=7,
    bytes_per_param=2,
    layers_L=32,
    hidden_size_H=4096,
    num_kv_heads=32,
    num_attention_heads=32,
    bytes_per_kv_state=2,
    max_context_window_TSmax=32768,
    gpu_mem_gb=80,
    gpus_per_server=8,
    tp_multiplier_Z=1,
    gpu_flops_Fcount=312,  # H100 BF16 dense (TFLOPS)
)


class TestVLMSizingTokenProfile:
    """End-to-end token-profile values."""

    def test_v_tok_a4_at_150dpi(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        # 1240×1754 / 28² = 2774.18 → ⌈⌉ = 2775
        assert result.v_tok == 2775

    def test_sl_pf_vlm_includes_text_prompt(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.sl_pf_vlm == result.v_tok + BASELINE_VLM["n_prompt_txt"]

    def test_sl_dec_vlm_n_fields_times_tok_field(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.sl_dec_vlm == BASELINE_VLM["n_fields"] * BASELINE_VLM["tok_field"]

    def test_eta_cache_zero_keeps_eff_equal_pf(self):
        # Default eta_cache_vlm=0 → SL_pf_eff = SL_pf
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.sl_pf_vlm_eff == float(result.sl_pf_vlm)


class TestVLMSizingMemory:
    """Memory accounting (§3.1, §3.2)."""

    def test_kv_uses_full_session_length(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        # KV-cache size scales with sl_total = SL_pf + SL_dec
        # 32×4096×3775×2×1×(32/32) / 1024³ ≈ 1.84 GiB (close — small rounding)
        assert 1.5 < result.kv_per_session_gb < 2.5

    def test_model_mem_includes_safe_margin(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        # 7×10⁹×2 / 1024³ ≈ 13.04 GiB; + SM 5 = 18.04 GiB
        assert 17.5 < result.model_mem_gb < 18.5


class TestVLMSizingBSRealStar:
    """И.4.1 — BS_real* search."""

    def test_default_workload_finds_valid_bs(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.sla_pass is True
        assert result.bs_real_star >= 1
        assert result.t_page_vlm <= BASELINE_VLM["sla_page"]

    def test_strict_sla_reduces_bs_real(self):
        # Tight SLA → fewer concurrent pages survive
        loose = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        data = {**BASELINE_VLM, "sla_page": 3.0}
        strict = run_vlm_sizing(VLMSizingInput(**data))
        assert strict.bs_real_star <= loose.bs_real_star

    def test_unsatisfiable_sla_marks_failure(self):
        # SLA too tight to satisfy at any BS
        data = {**BASELINE_VLM, "sla_page": 0.05}
        result = run_vlm_sizing(VLMSizingInput(**data))
        assert result.sla_pass is False
        assert result.t_page_vlm > 0.05

    def test_higher_sla_grows_bs_real(self):
        # Loose SLA → more concurrent pages can fit
        baseline = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        data = {**BASELINE_VLM, "sla_page": 30.0}
        loose = run_vlm_sizing(VLMSizingInput(**data))
        assert loose.bs_real_star >= baseline.bs_real_star


class TestVLMSizingReplicas:
    """И.4.1 — replicas, GPU and server count."""

    def test_n_repl_ceiling_of_c_peak_over_bs(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        if result.sla_pass:
            assert result.n_repl_vlm == math.ceil(
                BASELINE_VLM["c_peak"] / result.bs_real_star
            )

    def test_n_gpu_includes_tp_factor(self):
        # TP=2 doubles GPUs per replica
        data = {**BASELINE_VLM, "tp_multiplier_Z": 2}
        result = run_vlm_sizing(VLMSizingInput(**data))
        assert result.n_gpu_vlm_online == result.n_repl_vlm * 2 * result.gpus_per_instance

    def test_higher_c_peak_grows_replicas(self):
        small = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        data = {**BASELINE_VLM, "c_peak": 32}
        big = run_vlm_sizing(VLMSizingInput(**data))
        if small.sla_pass and big.sla_pass:
            assert big.n_repl_vlm >= small.n_repl_vlm

    def test_n_servers_ceiling_of_gpu_per_server(self):
        data = {**BASELINE_VLM, "c_peak": 100}
        result = run_vlm_sizing(VLMSizingInput(**data))
        expected = math.ceil(result.n_gpu_vlm_online / BASELINE_VLM["gpus_per_server"])
        assert result.n_servers_vlm_online == expected


class TestVLMSizingErrors:
    """Validation paths."""

    def test_huge_image_kv_overflow_raises(self):
        # Document way too big for KV — exhausts memory before s_tp_z>0
        data = {
            **BASELINE_VLM,
            "w_px": 8000,
            "h_px": 8000,
            "patch_eff": 14,  # smaller patches → way more visual tokens
            "max_context_window_TSmax": 200000,
            "gpu_mem_gb": 24,  # smaller GPU
            "params_billions": 7,
        }
        with pytest.raises(ValidationAppError):
            run_vlm_sizing(VLMSizingInput(**data))


class TestVLMSizingEchoes:
    """Output echo fields."""

    def test_eta_vlm_pf_echo(self):
        data = {**BASELINE_VLM, "eta_vlm_pf": 0.12}
        result = run_vlm_sizing(VLMSizingInput(**data))
        assert result.eta_vlm_pf_used == 0.12

    def test_c_peak_lambda_echoed(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.c_peak_used == BASELINE_VLM["c_peak"]
        assert result.lambda_online_used == BASELINE_VLM["lambda_online"]

    def test_sla_page_echo(self):
        result = run_vlm_sizing(VLMSizingInput(**BASELINE_VLM))
        assert result.sla_page_target == BASELINE_VLM["sla_page"]
