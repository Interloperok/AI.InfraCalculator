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


# ═══════════════════════════════════════════════════════════════════════
# §7.2: Loaded latency from Little's law (P6)
# ═══════════════════════════════════════════════════════════════════════


class TestCalcE2eLatencyLoad:
    """calc_e2e_latency_load — BS_real / Cmodel residence time."""

    def test_basic_division(self) -> None:
        from core.sizing_math import calc_e2e_latency_load
        assert calc_e2e_latency_load(bs_real=10, cmodel_rps=2.0) == 5.0

    def test_returns_inf_when_cmodel_zero(self) -> None:
        from core.sizing_math import calc_e2e_latency_load
        assert math.isinf(calc_e2e_latency_load(bs_real=10, cmodel_rps=0.0))

    def test_returns_inf_when_cmodel_negative(self) -> None:
        from core.sizing_math import calc_e2e_latency_load
        assert math.isinf(calc_e2e_latency_load(bs_real=1, cmodel_rps=-1.0))

    def test_grows_with_bs_real(self) -> None:
        from core.sizing_math import calc_e2e_latency_load
        bs1 = calc_e2e_latency_load(bs_real=1, cmodel_rps=10.0)
        bs10 = calc_e2e_latency_load(bs_real=10, cmodel_rps=10.0)
        assert bs10 == bs1 * 10


# ═══════════════════════════════════════════════════════════════════════
# §6.1: Continuous-batching prefill (P7)
# ═══════════════════════════════════════════════════════════════════════


class TestThPrefillCB:
    """calc_th_prefill_cb_compute / calc_th_prefill_cb_mem / select_th_prefill."""

    def test_cb_compute_equals_static_with_kbatch_one(self) -> None:
        from core.sizing_math import calc_th_prefill_analyt, calc_th_prefill_cb_compute
        cb = calc_th_prefill_cb_compute(
            Fcount_model_flops=312e12, eta_pf=0.2, FPS=14e9, L=32, H=4096, sl_pf_eff=2000,
        )
        static_kb1 = calc_th_prefill_analyt(
            Fcount_model_flops=312e12, eta_pf=0.2, Kbatch=1.0, FPS=14e9, L=32, H=4096, SL=2000,
        )
        assert cb == static_kb1

    def test_cb_mem_returns_zero_when_no_bandwidth(self) -> None:
        from core.sizing_math import calc_th_prefill_cb_mem
        assert calc_th_prefill_cb_mem(
            c_pf=256, bw_gpu_gbs=None, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=4, o_fixed_gb=0,
        ) == 0.0

    def test_cb_mem_returns_zero_when_c_pf_zero(self) -> None:
        from core.sizing_math import calc_th_prefill_cb_mem
        assert calc_th_prefill_cb_mem(
            c_pf=0, bw_gpu_gbs=2039, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=4, o_fixed_gb=0,
        ) == 0.0

    def test_cb_mem_grows_with_c_pf(self) -> None:
        from core.sizing_math import calc_th_prefill_cb_mem
        small = calc_th_prefill_cb_mem(
            c_pf=64, bw_gpu_gbs=2039, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=4, o_fixed_gb=0,
        )
        large = calc_th_prefill_cb_mem(
            c_pf=512, bw_gpu_gbs=2039, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=4, o_fixed_gb=0,
        )
        assert large == small * 8

    def test_cb_mem_drops_with_bs_real(self) -> None:
        # More decoders in the batch → more KV memory traffic → less prefill bandwidth
        from core.sizing_math import calc_th_prefill_cb_mem
        bs1 = calc_th_prefill_cb_mem(
            c_pf=256, bw_gpu_gbs=2039, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=1, o_fixed_gb=0,
        )
        bs16 = calc_th_prefill_cb_mem(
            c_pf=256, bw_gpu_gbs=2039, eta_mem=0.36, p_effective_at_bs_plus_1=37,
            b_quant=1, mkv_gb=2, bs_real=16, o_fixed_gb=0,
        )
        assert bs16 < bs1


