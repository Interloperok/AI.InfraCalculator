"""Targeted guard-path tests for sizing math branch coverage."""

from __future__ import annotations

import math

from core.sizing_math import (
    calc_Cmodel,
    calc_S_TP,
    calc_generation_time,
    calc_instances_per_server_tp,
    calc_servers_by_compute,
    calc_th_decode_analyt,
    calc_th_decode_mem,
    calc_th_prefill_analyt,
    calc_ttft,
    select_th_decode,
)


def test_calc_s_tp_returns_zero_when_kv_per_session_is_non_positive() -> None:
    assert calc_S_TP(kv_free_gb=128.0, kv_per_session_gb=0.0) == 0


def test_calc_instances_per_server_tp_returns_zero_for_non_positive_total() -> None:
    assert calc_instances_per_server_tp(gpus_per_server=8, gpus_per_instance=0, Z=4) == 0


def test_calc_prefill_returns_zero_when_flops_non_positive() -> None:
    result = calc_th_prefill_analyt(
        Fcount_model_flops=0.0,
        eta_pf=0.2,
        Kbatch=1.0,
        FPS=1_000.0,
        L=32,
        H=4096,
        SL=1024,
    )
    assert result == 0.0


def test_calc_decode_returns_zero_when_flops_non_positive() -> None:
    result = calc_th_decode_analyt(
        Fcount_model_flops=0.0,
        eta_dec=0.15,
        Kbatch=1.0,
        FPS=1_000.0,
        L=32,
        H=4096,
        SL=1024,
        Tdec=512,
    )
    assert result == 0.0


def test_calc_cmodel_returns_zero_when_throughput_non_positive() -> None:
    assert calc_Cmodel(sl_pf_eff=100.0, th_pf=0.0, Tdec=50.0, th_dec_per_session=1.0) == 0.0


def test_calc_cmodel_returns_zero_when_time_per_request_non_positive() -> None:
    assert calc_Cmodel(sl_pf_eff=-1.0, th_pf=1.0, Tdec=0.0, th_dec_per_session=1.0) == 0.0


def test_calc_ttft_returns_inf_for_non_positive_prefill_throughput() -> None:
    assert math.isinf(calc_ttft(sl_pf_eff=100.0, th_pf=0.0, th_dec=10.0))


def test_calc_generation_time_returns_inf_for_non_positive_decode_throughput() -> None:
    assert math.isinf(calc_generation_time(T_out=100.0, th_dec=0.0))


def test_calc_servers_by_compute_returns_inf_for_non_positive_server_throughput() -> None:
    assert math.isinf(calc_servers_by_compute(Ssim=1000.0, R=0.02, KSLA=1.25, th_server_comp=0.0))


# ═══════════════════════════════════════════════════════════════════════
# §6.1 H-7: Memory-bandwidth-bound decode (P1)
# ═══════════════════════════════════════════════════════════════════════


class TestThDecodeMem:
    """calc_th_decode_mem — memory-bandwidth-bound decode formula."""

    def test_returns_zero_when_bw_gpu_is_none(self) -> None:
        assert calc_th_decode_mem(
            bw_gpu_gbs=None,
            eta_mem=0.36,
            params_billions=7,
            b_quant=2,
            mkv_gb=1.83,
        ) == 0.0

    def test_returns_zero_when_bw_gpu_is_zero(self) -> None:
        assert calc_th_decode_mem(
            bw_gpu_gbs=0,
            eta_mem=0.36,
            params_billions=7,
            b_quant=2,
            mkv_gb=1.83,
        ) == 0.0

    def test_a100_pcie_7b_fp16_default_o_fixed(self) -> None:
        """A100 PCIe 80GB (BW=1555), 7B FP16, BS=1, no MoE overhead.

        Numerator = 1555 * 1e9 * 0.36 = 5.598e11
        Denominator = 7 * 1e9 * 2 + 1 * 1.83 * 1024^3 + 0 = 1.4e10 + 1.965e9 = 1.5965e10
        Result ≈ 35.06 tokens/sec
        """
        result = calc_th_decode_mem(
            bw_gpu_gbs=1555,
            eta_mem=0.36,
            params_billions=7,
            b_quant=2,
            mkv_gb=1.83,
            bs_real=1,
            o_fixed_gb=0.0,
        )
        # Hand-computed against formula
        numerator = 1555 * 1e9 * 0.36
        denominator = 7 * 1e9 * 2 + 1 * 1.83 * (1024**3) + 0
        expected = numerator / denominator
        assert result == expected

    def test_o_fixed_lowers_throughput(self) -> None:
        """Adding O_fixed (MoE+FP8 overhead) makes mem-bound stricter."""
        without_overhead = calc_th_decode_mem(
            bw_gpu_gbs=2039, eta_mem=0.36, params_billions=37, b_quant=1,
            mkv_gb=2.0, bs_real=1, o_fixed_gb=0.0,
        )
        with_overhead = calc_th_decode_mem(
            bw_gpu_gbs=2039, eta_mem=0.36, params_billions=37, b_quant=1,
            mkv_gb=2.0, bs_real=1, o_fixed_gb=9.11,
        )
        assert with_overhead < without_overhead

    def test_higher_bw_gives_higher_throughput(self) -> None:
        low = calc_th_decode_mem(bw_gpu_gbs=1555, eta_mem=0.36, params_billions=7,
                                  b_quant=2, mkv_gb=1.83)
        high = calc_th_decode_mem(bw_gpu_gbs=4800, eta_mem=0.36, params_billions=7,
                                   b_quant=2, mkv_gb=1.83)
        assert high > low


