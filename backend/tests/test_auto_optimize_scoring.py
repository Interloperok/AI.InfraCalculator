"""Unit tests for auto-optimize scoring and ranking.

The previous `score_config` returned a flat float `primary * 1000 + tiebreak`,
which mis-ordered configurations under realistic conditions:

- min_servers: when `total_gpus > 1000`, +1 server could be cheaper to score
  than -1 server, so the optimiser preferred MORE servers.
- max_performance: when `th_server_comp < 1` req/s/server (common for
  agentic / ReAct workloads), the throughput term was dominated by the
  `servers_final` tiebreaker, so the optimiser preferred LOWER throughput.

These tests pin the corrected lexicographic-tuple sort order.
"""

from __future__ import annotations

from models import OptimizationMode
from services.auto_optimize_service import ScoreContext, display_score, score_config


_NEUTRAL_CTX = ScoreContext(
    min_servers=1.0,
    max_servers=1.0,
    min_gpus=1.0,
    max_gpus=1.0,
    min_throughput=0.001,
    max_throughput=0.001,
    min_cost=0.0,
    max_cost=0.0,
)


def _score(mode, servers, gpus, th, cost=None, lat=None, ctx=_NEUTRAL_CTX):
    return score_config(mode, servers, gpus, th, cost, lat, ctx)


def test_min_servers_prefers_fewer_servers_even_with_more_gpus() -> None:
    """Regression: 10 servers × 1500 GPUs must beat 11 servers × 200 GPUs.

    The old `servers * 1000 + total_gpus` form gave 11500 vs 11200, picking
    the 11-server config (wrong direction).
    """
    a = _score(OptimizationMode.min_servers, servers=10, gpus=1500, th=5.0)
    b = _score(OptimizationMode.min_servers, servers=11, gpus=200, th=5.0)
    assert a < b


def test_min_servers_tiebreaks_on_total_gpus() -> None:
    a = _score(OptimizationMode.min_servers, servers=8, gpus=64, th=5.0)
    b = _score(OptimizationMode.min_servers, servers=8, gpus=128, th=5.0)
    assert a < b


def test_max_performance_prefers_higher_throughput_at_subunit_rps() -> None:
    """Regression: 0.01 req/s on 10 servers must beat 0.005 req/s on 1 server.

    The old `-th * 1000 + servers` form gave 0 vs -4, picking the lower-
    throughput config (wrong direction). Common in ReAct/agentic workloads
    where per-server throughput drops below 1 req/s.
    """
    high = _score(OptimizationMode.max_performance, servers=10, gpus=80, th=0.01)
    low = _score(OptimizationMode.max_performance, servers=1, gpus=8, th=0.005)
    assert high < low


def test_max_performance_tiebreaks_on_servers_when_throughput_equal() -> None:
    fewer = _score(OptimizationMode.max_performance, servers=5, gpus=40, th=2.0)
    more = _score(OptimizationMode.max_performance, servers=10, gpus=80, th=2.0)
    assert fewer < more


def test_min_cost_prefers_lower_cost() -> None:
    cheap = _score(OptimizationMode.min_cost, servers=10, gpus=80, th=5.0, cost=10000)
    pricey = _score(OptimizationMode.min_cost, servers=8, gpus=64, th=5.0, cost=20000)
    assert cheap < pricey


def test_min_cost_excludes_unpriced_configs() -> None:
    priced = _score(OptimizationMode.min_cost, servers=10, gpus=80, th=5.0, cost=999999)
    unpriced = _score(OptimizationMode.min_cost, servers=1, gpus=8, th=5.0, cost=None)
    assert priced < unpriced
    assert unpriced[0] == float("inf")


def test_best_sla_prefers_lower_latency() -> None:
    fast = _score(OptimizationMode.best_sla, servers=10, gpus=80, th=5.0, lat=0.5)
    slow = _score(OptimizationMode.best_sla, servers=8, gpus=64, th=5.0, lat=0.8)
    assert fast < slow


def test_best_sla_excludes_configs_without_latency() -> None:
    has_lat = _score(OptimizationMode.best_sla, servers=10, gpus=80, th=5.0, lat=999.0)
    no_lat = _score(OptimizationMode.best_sla, servers=1, gpus=8, th=5.0, lat=None)
    assert has_lat < no_lat


def test_balanced_uses_population_normalisation() -> None:
    ctx = ScoreContext(
        min_servers=10.0,
        max_servers=20.0,
        min_gpus=80.0,
        max_gpus=160.0,
        min_throughput=1.0,
        max_throughput=5.0,
        min_cost=10000.0,
        max_cost=50000.0,
    )
    best = score_config(OptimizationMode.balanced, 10, 80, 5.0, 10000.0, 0.5, ctx)
    worst = score_config(OptimizationMode.balanced, 20, 160, 1.0, 50000.0, 5.0, ctx)
    assert best < worst


def test_score_context_handles_empty_costs() -> None:
    raw = [
        {"servers": 5, "total_gpus": 40, "th_server": 1.0, "total_cost": None},
        {"servers": 10, "total_gpus": 80, "th_server": 2.0, "total_cost": None},
    ]
    ctx = ScoreContext.from_results(raw)
    assert ctx.min_cost == 0.0
    assert ctx.max_cost == 0.0


def test_display_score_returns_first_tuple_element() -> None:
    assert display_score((42.0, 1.0)) == 42.0
    assert display_score((-3.5, 7.0)) == -3.5
    assert display_score((float("inf"),)) == float("inf")
    assert display_score(()) == float("inf")


def test_auto_optimize_configs_carry_report_labels() -> None:
    """The Excel report labels the GPU/LLM dropdowns from these two fields,
    so a config picked from the optimizer must keep them."""
    from models import AutoOptimizeInput
    from services.auto_optimize_service import auto_optimize

    inp = AutoOptimizeInput(
        model_name="Qwen/Qwen3-8B",
        params_billions=8,
        layers_L=36,
        hidden_size_H=4096,
        internal_users=100,
        penetration_internal=0.5,
        concurrency_internal=0.1,
        custom_gpu_catalog=[
            {
                "id": "test-h100",
                "vendor": "NVIDIA",
                "model_name": "H100 80GB",
                "memory_gb": 80,
                "tflops_fp16": 989,
                "launch_date": "2022-03-22",
            }
        ],
        top_n=1,
    )

    sizing_input = auto_optimize(inp).results[0].sizing_input

    assert sizing_input is not None
    assert sizing_input["model_name"] == "Qwen/Qwen3-8B"
    assert sizing_input["gpu_name"] == "NVIDIA H100 80GB"