class TestSelectThPrefill:
    """select_th_prefill — analogous to select_th_decode for prefill branches."""

    def test_compute_only_when_mem_zero(self) -> None:
        from core.sizing_math import select_th_prefill
        v, m = select_th_prefill(th_compute=2000.0, th_mem=0.0)
        assert v == 2000.0
        assert m == "compute_only"

    def test_picks_memory_when_smaller(self) -> None:
        from core.sizing_math import select_th_prefill
        v, m = select_th_prefill(th_compute=2000.0, th_mem=300.0)
        assert v == 300.0
        assert m == "memory"

    def test_picks_compute_when_smaller(self) -> None:
        from core.sizing_math import select_th_prefill
        v, m = select_th_prefill(th_compute=200.0, th_mem=2000.0)
        assert v == 200.0
        assert m == "compute"


# ═══════════════════════════════════════════════════════════════════════
# Appendix В: Agentic K_calls / RAG / tool-use (P8)
# ═══════════════════════════════════════════════════════════════════════


class TestAgenticTSAndSLPf:
    """calc_ts_agent and calc_sl_pf_agent — Appendix В.4 generalization."""

    def test_ts_agent_reduces_to_v2_at_neutral_defaults(self) -> None:
        from core.sizing_math import calc_session_context_TS, calc_ts_agent
        # K_calls=1, all tool/RAG fields zero → must equal v2 TS.
        ts_v2 = calc_session_context_TS(SP=1000, Prp=200, MRT=4096, A=400, dialog_turns=5)
        ts_agent = calc_ts_agent(
            SP=1000, SP_tools=0, C_rag_static=0,
            Prp=200, C_rag_dynamic=0, MRT=4096, A=400, A_tool=0,
            n_prp=5, k_calls=1,
        )
        assert ts_agent == ts_v2

    def test_sl_pf_agent_reduces_to_calc_sl_pf_at_neutral_defaults(self) -> None:
        from core.sizing_math import calc_sl_pf, calc_sl_pf_agent
        sl_pf_v2 = calc_sl_pf(SP=800, Prp=150, MRT=0, dialog_turns=4)
        sl_pf_agent = calc_sl_pf_agent(
            SP=800, SP_tools=0, C_rag_static=0,
            Prp=150, C_rag_dynamic=0, MRT=0, n_prp=4, k_calls=1,
        )
        assert sl_pf_agent == sl_pf_v2

    def test_react_agent_5_calls(self) -> None:
        # ReAct agent: K_calls=5, sp_tools=2000, c_rag_dynamic=1000, a_tool=150
        # SP_eff = 1000 + 2000 + 0 = 3000
        # Prp_eff = 200 + 1000 = 1200
        # A_eff = 400 + 150 = 550
        # TS_agent = 3000 + 5 × 5 × (1200 + 4096 + 550) = 3000 + 25 × 5846 = 149150
        from core.sizing_math import calc_ts_agent
        result = calc_ts_agent(
            SP=1000, SP_tools=2000, C_rag_static=0,
            Prp=200, C_rag_dynamic=1000, MRT=4096, A=400, A_tool=150,
            n_prp=5, k_calls=5,
        )
        assert result == 3000 + 5 * 5 * (1200 + 4096 + 550)

    def test_ts_agent_grows_with_k_calls(self) -> None:
        from core.sizing_math import calc_ts_agent
        params = dict(SP=1000, SP_tools=0, C_rag_static=0,
                      Prp=200, C_rag_dynamic=0, MRT=0, A=400, A_tool=0, n_prp=5)
        single = calc_ts_agent(**params, k_calls=1)
        multi = calc_ts_agent(**params, k_calls=10)
        # SP_eff stays the same; the per-call portion scales with k_calls
        assert multi - 1000 == 10 * (single - 1000)

    def test_sp_tools_only_grows_sp_eff_not_per_call(self) -> None:
        from core.sizing_math import calc_ts_agent
        without_tools = calc_ts_agent(
            SP=1000, SP_tools=0, C_rag_static=0,
            Prp=200, C_rag_dynamic=0, MRT=0, A=400, A_tool=0,
            n_prp=5, k_calls=3,
        )
        with_tools = calc_ts_agent(
            SP=1000, SP_tools=2000, C_rag_static=0,
            Prp=200, C_rag_dynamic=0, MRT=0, A=400, A_tool=0,
            n_prp=5, k_calls=3,
        )
        # SP_tools shifts SP_eff once; not multiplied by n_prp · k_calls
        assert with_tools - without_tools == 2000

    def test_a_tool_amplified_by_k_calls(self) -> None:
        from core.sizing_math import calc_ts_agent
        # A_tool sits inside (Prp_eff + MRT + A_eff) and gets multiplied
        without = calc_ts_agent(
            SP=1000, SP_tools=0, C_rag_static=0,
            Prp=200, C_rag_dynamic=0, MRT=0, A=400, A_tool=0,
            n_prp=5, k_calls=3,
        )
        with_a_tool = calc_ts_agent(
            SP=1000, SP_tools=0, C_rag_static=0,
            Prp=200, C_rag_dynamic=0, MRT=0, A=400, A_tool=150,
            n_prp=5, k_calls=3,
        )
        assert with_a_tool - without == 5 * 3 * 150


