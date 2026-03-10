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
    calc_th_prefill_analyt,
    calc_ttft,
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
