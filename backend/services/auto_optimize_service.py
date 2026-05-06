from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from core.sizing_math import calc_gpus_per_instance, calc_model_mem_gb
from errors import ValidationAppError
from models import (
    AutoOptimizeInput,
    AutoOptimizeResponse,
    AutoOptimizeResult,
    OptimizationMode,
    SizingInput,
)
from pydantic import ValidationError
from services.gpu_catalog_service import load_gpu_catalog_for_optimize
from services.sizing_service import run_sizing


@dataclass(frozen=True)
class ScoreContext:
    """Population statistics for the balanced-mode normaliser, hoisted once
    out of the per-config scoring loop. The explicit modes don't need this."""

    min_servers: float
    max_servers: float
    min_gpus: float
    max_gpus: float
    min_throughput: float
    max_throughput: float
    min_cost: float
    max_cost: float

    @classmethod
    def from_results(cls, raw_results: list[dict[str, Any]]) -> "ScoreContext":
        servers = [item["servers"] for item in raw_results] or [1]
        gpus = [item["total_gpus"] for item in raw_results] or [1]
        throughputs = [item["th_server"] for item in raw_results] or [0.001]
        costs = [item["total_cost"] for item in raw_results if item["total_cost"] is not None]
        return cls(
            min_servers=min(servers),
            max_servers=max(servers),
            min_gpus=min(gpus),
            max_gpus=max(gpus),
            min_throughput=min(throughputs),
            max_throughput=max(throughputs),
            min_cost=min(costs) if costs else 0.0,
            max_cost=max(costs) if costs else 0.0,
        )


def _norm(val: float, lo: float, hi: float) -> float:
    if hi == lo:
        return 0.0
    return (val - lo) / (hi - lo)


def score_config(
    mode: OptimizationMode,
    servers_final: int,
    total_gpus: int,
    th_server_comp: float,
    cost: Optional[float],
    e2e_latency: Optional[float],
    ctx: ScoreContext,
) -> tuple[float, ...]:
    """Compute a lexicographic sort key for one configuration (smaller = better).

    Returns a tuple instead of a flat float to avoid tiebreak overflow:
    the previous `primary * 1000 + tiebreaker` form mis-ordered configs when
    `total_gpus > 1000` (under min_servers) or when `th_server_comp < 1` (under
    max_performance). Tuple comparison is exact lexicographic order.
    """
    if mode == OptimizationMode.min_servers:
        return (float(servers_final), float(total_gpus))

    if mode == OptimizationMode.min_cost:
        if cost is None:
            return (float("inf"),)
        return (float(cost), float(total_gpus))

    if mode == OptimizationMode.max_performance:
        return (-float(th_server_comp), float(servers_final))

    if mode == OptimizationMode.best_sla:
        lat = float(e2e_latency) if e2e_latency is not None else float("inf")
        return (lat, float(servers_final))

    ns = _norm(servers_final, ctx.min_servers, ctx.max_servers)
    ng = _norm(total_gpus, ctx.min_gpus, ctx.max_gpus)
    nt = 1.0 - _norm(th_server_comp, ctx.min_throughput, ctx.max_throughput)
    nc = (
        _norm(cost, ctx.min_cost, ctx.max_cost)
        if cost is not None and ctx.max_cost > ctx.min_cost
        else 0.5
    )
    return (0.3 * ns + 0.2 * ng + 0.25 * nt + 0.25 * nc,)


def display_score(score_key: tuple[float, ...]) -> float:
    """Reduce a tuple sort key to a scalar for API display (lower = better).

    Uses the dominant metric (the first tuple element); the tiebreakers
    matter only for sort order, not for user-facing comparison.
    """
    if not score_key:
        return float("inf")
    return float(score_key[0])