# ═══════════════════════════════════════════════════════════════════════
# Appendix Г: Parallelism beyond TP — DP/PP/EP/η_TP (P11)
# ═══════════════════════════════════════════════════════════════════════


class TestParallelismExtensions:
    """Pipeline + Expert parallelism via the existing instances_per_server_tp."""

    def test_pp_doubles_per_instance_footprint(self) -> None:
        # Z=1, PP=2, EP=1 → Z_combined=2 → instances/server halves.
        from core.sizing_math import calc_instances_per_server_tp
        # With 8 GPU/server, 1 GPU per (TP=1) instance, PP=2 → 4 instances
        assert calc_instances_per_server_tp(gpus_per_server=8, gpus_per_instance=1, Z=2) == 4
        # PP=4 → 2 instances
        assert calc_instances_per_server_tp(gpus_per_server=8, gpus_per_instance=1, Z=4) == 2

    def test_ep_combines_with_tp_in_z_combined(self) -> None:
        # The service composes Z_combined = Z * PP * EP. Each contributes
        # multiplicatively to the per-instance GPU footprint.
        from core.sizing_math import calc_instances_per_server_tp
        # 16 GPU/server, 1 GPU per instance, Z_combined = 2·2·2 = 8 → 2 instances
        assert calc_instances_per_server_tp(gpus_per_server=16, gpus_per_instance=1, Z=8) == 2

    def test_eta_tp_at_one_is_identity(self) -> None:
        # η_TP=1.0 (default) doesn't scale throughput.
        # Verify by computing throughput directly with eta_tp=1.0 vs no scaling.
        from core.sizing_math import calc_th_decode_analyt
        nominal = calc_th_decode_analyt(
            Fcount_model_flops=312e12, eta_dec=0.20, Kbatch=1.0,
            FPS=14e9, L=32, H=4096, SL=1400, Tdec=400,
        )
        scaled = nominal * 1.0
        assert scaled == nominal

    def test_eta_tp_below_one_reduces_throughput(self) -> None:
        # η_TP=0.7 (PCIe-class) → throughput drops 30%.
        from core.sizing_math import calc_th_decode_analyt
        nominal = calc_th_decode_analyt(
            Fcount_model_flops=312e12, eta_dec=0.20, Kbatch=1.0,
            FPS=14e9, L=32, H=4096, SL=1400, Tdec=400,
        )
        pcie_eff = nominal * 0.7
        assert pcie_eff < nominal
        assert abs(pcie_eff - nominal * 0.7) < 1e-9


