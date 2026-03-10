"""Coverage-focused tests for GPU model validators."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from models.gpu import GPUFilter


def test_gpu_filter_accepts_valid_memory_range() -> None:
    gpu_filter = GPUFilter(min_memory_gb=16.0, max_memory_gb=24.0)
    assert gpu_filter.min_memory_gb == 16.0
    assert gpu_filter.max_memory_gb == 24.0


def test_gpu_filter_rejects_invalid_memory_range() -> None:
    with pytest.raises(ValidationError):
        GPUFilter(min_memory_gb=32.0, max_memory_gb=24.0)


def test_gpu_filter_accepts_valid_year_range() -> None:
    gpu_filter = GPUFilter(min_year=2019, max_year=2022)
    assert gpu_filter.min_year == 2019
    assert gpu_filter.max_year == 2022


def test_gpu_filter_rejects_invalid_year_range() -> None:
    with pytest.raises(ValidationError):
        GPUFilter(min_year=2024, max_year=2022)