def auto_optimize(inp: AutoOptimizeInput) -> AutoOptimizeResponse:
    """Автоматический подбор оптимальной конфигурации."""
    # ── Пространство поиска ──
    tp_values = [1, 2, 4, 6, 8]
    gpus_per_server_values = [1, 2, 4, 6, 8]
    bytes_per_param_values = [1, 2, 4]

    # ── Загрузка и фильтрация GPU из каталога ──
    min_mem = inp.min_gpu_memory_gb or 0
    gpu_catalog = load_gpu_catalog_for_optimize(
        min_memory_gb=min_mem,
        vendors=inp.gpu_vendors,
        gpu_ids=inp.gpu_ids,
        custom_catalog=inp.custom_gpu_catalog,
    )

    if not gpu_catalog:
        raise ValidationAppError(
            "Нет подходящих GPU в каталоге. Попробуйте снизить min_gpu_memory_gb "
            "или убрать фильтр по вендору."
        )

    # ── Перебор комбинаций ──
    raw_results: list[dict[str, Any]] = []
    total_evaluated = 0

    for gpu in gpu_catalog:
        for bpp in bytes_per_param_values:
            Mmodel = calc_model_mem_gb(inp.params_billions, bpp, inp.emp_model, inp.safe_margin)
            GPUcount_model = calc_gpus_per_instance(Mmodel, gpu["memory_gb"], inp.kavail)

            for gps in gpus_per_server_values:
                if GPUcount_model > gps:
                    total_evaluated += len(tp_values)
                    continue

                for Z in tp_values:
                    total_evaluated += 1

                    if Z * GPUcount_model > gps:
                        continue

                    try:
                        sizing_inp = SizingInput(
                            # Модель
                            params_billions=inp.params_billions,
                            bytes_per_param=bpp,
                            safe_margin=inp.safe_margin,
                            emp_model=inp.emp_model,
                            layers_L=inp.layers_L,
                            hidden_size_H=inp.hidden_size_H,
                            # Пользователи
                            internal_users=inp.internal_users,
                            penetration_internal=inp.penetration_internal,
                            concurrency_internal=inp.concurrency_internal,
                            external_users=inp.external_users,
                            penetration_external=inp.penetration_external,
                            concurrency_external=inp.concurrency_external,
                            sessions_per_user_J=inp.sessions_per_user_J,
                            # Токены
                            system_prompt_tokens_SP=inp.system_prompt_tokens_SP,
                            user_prompt_tokens_Prp=inp.user_prompt_tokens_Prp,
                            reasoning_tokens_MRT=inp.reasoning_tokens_MRT,
                            answer_tokens_A=inp.answer_tokens_A,
                            dialog_turns=inp.dialog_turns,
                            # KV
                            num_kv_heads=inp.num_kv_heads,
                            num_attention_heads=inp.num_attention_heads,
                            bytes_per_kv_state=inp.bytes_per_kv_state,
                            emp_kv=inp.emp_kv,
                            max_context_window_TSmax=inp.max_context_window_TSmax,
                            # Hardware
                            gpu_mem_gb=gpu["memory_gb"],
                            gpu_id=gpu["id"],
                            gpus_per_server=gps,
                            kavail=inp.kavail,
                            tp_multiplier_Z=Z,
                            saturation_coeff_C=inp.saturation_coeff_C,
                            # Compute
                            gpu_flops_Fcount=gpu["tflops"],
                            eta_prefill=inp.eta_prefill,
                            eta_decode=inp.eta_decode,
                            th_prefill_empir=None,
                            th_decode_empir=None,
                            # SLA
                            rps_per_session_R=inp.rps_per_session_R,
                            sla_reserve_KSLA=inp.sla_reserve_KSLA,
                            ttft_sla=getattr(inp, "ttft_sla", None),
                            e2e_latency_sla=getattr(inp, "e2e_latency_sla", None),
                        )

                        result = run_sizing(sizing_inp)
                    except ValidationAppError, ValidationError, ValueError:
                        continue

                    servers = result.servers_final
                    total_gpus_count = servers * gps

                    if inp.max_servers and servers > inp.max_servers:
                        continue

                    gpu_price = gpu.get("price_usd")
                    total_cost = (
                        round(servers * gps * gpu_price, 2) if gpu_price is not None else None
                    )

                    raw_results.append(
                        {
                            "gpu": gpu,
                            "Z": Z,
                            "gps": gps,
                            "bpp": bpp,
                            "result": result,
                            "servers": servers,
                            "total_gpus": total_gpus_count,
                            "th_server": result.th_server_comp,
                            "e2e_latency": result.e2e_latency_analyt,
                            "gpu_price": gpu_price,
                            "total_cost": total_cost,
                            "sizing_input_dict": sizing_inp.model_dump(),
                        }
                    )

    if not raw_results:
        raise ValidationAppError(
            "Ни одна комбинация не дала валидный результат. "
            "Попробуйте увеличить min_gpu_memory_gb или ослабить ограничения."
        )

    # ── Скоринг ──
    # Population statistics computed once (was O(N²) inside the per-config
    # scoring loop because score_config recomputed min/max on every call).
    score_ctx = ScoreContext.from_results(raw_results)

    for item in raw_results:
        item["score_key"] = score_config(
            inp.mode,
            item["servers"],
            item["total_gpus"],
            item["th_server"],
            item["total_cost"],
            item["e2e_latency"],
            score_ctx,
        )
        item["score"] = display_score(item["score_key"])

    raw_results.sort(key=lambda item: item["score_key"])

    # Дедупликация: по (servers, total_gpus, sessions_per_server, th_server округлённый)
    seen_keys: set[tuple[int, int, int, float]] = set()
    deduped: list[dict[str, Any]] = []
    for item in raw_results:
        key = (
            item["servers"],
            item["total_gpus"],
            item["result"].sessions_per_server,
            round(item["th_server"], 2),
        )
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(item)

    top = deduped[: inp.top_n]

    results: list[AutoOptimizeResult] = []
    for rank, item in enumerate(top, 1):
        results.append(
            AutoOptimizeResult(
                rank=rank,
                score=round(item["score"], 4),
                gpu_name=item["gpu"]["name"],
                gpu_id=item["gpu"]["id"],
                gpu_mem_gb=item["gpu"]["memory_gb"],
                gpu_tflops=item["gpu"]["tflops"],
                tp_multiplier_Z=item["Z"],
                gpus_per_server=item["gps"],
                bytes_per_param=item["bpp"],
                servers_final=item["servers"],
                total_gpus=item["total_gpus"],
                servers_by_memory=item["result"].servers_by_memory,
                servers_by_compute=item["result"].servers_by_compute,
                sessions_per_server=item["result"].sessions_per_server,
                instances_per_server_tp=item["result"].instances_per_server_tp,
                th_server_comp=round(item["result"].th_server_comp, 4),
                gpu_price_usd=item["gpu_price"],
                cost_estimate_usd=item["total_cost"],
                sizing_input=item["sizing_input_dict"],
            )
        )

    return AutoOptimizeResponse(
        mode=inp.mode,
        total_evaluated=total_evaluated,
        total_valid=len(raw_results),
        results=results,
    )
