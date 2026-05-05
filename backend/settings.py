from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from core.methodology_constants import (
    C_SAT_DEFAULT,
    ETA_CACHE_DEFAULT,
    ETA_DEC_DEFAULT,
    ETA_MEM_DEFAULT,
    ETA_PF_DEFAULT,
    K_SPEC_DEFAULT,
    O_FIXED_DEFAULT,
    T_OVERHEAD_DEFAULT,
)

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


@dataclass(frozen=True, slots=True)
class AppSettings:
    """Типизированные настройки backend из переменных окружения."""

    app_env: str
    log_level: str
    disable_scheduler: bool
    gpu_refresh_interval_hours: int
    backend_dir: Path
    gpu_data_path: Path

    # Methodology v3 calibration overrides — declared for operator override at
    # deploy time; not yet consumed by sizing_service (will be wired in
    # subsequent v3 phases per docs/CHANGELOG).
    eta_pf: float
    eta_dec: float
    eta_mem: float
    c_sat: float
    t_overhead: float
    eta_cache: float
    k_spec: float
    o_fixed: float


def _parse_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False

    raise ValueError(f"Environment variable {name} must be boolean-like, got: {value!r}")


def _parse_positive_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default

    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be integer, got: {value!r}") from exc

    if parsed <= 0:
        raise ValueError(f"Environment variable {name} must be > 0, got: {parsed}")

    return parsed


def _parse_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default

    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be float, got: {value!r}") from exc


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    """Вернуть кэшированные настройки приложения."""
    backend_dir = Path(__file__).resolve().parent

    return AppSettings(
        app_env=os.getenv("AI_SC_ENV", "dev"),
        log_level=os.getenv("AI_SC_LOG_LEVEL", "INFO"),
        disable_scheduler=_parse_bool_env("AI_SC_DISABLE_SCHEDULER", default=False),
        gpu_refresh_interval_hours=_parse_positive_int_env(
            "AI_SC_GPU_REFRESH_INTERVAL_HOURS",
            default=1,
        ),
        backend_dir=backend_dir,
        gpu_data_path=backend_dir / "gpu_data.json",
        eta_pf=_parse_float_env("AI_SC_ETA_PF", ETA_PF_DEFAULT),
        eta_dec=_parse_float_env("AI_SC_ETA_DEC", ETA_DEC_DEFAULT),
        eta_mem=_parse_float_env("AI_SC_ETA_MEM", ETA_MEM_DEFAULT),
        c_sat=_parse_float_env("AI_SC_C_SAT", C_SAT_DEFAULT),
        t_overhead=_parse_float_env("AI_SC_T_OVERHEAD", T_OVERHEAD_DEFAULT),
        eta_cache=_parse_float_env("AI_SC_ETA_CACHE", ETA_CACHE_DEFAULT),
        k_spec=_parse_float_env("AI_SC_K_SPEC", K_SPEC_DEFAULT),
        o_fixed=_parse_float_env("AI_SC_O_FIXED", O_FIXED_DEFAULT),
    )
