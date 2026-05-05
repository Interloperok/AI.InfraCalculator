from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from models import GPUInfo, GPUListResponse, GPUStats

BACKEND_DIR = Path(__file__).resolve().parent.parent
GPU_DATA_PATH = BACKEND_DIR / "gpu_data.json"


def _read_gpu_catalog(path: Path = GPU_DATA_PATH) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as file_obj:
        data = json.load(file_obj)

    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    if isinstance(data, dict):
        return [item for item in data.values() if isinstance(item, dict)]

    return []


def load_gpu_catalog() -> list[dict[str, Any]]:
    """Загрузить каталог GPU из `gpu_data.json`."""
    return _read_gpu_catalog()


def export_gpu_catalog_path() -> Path:
    """Вернуть путь к каталогу GPU для отдачи файла через API."""
    return GPU_DATA_PATH


def extract_gpu_tflops(gpu_info: dict[str, Any]) -> float:
    """Извлечь наиболее подходящее значение TFLOPS для LLM-инференса."""
    fp16 = gpu_info.get("tflops_fp16")
    if fp16 and float(fp16) > 0:
        return float(fp16)
    fp32 = gpu_info.get("tflops_fp32")
    if fp32 and float(fp32) > 0:
        return float(fp32)
    return 0.0


def lookup_gpu_bandwidth_gbs(gpu_id: Optional[str]) -> float:
    """Поиск пропускной способности памяти GPU (BW_GPU, GB/s) из каталога.

    Строгий поиск только по ``gpu_id`` — без fallback по объёму памяти,
    чтобы фейковые ``gpu_id`` (используемые в тестовых фикстурах) не
    приводили к спонтанным совпадениям с реальными GPU из каталога.
    Возвращает 0.0 если bw недоступен — в этом случае memory-bandwidth-bound
    decode-ветвь не вычисляется (см. ``calc_th_decode_mem``).
    """
    if not gpu_id:
        return 0.0
    try:
        gpu_data = load_gpu_catalog()
    except (FileNotFoundError, json.JSONDecodeError):
        return 0.0

    for gpu in gpu_data:
        if gpu.get("id") == gpu_id:
            bw = gpu.get("memory_bandwidth_gbs")
            if bw is not None:
                try:
                    return float(bw)
                except (TypeError, ValueError):
                    return 0.0
            return 0.0
    return 0.0


def lookup_gpu_tflops(gpu_id: Optional[str], gpu_mem_gb: float) -> float:
    """Поиск TFLOPS GPU из каталога по id или объёму памяти."""
    try:
        gpu_data = load_gpu_catalog()
    except FileNotFoundError, json.JSONDecodeError:
        return 0.0

    target_gpu: Optional[dict[str, Any]] = None
    for gpu in gpu_data:
        if gpu_id and gpu.get("id") == gpu_id:
            target_gpu = gpu
            break

        mem = gpu.get("memory_gb", 0)
        if mem and float(mem) == float(gpu_mem_gb):
            target_gpu = gpu
            break

    if not target_gpu:
        return 0.0

    return extract_gpu_tflops(target_gpu)


def price_from_gpu_entry(gpu: dict[str, Any]) -> Optional[float]:
    """Извлечь `price_usd` из одной записи каталога GPU."""
    price = gpu.get("price_usd")
    if price is None or str(price).strip() == "":
        return None

    try:
        return float(price)
    except TypeError, ValueError:
        return None


def lookup_gpu_price_in_catalog(
    catalog: list[dict[str, Any]],
    gpu_id: Optional[str],
    gpu_mem_gb: float,
) -> Optional[float]:
    """Поиск цены GPU (USD) по id или объёму памяти в переданном каталоге."""
    target_gpu: Optional[dict[str, Any]] = None
    for gpu in catalog:
        if gpu_id and gpu.get("id") == gpu_id:
            target_gpu = gpu
            break

        if not gpu_id:
            mem = gpu.get("memory_gb", 0)
            if mem is not None and float(mem) == float(gpu_mem_gb):
                target_gpu = gpu
                break

    if not target_gpu:
        return None

    return price_from_gpu_entry(target_gpu)


def lookup_gpu_price_usd(
    gpu_id: Optional[str],
    gpu_mem_gb: float,
    custom_catalog: Optional[list[dict[str, Any]]] = None,
) -> Optional[float]:
    """Поиск цены GPU (USD): сначала в custom_catalog, затем в gpu_data.json."""
    if custom_catalog:
        price = lookup_gpu_price_in_catalog(custom_catalog, gpu_id, gpu_mem_gb)
        if price is not None:
            return price

    try:
        gpu_data = load_gpu_catalog()
    except FileNotFoundError, json.JSONDecodeError:
        return None

    return lookup_gpu_price_in_catalog(gpu_data, gpu_id, gpu_mem_gb)