class TestSelectThDecode:
    """select_th_decode — min(compute, mem) selector with mode signal."""

    def test_compute_only_when_mem_is_zero(self) -> None:
        value, mode = select_th_decode(th_compute=1990.0, th_mem=0.0)
        assert value == 1990.0
        assert mode == "compute_only"

    def test_memory_only_when_compute_is_zero(self) -> None:
        value, mode = select_th_decode(th_compute=0.0, th_mem=46.0)
        assert value == 46.0
        assert mode == "memory_only"

    def test_picks_compute_when_compute_is_smaller(self) -> None:
        value, mode = select_th_decode(th_compute=20.0, th_mem=100.0)
        assert value == 20.0
        assert mode == "compute"

    def test_picks_memory_when_memory_is_smaller(self) -> None:
        value, mode = select_th_decode(th_compute=2000.0, th_mem=46.0)
        assert value == 46.0
        assert mode == "memory"

    def test_none_when_both_zero(self) -> None:
        value, mode = select_th_decode(th_compute=0.0, th_mem=0.0)
        assert value == 0.0
        assert mode == "none"


# ═══════════════════════════════════════════════════════════════════════
# §7.1: SL_pf and TTFT corrections (P2)
# ═══════════════════════════════════════════════════════════════════════


class TestCalcSLPf:
    """calc_sl_pf — input-only sequence length used for prefill / TTFT."""

    def test_no_reasoning_tokens(self) -> None:
        # SP=800, Prp=150, MRT=0, n_prp=4 → 800 + 4·150 + 3·0 = 1400
        from core.sizing_math import calc_sl_pf
        assert calc_sl_pf(SP=800, Prp=150, MRT=0, dialog_turns=4) == 1400

    def test_with_reasoning_tokens(self) -> None:
        # SP=1000, Prp=200, MRT=4096, n_prp=5 → 1000 + 1000 + 4·4096 = 18384
        from core.sizing_math import calc_sl_pf
        assert calc_sl_pf(SP=1000, Prp=200, MRT=4096, dialog_turns=5) == 18384

    def test_single_turn(self) -> None:
        # n_prp=1 → SP + Prp + 0·MRT = SP + Prp (no previous reasoning)
        from core.sizing_math import calc_sl_pf
        assert calc_sl_pf(SP=500, Prp=100, MRT=2000, dialog_turns=1) == 600

    def test_sl_pf_smaller_than_full_session(self) -> None:
        # SL_pf excludes the answer and last-turn reasoning that haven't been
        # generated yet — so SL_pf < TS for the same inputs.
        from core.sizing_math import calc_session_context_TS, calc_sl_pf
        ts = calc_session_context_TS(SP=1000, Prp=200, MRT=400, A=400, dialog_turns=5)
        sl_pf = calc_sl_pf(SP=1000, Prp=200, MRT=400, dialog_turns=5)
        assert sl_pf < ts


class TestTtftWithOverhead:
    """calc_ttft — P2 signature with T_overhead."""

    def test_overhead_adds_to_ttft(self) -> None:
        from core.sizing_math import calc_ttft
        without = calc_ttft(sl_pf_eff=1000.0, th_pf=2000.0, th_dec=1000.0, t_overhead=0.0)
        with_overhead = calc_ttft(
            sl_pf_eff=1000.0, th_pf=2000.0, th_dec=1000.0, t_overhead=0.026
        )
        assert with_overhead == without + 0.026

    def test_default_overhead_is_zero_for_backwards_compat(self) -> None:
        # calc_ttft(sl_pf_eff, th_pf, th_dec) without t_overhead defaults to 0
        from core.sizing_math import calc_ttft
        assert calc_ttft(sl_pf_eff=100.0, th_pf=1000.0, th_dec=500.0) == 100.0 / 1000.0 + 1.0 / 500.0