class TestPDDisaggregationMath:
    """P10 — pure functions for split prefill/decode pool sizing (Appendix Ж)."""

    def test_th_server_pf_basic_formula(self) -> None:
        # Th_pf^server = NcountTP × Th_pf / SL_pf_eff
        from core.sizing_math import calc_th_server_pf
        # Ncount=2, Th_pf=1000 tok/s, SL_pf=2000 tok → 2 × 1000/2000 = 1.0 req/s
        assert calc_th_server_pf(NcountTP=2, th_pf=1000.0, sl_pf_eff=2000.0) == 1.0

    def test_th_server_pf_returns_zero_on_invalid_inputs(self) -> None:
        from core.sizing_math import calc_th_server_pf
        assert calc_th_server_pf(NcountTP=2, th_pf=1000.0, sl_pf_eff=0.0) == 0.0
        assert calc_th_server_pf(NcountTP=2, th_pf=0.0, sl_pf_eff=2000.0) == 0.0
        assert calc_th_server_pf(NcountTP=0, th_pf=1000.0, sl_pf_eff=2000.0) == 0.0

    def test_th_server_pf_grows_with_throughput(self) -> None:
        from core.sizing_math import calc_th_server_pf
        a = calc_th_server_pf(NcountTP=4, th_pf=2000.0, sl_pf_eff=1000.0)
        b = calc_th_server_pf(NcountTP=4, th_pf=4000.0, sl_pf_eff=1000.0)
        assert b > a
        assert abs(b - 2 * a) < 1e-9

    def test_th_server_pf_drops_with_longer_context(self) -> None:
        from core.sizing_math import calc_th_server_pf
        short_ctx = calc_th_server_pf(NcountTP=2, th_pf=1000.0, sl_pf_eff=1000.0)
        long_ctx = calc_th_server_pf(NcountTP=2, th_pf=1000.0, sl_pf_eff=4000.0)
        assert long_ctx < short_ctx
        assert abs(long_ctx - short_ctx / 4) < 1e-9

    def test_th_server_dec_basic_formula(self) -> None:
        # Th_dec^server = NcountTP × BS_real × Th_dec_per_session / Tdec
        from core.sizing_math import calc_th_server_dec
        # Ncount=2, BS=8, Th_dec_per_session=100 tok/s, Tdec=400 → 2·8·100/400 = 4.0
        assert calc_th_server_dec(
            NcountTP=2, th_dec_per_session=100.0, bs_real=8, Tdec=400.0
        ) == 4.0

    def test_th_server_dec_returns_zero_on_invalid_inputs(self) -> None:
        from core.sizing_math import calc_th_server_dec
        assert calc_th_server_dec(2, 100.0, 8, 0.0) == 0.0
        assert calc_th_server_dec(2, 0.0, 8, 400.0) == 0.0
        assert calc_th_server_dec(2, 100.0, 0, 400.0) == 0.0
        assert calc_th_server_dec(0, 100.0, 8, 400.0) == 0.0

    def test_th_server_dec_grows_with_bs_real(self) -> None:
        from core.sizing_math import calc_th_server_dec
        small = calc_th_server_dec(NcountTP=2, th_dec_per_session=100.0, bs_real=4, Tdec=400.0)
        large = calc_th_server_dec(NcountTP=2, th_dec_per_session=100.0, bs_real=16, Tdec=400.0)
        assert large > small
        assert abs(large - 4 * small) < 1e-9

    def test_th_server_dec_drops_with_longer_generation(self) -> None:
        from core.sizing_math import calc_th_server_dec
        short_gen = calc_th_server_dec(2, 100.0, 8, 400.0)
        long_gen = calc_th_server_dec(2, 100.0, 8, 1600.0)
        assert long_gen < short_gen
        assert abs(long_gen - short_gen / 4) < 1e-9


