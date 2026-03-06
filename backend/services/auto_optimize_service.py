from __future__ import annotations

from typing import Optional

from fastapi import HTTPException

from core.sizing_math import calc_gpus_per_instance, calc_model_mem_gb
from models import (
    AutoOptimizeInput,
    AutoOptimizeResponse,
    AutoOptimizeResult,
    OptimizationMode,
    SizingInput,
)
from services.gpu_catalog_service import load_gpu_catalog_for_optimize
from services.sizing_service import run_sizing


def score_config(
    mode: OptimizationMode,
    servers_final: int,
    total_gpus: int,
    th_server_comp: float,
    cost: Optional[float],
    e2e_latency: Optional[float],
    all_servers: list[int],
    all_gpus: list[int],
    all_throughputs: list[float],
    all_costs: list[Optional[float]],
) -> float:
    """Вычислить скор конфигурации для ранжирования (меньше = лучше)."""
    if mode == OptimizationMode.min_servers:
        return servers_final * 1000 + total_gpus

    if mode == OptimizationMode.min_cost:
        if cost is not None:
            return cost * 1000 + total_gpus
        return float("inf")

    if mode == OptimizationMode.max_performance:
        return -th_server_comp * 1000 + servers_final

    if mode == OptimizationMode.best_sla:
        lat = e2e_latency if e2e_latency is not None else float("inf")
        return lat * 1000 + servers_final

    min_s = min(all_servers) if all_servers else 1
    max_s = max(all_servers) if all_servers else 1
    min_g = min(all_gpus) if all_gpus else 1
    max_g = max(all_gpus) if all_gpus else 1
    min_t = min(all_throughputs) if all_throughputs else 0.001
    max_t = max(all_throughputs) if all_throughputs else 0.001

    costs_valid = [item for item in all_costs if item is not None]
    min_c = min(costs_valid) if costs_valid else 0
    max_c = max(costs_valid) if costs_valid else 0

    def norm(val: float, lo: float, hi: float) -> float:
        if hi == lo:
            return 0.0
        return (val - lo) / (hi - lo)

    ns = norm(servers_final, min_s, max_s)
    ng = norm(total_gpus, min_g, max_g)
    nt = 1.0 - norm(th_server_comp, min_t, max_t)
    nc = norm(cost, min_c, max_c) if cost is not None and max_c > min_c else 0.5
    return 0.3 * ns + 0.2 * ng + 0.25 * nt + 0.25 * nc


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
        raise HTTPException(
            status_code=400,
            detail=(
                "Нет подходящих GPU в каталоге. Попробуйте снизить min_gpu_memory_gb "
                "или убрать фильтр по вендору."
            ),
        )

    # ── Перебор комбинаций ──
    raw_results: list[dict] = []
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
                            # SLA
                            rps_per_session_R=inp.rps_per_session_R,
                            sla_reserve_KSLA=inp.sla_reserve_KSLA,
                            ttft_sla=getattr(inp, "ttft_sla", None),
                            e2e_latency_sla=getattr(inp, "e2e_latency_sla", None),
                        )

                        result = run_sizing(sizing_inp)
                    except Exception:
                        continue

                    servers = result.servers_final
                    total_gpus_count = servers * gps

                    if inp.max_servers and servers > inp.max_servers:
                        continue

                    gpu_price = gpu.get("price_usd")
                    total_cost = (
                        round(servers * gps * gpu_price, 2)
                        if gpu_price is not None
                        else None
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
        raise HTTPException(
            status_code=400,
            detail=(
                "Ни одна комбинация не дала валидный результат. "
                "Попробуйте увеличить min_gpu_memory_gb или ослабить ограничения."
            ),
        )

    # ── Скоринг ──
    all_servers = [item["servers"] for item in raw_results]
    all_gpus = [item["total_gpus"] for item in raw_results]
    all_throughputs = [item["th_server"] for item in raw_results]
    all_costs = [item["total_cost"] for item in raw_results]

    for item in raw_results:
        item["score"] = score_config(
            inp.mode,
            item["servers"],
            item["total_gpus"],
            item["th_server"],
            item["total_cost"],
            item["e2e_latency"],
            all_servers,
            all_gpus,
            all_throughputs,
            all_costs,
        )

    raw_results.sort(key=lambda item: item["score"])

    # Дедупликация: по (servers, total_gpus, sessions_per_server, th_server округлённый)
    seen_keys: set[tuple[int, int, int, float]] = set()
    deduped: list[dict] = []
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