# ═══════════════════════════════════════════════════════════════════════
# §6.1: P_effective for MoE accounting (P3)
# ═══════════════════════════════════════════════════════════════════════


class TestCalcPEffective:
    """calc_p_effective — MoE expansion via expert coverage formula."""

    def test_dense_fallback_when_p_moe_zero(self) -> None:
        # P_moe = 0 → returns P_dense regardless of n_experts/k_experts
        from core.sizing_math import calc_p_effective
        assert calc_p_effective(p_dense=7, p_moe=0, n_experts=1, k_experts=1, bs_real=1) == 7

    def test_dense_fallback_when_n_experts_zero(self) -> None:
        from core.sizing_math import calc_p_effective
        assert calc_p_effective(p_dense=13, p_moe=100, n_experts=0, k_experts=1) == 13

    def test_mixtral_8x7b_at_bs_1(self) -> None:
        # Mixtral 8x7B: P_dense ≈ 5, P_moe ≈ 51, k=2, N=8
        # P_eff(1) = 5 + 51 · (2/8) = 5 + 12.75 = 17.75
        from core.sizing_math import calc_p_effective
        result = calc_p_effective(p_dense=5, p_moe=51, n_experts=8, k_experts=2, bs_real=1)
        assert result == 5 + 51 * (1 - (1 - 2 / 8) ** 1)

    def test_deepseek_v3_at_bs_1(self) -> None:
        # DeepSeek-V3: P_dense=14, P_moe=657, k=8, N=256
        # Coverage(1) = 1 - (1 - 8/256)^1 = 8/256 = 0.03125
        # P_eff(1) = 14 + 657 · 0.03125 = 14 + 20.53 = 34.53
        from core.sizing_math import calc_p_effective
        result = calc_p_effective(p_dense=14, p_moe=657, n_experts=256, k_experts=8, bs_real=1)
        assert abs(result - (14 + 657 * 8 / 256)) < 1e-9

    def test_coverage_grows_with_batch(self) -> None:
        # As BS_real grows, coverage approaches 1 (all experts covered)
        from core.sizing_math import calc_p_effective
        bs1 = calc_p_effective(p_dense=5, p_moe=100, n_experts=8, k_experts=2, bs_real=1)
        bs8 = calc_p_effective(p_dense=5, p_moe=100, n_experts=8, k_experts=2, bs_real=8)
        bs64 = calc_p_effective(p_dense=5, p_moe=100, n_experts=8, k_experts=2, bs_real=64)
        assert bs1 < bs8 < bs64
        # At very large BS, P_eff → P_dense + P_moe (full coverage)
        assert bs64 < 5 + 100  # never exceeds the upper bound

    def test_pure_moe_no_dense_layer(self) -> None:
        # Hypothetical: P_dense=0, all in experts.
        from core.sizing_math import calc_p_effective
        assert calc_p_effective(p_dense=0, p_moe=100, n_experts=8, k_experts=1, bs_real=1) == 100 / 8


# ═══════════════════════════════════════════════════════════════════════
# §6.4: BS_real and iterative servers-by-compute (P4)
# ═══════════════════════════════════════════════════════════════════════


class TestCalcBSReal:
    """calc_bs_real — real batch size per instance."""

    def test_basic_division(self) -> None:
        from core.sizing_math import calc_bs_real
        # 400 sessions, 4 instances per server, 2 servers → 50 sessions per instance
        assert calc_bs_real(ssim=400, ncount_per_server=4, servers=2) == 50

    def test_capped_at_bs_max(self) -> None:
        from core.sizing_math import calc_bs_real
        # Without cap: 400 sessions / (4*1) = 100. With cap S_TP_z=62 → 62.
        assert calc_bs_real(ssim=400, ncount_per_server=4, servers=1, bs_max=62) == 62

    def test_minimum_one(self) -> None:
        from core.sizing_math import calc_bs_real
        # 1 session, lots of capacity → BS_real = max(1, ceil(1/...)) = 1
        assert calc_bs_real(ssim=1, ncount_per_server=4, servers=10) == 1

    def test_zero_sessions(self) -> None:
        # Edge case: no users → BS_real = max(1, ceil(0)) = 1
        from core.sizing_math import calc_bs_real
        assert calc_bs_real(ssim=0, ncount_per_server=4, servers=10) == 1

    def test_zero_servers_returns_one(self) -> None:
        # Defensive: pre-iteration state when servers not yet known
        from core.sizing_math import calc_bs_real
        assert calc_bs_real(ssim=400, ncount_per_server=4, servers=0) == 1

    def test_ceiling_rounds_up(self) -> None:
        from core.sizing_math import calc_bs_real
        # 100 / (3*3) = 11.11 → ceil = 12
        assert calc_bs_real(ssim=100, ncount_per_server=3, servers=3) == 12


