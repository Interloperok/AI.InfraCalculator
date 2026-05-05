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
    assert calc_Cmodel(TS=100.0, th_pf=0.0, Tdec=50.0, th_dec=1.0) == 0.0


def test_calc_cmodel_returns_zero_when_time_per_request_non_positive() -> None:
    assert calc_Cmodel(TS=-1.0, th_pf=1.0, Tdec=0.0, th_dec=1.0) == 0.0


def test_calc_ttft_returns_inf_for_non_positive_prefill_throughput() -> None:
    assert math.isinf(calc_ttft(SL=100.0, th_pf=0.0, th_dec=10.0))


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