def load_gpu_catalog_for_optimize(
    min_memory_gb: float = 0,
    vendors: Optional[list[str]] = None,
    gpu_ids: Optional[list[str]] = None,
    custom_catalog: Optional[dict[str, Any] | list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Загрузить и отфильтровать GPU из каталога для автоподбора."""
    if custom_catalog is not None:
        if isinstance(custom_catalog, list):
            gpu_data = custom_catalog
        elif isinstance(custom_catalog, dict):
            gpu_data = [item for item in custom_catalog.values() if isinstance(item, dict)]
        else:
            gpu_data = []
    else:
        try:
            gpu_data = load_gpu_catalog()
        except FileNotFoundError, json.JSONDecodeError:
            return []

    gpu_id_set = set(gpu_ids) if gpu_ids else None
    results: list[dict[str, Any]] = []
    seen: set[tuple[int, float]] = set()

    for gpu_info in gpu_data:
        gpu_id = gpu_info.get("id", "")

        if gpu_id_set is not None and gpu_id not in gpu_id_set:
            continue

        memory_gb = gpu_info.get("memory_gb")
        if not memory_gb or float(memory_gb) <= 0:
            continue
        memory_gb = float(memory_gb)

        if memory_gb < min_memory_gb:
            continue

        vendor = gpu_info.get("vendor", "Unknown")
        if gpu_id_set is None and vendors:
            if not any(item.lower() == str(vendor).lower() for item in vendors):
                continue

        if gpu_id_set is None:
            launch_date = gpu_info.get("launch_date")
            if launch_date:
                try:
                    year = int(str(launch_date)[:4])
                    if year <= 2013:
                        continue
                except ValueError, IndexError:
                    continue
            else:
                continue

        tflops = extract_gpu_tflops(gpu_info)
        if tflops <= 0:
            continue

        model_name = gpu_info.get("model_name") or "Unknown"
        full_name = f"{vendor} {model_name}".strip()

        dedup_key = (int(memory_gb), round(tflops, 1))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        results.append(
            {
                "id": gpu_id,
                "name": full_name,
                "memory_gb": int(memory_gb),
                "tflops": tflops,
                "vendor": vendor,
                "price_usd": price_from_gpu_entry(gpu_info),
            }
        )

    return results


def get_recommended_gpus_per_server(gpu_info: dict[str, Any]) -> int:
    """Определить рекомендуемое количество GPU на сервер."""
    memory_gb = gpu_info.get("memory_gb") or 0
    if memory_gb >= 16:
        return 8
    return 4


def get_estimated_tps(gpu_info: dict[str, Any]) -> float:
    """Оценить TPS на основе характеристик GPU."""
    memory_gb = gpu_info.get("memory_gb") or 0
    vendor = str(gpu_info.get("vendor", "")).lower()

    if vendor == "nvidia":
        if memory_gb >= 80:
            return 2000
        if memory_gb >= 40:
            return 1500
        if memory_gb >= 24:
            return 1000
        return 500

    if vendor == "amd":
        if memory_gb >= 80:
            return 1500
        if memory_gb >= 24:
            return 800
        return 400

    return 300


def list_gpus(
    vendor: Optional[str],
    min_memory: Optional[float],
    max_memory: Optional[float],
    min_cores: Optional[int],
    min_year: Optional[int],
    max_year: Optional[int],
    memory_type: Optional[str],
    page: int,
    per_page: int,
    search: Optional[str],
) -> GPUListResponse:
    """Получить список GPU с фильтрацией и пагинацией."""
    gpu_data = load_gpu_catalog()

    filtered_gpus: list[GPUInfo] = []
    for gpu_info in gpu_data:
        gpu_id = gpu_info.get("id", "")

        gpu_vendor = gpu_info.get("vendor", "Unknown")
        if vendor and str(gpu_vendor).lower() != vendor.lower():
            continue

        mem_gb = gpu_info.get("memory_gb")
        if not mem_gb or float(mem_gb) <= 0:
            continue
        mem_gb = float(mem_gb)

        if min_memory and mem_gb < min_memory:
            continue
        if max_memory and mem_gb > max_memory:
            continue

        if min_cores is not None:
            cores_value = gpu_info.get("cores") or gpu_info.get("cuda_cores")
            if cores_value is not None:
                try:
                    if int(cores_value) < min_cores:
                        continue
                except TypeError, ValueError:
                    pass

        launch_date = gpu_info.get("launch_date")
        if launch_date:
            try:
                year = int(str(launch_date)[:4])
                if year <= 2013:
                    continue
                if min_year and year < min_year:
                    continue
                if max_year and year > max_year:
                    continue
            except ValueError, IndexError:
                continue
        else:
            continue

        gpu_mem_type = gpu_info.get("memory_type")
        if memory_type and (not gpu_mem_type or str(gpu_mem_type).lower() != memory_type.lower()):
            continue

        model_name = gpu_info.get("model_name") or "Unknown"
        full_name = f"{gpu_vendor} {model_name}".strip()

        if search and search.lower() not in full_name.lower():
            continue

        tdp_value = gpu_info.get("tdp_watts")
        tdp_str = f"{int(tdp_value)} W" if tdp_value else "Unknown"

        price_usd = gpu_info.get("price_usd")
        if price_usd is not None:
            try:
                price_usd = float(price_usd)
            except TypeError, ValueError:
                price_usd = None

        filtered_gpus.append(
            GPUInfo(
                id=gpu_id,
                vendor=gpu_vendor,
                model=model_name,
                memory_gb=int(mem_gb),
                cores=None,
                launch_date=launch_date,
                memory_type=gpu_mem_type,
                recommended_gpus_per_server=get_recommended_gpus_per_server(gpu_info),
                estimated_tps_per_instance=get_estimated_tps(gpu_info),
                full_name=full_name,
                tdp_watts=tdp_str,
                tflops=extract_gpu_tflops(gpu_info) or None,
                price_usd=price_usd,
            )
        )

    total = len(filtered_gpus)
    start = (page - 1) * per_page
    end = start + per_page
    paginated_gpus = filtered_gpus[start:end]

    return GPUListResponse(
        gpus=paginated_gpus,
        total=total,
        page=page,
        per_page=per_page,
        has_next=end < total,
        has_prev=page > 1,
    )


def get_gpu_details(gpu_id: str) -> GPUInfo:
    """Получить детальную информацию по одному GPU."""
    gpu_data = load_gpu_catalog()
    gpu_info = next((gpu for gpu in gpu_data if gpu.get("id") == gpu_id), None)
    if gpu_info is None:
        raise KeyError("GPU not found")

    gpu_vendor = gpu_info.get("vendor", "Unknown")
    model_name = gpu_info.get("model_name") or "Unknown"
    full_name = f"{gpu_vendor} {model_name}".strip()
    mem_gb = gpu_info.get("memory_gb") or 0
    tdp_value = gpu_info.get("tdp_watts")
    tdp_str = f"{int(tdp_value)} W" if tdp_value else "Unknown"

    price_usd = gpu_info.get("price_usd")
    if price_usd is not None:
        try:
            price_usd = float(price_usd)
        except TypeError, ValueError:
            price_usd = None

    return GPUInfo(
        id=gpu_id,
        vendor=gpu_vendor,
        model=model_name,
        memory_gb=int(mem_gb),
        cores=None,
        launch_date=gpu_info.get("launch_date"),
        memory_type=gpu_info.get("memory_type"),
        recommended_gpus_per_server=get_recommended_gpus_per_server(gpu_info),
        estimated_tps_per_instance=get_estimated_tps(gpu_info),
        full_name=full_name,
        tdp_watts=tdp_str,
        tflops=extract_gpu_tflops(gpu_info) or None,
        price_usd=price_usd,
    )


def get_gpu_stats() -> GPUStats:
    """Получить агрегированную статистику по каталогу GPU."""
    gpu_data = load_gpu_catalog()

    vendors: dict[str, int] = {}
    memory_ranges: dict[str, int] = {
        "0-4GB": 0,
        "4-8GB": 0,
        "8-16GB": 0,
        "16-32GB": 0,
        "32GB+": 0,
    }
    year_ranges: dict[str, int] = {}

    for gpu_info in gpu_data:
        vendor = str(gpu_info.get("vendor", "Unknown"))
        vendors[vendor] = vendors.get(vendor, 0) + 1

        memory = float(gpu_info.get("memory_gb") or 0)
        if memory < 4:
            memory_ranges["0-4GB"] += 1
        elif memory < 8:
            memory_ranges["4-8GB"] += 1
        elif memory < 16:
            memory_ranges["8-16GB"] += 1
        elif memory < 32:
            memory_ranges["16-32GB"] += 1
        else:
            memory_ranges["32GB+"] += 1

        launch_date = gpu_info.get("launch_date")
        if launch_date:
            try:
                year = int(str(launch_date)[:4])
                year_range = f"{year // 10 * 10}s"
                year_ranges[year_range] = year_ranges.get(year_range, 0) + 1
            except ValueError, IndexError:
                continue

    return GPUStats(
        total_gpus=len(gpu_data),
        vendors=vendors,
        memory_ranges=memory_ranges,
        year_ranges=year_ranges,
    )
