"""Property-based tests for critical sizing math invariants."""

from __future__ import annotations

import math

from hypothesis import given
from hypothesis import strategies as st

from core.sizing_math import (
    calc_Kbatch,
    calc_SL,
    calc_S_TP,
    calc_e2e_latency,
    calc_generation_time,
    calc_kv_per_session_gb,
    calc_model_mem_gb,
    calc_servers_by_compute,
    calc_servers_by_memory,
    calc_th_prefill_analyt,
    calc_ttft,
)


@given(
    ts=st.floats(
        min_value=0.0,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    tsmax=st.floats(
        min_value=1e-6,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_sl_is_bounded_by_ts_and_tsmax(ts: float, tsmax: float) -> None:
    sl = calc_SL(ts, tsmax)
    assert sl == min(ts, tsmax)
    assert sl <= ts
    assert sl <= tsmax


@given(
    params=st.floats(
        min_value=0.1,
        max_value=500.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    params_delta=st.floats(
        min_value=0.0,
        max_value=500.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    bytes_per_param=st.floats(
        min_value=0.25,
        max_value=8.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    emp_model=st.floats(
        min_value=1.0,
        max_value=2.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    safe_margin=st.floats(
        min_value=0.0,
        max_value=64.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_model_memory_is_monotonic_by_params(
    params: float,
    params_delta: float,
    bytes_per_param: float,
    emp_model: float,
    safe_margin: float,
) -> None:
    base = calc_model_mem_gb(params, bytes_per_param, emp_model, safe_margin)
    increased = calc_model_mem_gb(
        params + params_delta,
        bytes_per_param,
        emp_model,
        safe_margin,
    )
    assert increased >= base


@given(
    layers=st.integers(min_value=1, max_value=256),
    hidden=st.integers(min_value=1, max_value=16_384),
    sequence=st.integers(min_value=1, max_value=32_768),
    sequence_delta=st.integers(min_value=0, max_value=32_768),
    bytes_state=st.floats(
        min_value=0.25,
        max_value=8.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    emp_kv=st.floats(
        min_value=1.0,
        max_value=2.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    kv_heads=st.integers(min_value=1, max_value=256),
    attn_heads=st.integers(min_value=1, max_value=256),
)
def test_kv_per_session_is_monotonic_with_sequence_length(
    layers: int,
    hidden: int,
    sequence: int,
    sequence_delta: int,
    bytes_state: float,
    emp_kv: float,
    kv_heads: int,
    attn_heads: int,
) -> None:
    base = calc_kv_per_session_gb(
        layers,
        hidden,
        sequence,
        bytes_state,
        emp_kv,
        kv_heads,
        attn_heads,
    )
    increased = calc_kv_per_session_gb(
        layers,
        hidden,
        sequence + sequence_delta,
        bytes_state,
        emp_kv,
        kv_heads,
        attn_heads,
    )
    assert increased >= base


@given(
    kv_free=st.floats(
        min_value=0.0,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    kv_per_session=st.floats(
        min_value=1e-9,
        max_value=10_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_s_tp_matches_floor_division(kv_free: float, kv_per_session: float) -> None:
    sessions = calc_S_TP(kv_free, kv_per_session)
    assert isinstance(sessions, int)
    assert sessions >= 0
    assert sessions == int(kv_free // kv_per_session)
    assert sessions * kv_per_session <= kv_free + 1e-9


@given(
    ssim=st.floats(
        min_value=0.0,
        max_value=10_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    sserver=st.integers(min_value=1, max_value=100_000),
)
def test_servers_by_memory_matches_ceiling(ssim: float, sserver: int) -> None:
    servers = calc_servers_by_memory(ssim, sserver)
    assert servers == math.ceil(ssim / sserver)
    if ssim > 0:
        assert (servers - 1) * sserver < ssim + 1e-9
    assert servers * sserver >= ssim - 1e-9


@given(
    ssim=st.floats(
        min_value=0.0,
        max_value=10_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    rps=st.floats(
        min_value=1e-6,
        max_value=1.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    ksla=st.floats(
        min_value=0.1,
        max_value=10.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    th_server=st.floats(
        min_value=1e-6,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_servers_by_compute_matches_ceiling(
    ssim: float,
    rps: float,
    ksla: float,
    th_server: float,
) -> None:
    servers = calc_servers_by_compute(ssim, rps, ksla, th_server)
    expected = math.ceil((ssim * rps * ksla) / th_server)
    assert servers == expected


@given(
    fcount_flops=st.floats(
        min_value=1e6,
        max_value=1e17,
        allow_nan=False,
        allow_infinity=False,
    ),
    eta=st.floats(
        min_value=0.01,
        max_value=1.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    kbatch=st.floats(
        min_value=0.1,
        max_value=100.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    kbatch_delta=st.floats(
        min_value=0.0,
        max_value=100.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    fps=st.floats(
        min_value=1e3,
        max_value=1e12,
        allow_nan=False,
        allow_infinity=False,
    ),
    layers=st.integers(min_value=1, max_value=256),
    hidden=st.integers(min_value=1, max_value=16_384),
    sequence=st.integers(min_value=1, max_value=32_768),
)
def test_prefill_throughput_monotonic_with_kbatch(
    fcount_flops: float,
    eta: float,
    kbatch: float,
    kbatch_delta: float,
    fps: float,
    layers: int,
    hidden: int,
    sequence: int,
) -> None:
    th_base = calc_th_prefill_analyt(fcount_flops, eta, kbatch, fps, layers, hidden, sequence)
    th_increased = calc_th_prefill_analyt(
        fcount_flops,
        eta,
        kbatch + kbatch_delta,
        fps,
        layers,
        hidden,
        sequence,
    )
    assert th_base >= 0.0
    assert th_increased >= th_base


@given(
    sl=st.floats(
        min_value=0.0,
        max_value=32_768.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    th_pf=st.floats(
        min_value=1e-6,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    th_dec=st.floats(
        min_value=1e-6,
        max_value=1_000_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
    t_out=st.floats(
        min_value=0.0,
        max_value=32_768.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_e2e_latency_is_ttft_plus_generation(
    sl: float,
    th_pf: float,
    th_dec: float,
    t_out: float,
) -> None:
    ttft = calc_ttft(sl, th_pf, th_dec)
    generation = calc_generation_time(t_out, th_dec)
    e2e = calc_e2e_latency(ttft, generation)
    assert math.isfinite(ttft)
    assert math.isfinite(generation)
    assert e2e == ttft + generation


@given(
    s_tp_base=st.integers(min_value=1, max_value=100_000),
    c=st.floats(
        min_value=1e-6,
        max_value=1_000.0,
        allow_nan=False,
        allow_infinity=False,
    ),
)
def test_kbatch_is_one_when_tp_unchanged(s_tp_base: int, c: float) -> None:
    assert calc_Kbatch(s_tp_base, s_tp_base, c) == 1.0