class TestCmodelV3Form:
    """calc_Cmodel — v3 form. At BS=1, equivalent to v2."""

    def test_bs_one_equals_v2_form(self) -> None:
        from core.sizing_math import calc_Cmodel
        # At BS=1: BS / (sl_pf/th_pf + Tdec/th_dec_per_session) = 1 / time_per_request
        result = calc_Cmodel(sl_pf_eff=2000, th_pf=8563.06, Tdec=400, th_dec_per_session=6402.66, bs_real=1)
        expected = 1.0 / (2000 / 8563.06 + 400 / 6402.66)
        assert abs(result - expected) < 1e-9

    def test_bs_real_scales_throughput(self) -> None:
        from core.sizing_math import calc_Cmodel
        # At higher BS (and lower per-session th_dec), Cmodel grows because
        # batch parallelism amortizes prefill time.
        # th_dec_per_session at BS=57: th_dec_instance / 57 = 6402.66 / 57 = 112.33
        result_bs1 = calc_Cmodel(sl_pf_eff=2000, th_pf=8563.06, Tdec=400, th_dec_per_session=6402.66, bs_real=1)
        result_bs57 = calc_Cmodel(sl_pf_eff=2000, th_pf=8563.06, Tdec=400, th_dec_per_session=112.33, bs_real=57)
        assert result_bs57 > result_bs1


# ═══════════════════════════════════════════════════════════════════════
# §3.2 (MLA branch): KV cache for Multi-Head Latent Attention (P5)
# ═══════════════════════════════════════════════════════════════════════


class TestCalcKVMLA:
    """calc_kv_mla — MLA cache formula (DeepSeek V2/V3/R1)."""

    def test_deepseek_v3_at_4k_context(self) -> None:
        # L=61, SL=4000, kv_lora=512, qk_rope=64, B_state=2 (FP16), EMP=1.0
        # MKV_MLA = 61 * 4000 * (512+64) * 2 * 1.0 / 1024^3
        from core.sizing_math import calc_kv_mla
        result = calc_kv_mla(L=61, SL=4000, kv_lora_rank=512, qk_rope_head_dim=64,
                             bytes_state=2, emp_kv=1.0)
        expected = 61 * 4000 * 576 * 2 / (1024**3)
        assert result == expected

    def test_returns_zero_when_both_dims_zero(self) -> None:
        from core.sizing_math import calc_kv_mla
        assert calc_kv_mla(L=61, SL=4000, kv_lora_rank=0, qk_rope_head_dim=0,
                            bytes_state=2, emp_kv=1.0) == 0.0

    def test_mla_substantially_smaller_than_standard(self) -> None:
        """MLA cache should be much smaller than the H-form for DeepSeek-V3 dims."""
        from core.sizing_math import calc_kv_mla, calc_kv_per_session_gb
        mla = calc_kv_mla(L=61, SL=4000, kv_lora_rank=512, qk_rope_head_dim=64,
                          bytes_state=2, emp_kv=1.0)
        # Standard form using H=7168 for DeepSeek-V3 with N_kv=N_attn=128
        std = calc_kv_per_session_gb(L=61, H=7168, SL=4000, bytes_state=2, emp_kv=1.0,
                                       num_kv_heads=128, num_attention_heads=128)
        assert mla < std
        # The exact ratio depends on architecture; should be ≥ 10× for DeepSeek-style
        assert std / mla >= 10

    def test_no_factor_of_two_for_k_and_v(self) -> None:
        """MLA stores a single latent per token (not 2x for K and V)."""
        from core.sizing_math import calc_kv_mla
        # With kv_lora=576, qk_rope=0, equivalent to single head_dim of 576
        result = calc_kv_mla(L=1, SL=1, kv_lora_rank=576, qk_rope_head_dim=0,
                             bytes_state=1, emp_kv=1.0)
        # Per-token per-layer: 576 bytes (no doubling). 1 layer * 1 token * 576 bytes / 1024^3
        assert result == 576 / (1024**3)

    def test_emp_kv_scales_linearly(self) -> None:
        from core.sizing_math import calc_kv_mla
        base = calc_kv_mla(L=61, SL=1000, kv_lora_rank=512, qk_rope_head_dim=64,
                            bytes_state=2, emp_kv=1.0)
        with_pad = calc_kv_mla(L=61, SL=1000, kv_lora_rank=512, qk_rope_head_dim=64,
                                bytes_state=2, emp_kv=1.2)
        assert abs(with_pad - base * 1.2) < 1e-9