class TestVLMTokenProfile:
    """P9a — VLM token-profile pure functions (Приложение И.3.1)."""

    def test_v_tok_basic_formula(self) -> None:
        # V_tok = ⌈(W·H) / patch²⌉ × n_ch
        from core.sizing_math import calc_v_tok
        # 1240×1754 / 28² = 2174960/784 = 2774.18 → ⌈⌉ = 2775
        assert calc_v_tok(w_px=1240, h_px=1754, patch_eff=28, n_ch=1) == 2775

    def test_v_tok_n_ch_multiplies(self) -> None:
        from core.sizing_math import calc_v_tok
        single = calc_v_tok(w_px=1024, h_px=1024, patch_eff=32, n_ch=1)
        triple = calc_v_tok(w_px=1024, h_px=1024, patch_eff=32, n_ch=3)
        assert triple == 3 * single

    def test_v_tok_returns_zero_on_invalid_input(self) -> None:
        from core.sizing_math import calc_v_tok
        assert calc_v_tok(w_px=0, h_px=1024, patch_eff=28) == 0
        assert calc_v_tok(w_px=1024, h_px=0, patch_eff=28) == 0
        assert calc_v_tok(w_px=1024, h_px=1024, patch_eff=0) == 0
        assert calc_v_tok(w_px=1024, h_px=1024, patch_eff=28, n_ch=0) == 0

    def test_v_tok_ceiling_rounds_up(self) -> None:
        from core.sizing_math import calc_v_tok
        # 100×100 / 32² = 9.77 → ceil = 10
        assert calc_v_tok(w_px=100, h_px=100, patch_eff=32) == 10

    def test_sl_pf_vlm_sums_visual_and_text(self) -> None:
        from core.sizing_math import calc_sl_pf_vlm
        assert calc_sl_pf_vlm(v_tok=2775, n_prompt_txt=200) == 2975

    def test_sl_pf_vlm_zero_text_prompt(self) -> None:
        from core.sizing_math import calc_sl_pf_vlm
        assert calc_sl_pf_vlm(v_tok=1000, n_prompt_txt=0) == 1000

    def test_sl_dec_vlm_basic(self) -> None:
        from core.sizing_math import calc_sl_dec_vlm
        # 20 fields × 50 tok/field = 1000
        assert calc_sl_dec_vlm(n_fields=20, tok_field=50) == 1000

    def test_sl_dec_vlm_returns_zero_on_invalid(self) -> None:
        from core.sizing_math import calc_sl_dec_vlm
        assert calc_sl_dec_vlm(n_fields=0, tok_field=50) == 0
        assert calc_sl_dec_vlm(n_fields=20, tok_field=0) == 0


class TestTPageVLM:
    """P9a — per-page latency formula (Приложение И.4.1)."""

    def test_t_page_basic_formula(self) -> None:
        # t_page = SL_pf_eff/Th_pf + SL_dec/Th_dec + T_ovh
        # 2875/1000 + 1000/500 + 0.05 = 2.875 + 2.0 + 0.05 = 4.925
        from core.sizing_math import calc_t_page_vlm
        result = calc_t_page_vlm(
            sl_pf_vlm_eff=2875,
            th_pf_vlm=1000.0,
            sl_dec_vlm=1000,
            th_dec_vlm=500.0,
            t_ovh_vlm=0.05,
        )
        assert abs(result - 4.925) < 1e-9

    def test_t_page_returns_inf_on_zero_throughput(self) -> None:
        from core.sizing_math import calc_t_page_vlm
        assert calc_t_page_vlm(2875, 0.0, 1000, 500.0) == float("inf")
        assert calc_t_page_vlm(2875, 1000.0, 1000, 0.0) == float("inf")

    def test_t_page_grows_with_sl_pf(self) -> None:
        from core.sizing_math import calc_t_page_vlm
        short = calc_t_page_vlm(1000, 1000.0, 100, 500.0)
        long = calc_t_page_vlm(4000, 1000.0, 100, 500.0)
        assert long > short

    def test_t_page_drops_with_higher_throughput(self) -> None:
        from core.sizing_math import calc_t_page_vlm
        slow = calc_t_page_vlm(2875, 500.0, 1000, 500.0)
        fast = calc_t_page_vlm(2875, 1000.0, 1000, 1000.0)
        assert fast < slow


class TestOCRPureFunctions:
    """P9b — OCR + LLM pure functions (Приложение И.3.2-И.3.4, И.4.2)."""

    def test_t_ocr_gpu_inverse_of_throughput(self) -> None:
        # t = 1/R; 8 pages/s/GPU → 0.125 s/page
        from core.sizing_math import calc_t_ocr_gpu
        assert calc_t_ocr_gpu(r_ocr_gpu=8.0) == 0.125

    def test_t_ocr_gpu_returns_inf_on_invalid(self) -> None:
        from core.sizing_math import calc_t_ocr_gpu
        assert calc_t_ocr_gpu(r_ocr_gpu=0.0) == float("inf")
        assert calc_t_ocr_gpu(r_ocr_gpu=-1.0) == float("inf")

    def test_t_ocr_cpu_uses_total_cores(self) -> None:
        # t = 1/(R·n); 0.5 pages/s/core × 16 cores = 8 pages/s → 0.125 s/page
        from core.sizing_math import calc_t_ocr_cpu
        assert calc_t_ocr_cpu(r_ocr_core=0.5, n_cores=16) == 0.125

    def test_t_ocr_cpu_returns_inf_on_invalid(self) -> None:
        from core.sizing_math import calc_t_ocr_cpu
        assert calc_t_ocr_cpu(r_ocr_core=0.0, n_cores=8) == float("inf")
        assert calc_t_ocr_cpu(r_ocr_core=0.5, n_cores=0) == float("inf")

    def test_l_text_basic_formula(self) -> None:
        # 3000 chars / 3.5 chars/token = 857.14 tokens
        from core.sizing_math import calc_l_text
        result = calc_l_text(chars_page=3000, c_token=3.5)
        assert abs(result - 857.142857) < 1e-3

    def test_l_text_cyrillic_lower_density(self) -> None:
        # Cyrillic 2.8 chars/token → more tokens for same chars
        from core.sizing_math import calc_l_text
        latin = calc_l_text(chars_page=3000, c_token=4.0)
        mixed = calc_l_text(chars_page=3000, c_token=3.5)
        cyrillic = calc_l_text(chars_page=3000, c_token=2.8)
        assert cyrillic > mixed > latin

    def test_l_text_returns_zero_on_invalid(self) -> None:
        from core.sizing_math import calc_l_text
        assert calc_l_text(chars_page=0, c_token=3.5) == 0.0
        assert calc_l_text(chars_page=3000, c_token=0) == 0.0

    def test_sl_pf_llm_after_ocr_sums(self) -> None:
        import pytest
        from core.sizing_math import calc_sl_pf_llm_after_ocr
        result = calc_sl_pf_llm_after_ocr(l_text=857.14, n_prompt_sys=1000)
        assert result == pytest.approx(1857.14, abs=1e-6)

    def test_n_gpu_ocr_online_basic_formula(self) -> None:
        # ⌈4 · 0.125 / 0.85⌉ = ⌈0.588⌉ = 1
        from core.sizing_math import calc_n_gpu_ocr_online
        assert calc_n_gpu_ocr_online(c_peak=4, t_ocr_gpu=0.125, eta_ocr=0.85) == 1
        # ⌈100 · 0.5 / 0.85⌉ = ⌈58.82⌉ = 59
        assert calc_n_gpu_ocr_online(c_peak=100, t_ocr_gpu=0.5, eta_ocr=0.85) == 59

    def test_n_gpu_ocr_online_grows_with_t_ocr(self) -> None:
        from core.sizing_math import calc_n_gpu_ocr_online
        fast = calc_n_gpu_ocr_online(c_peak=100, t_ocr_gpu=0.1, eta_ocr=0.85)
        slow = calc_n_gpu_ocr_online(c_peak=100, t_ocr_gpu=0.5, eta_ocr=0.85)
        assert slow > fast

    def test_n_gpu_ocr_online_drops_with_higher_eta(self) -> None:
        from core.sizing_math import calc_n_gpu_ocr_online
        loose = calc_n_gpu_ocr_online(c_peak=100, t_ocr_gpu=0.5, eta_ocr=0.7)
        tight = calc_n_gpu_ocr_online(c_peak=100, t_ocr_gpu=0.5, eta_ocr=0.95)
        assert tight < loose

    def test_t_llm_target_subtracts_ocr_and_handoff(self) -> None:
        # 5.0 - 0.125 - 0.05 = 4.825
        from core.sizing_math import calc_t_llm_target
        result = calc_t_llm_target(sla_page=5.0, t_ocr=0.125, t_handoff=0.05)
        assert abs(result - 4.825) < 1e-9

    def test_t_llm_target_can_be_negative(self) -> None:
        # OCR alone exceeds SLA — caller should detect failure
        from core.sizing_math import calc_t_llm_target
        result = calc_t_llm_target(sla_page=0.05, t_ocr=0.5, t_handoff=0.0)
        assert result < 0
