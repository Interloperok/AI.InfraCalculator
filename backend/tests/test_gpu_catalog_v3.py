"""P13 — GPU catalog regression: verify v3 data-center SKUs are present.

Without these entries, /v1/gpus and auto-optimize cannot recommend modern
LLM/VLM accelerators. Specs are sourced from NVIDIA / AMD published
datasheets — see commit message and gpu_data.json comments.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


GPU_DATA = Path(__file__).parent.parent / "gpu_data.json"


@pytest.fixture(scope="module")
def catalog():
    return json.loads(GPU_DATA.read_text(encoding="utf-8"))


def _find(catalog, gpu_id):
    matches = [g for g in catalog if g["id"] == gpu_id]
    if not matches:
        pytest.fail(f"GPU id {gpu_id!r} not found in catalog")
    return matches[0]


class TestRequiredDataCenterGPUs:
    """Each entry must be present and have plausible numeric specs."""

    @pytest.mark.parametrize(
        "gpu_id, min_mem_gb, min_bw_gbs, min_fp16_tflops",
        [
            # Hopper — already in catalog
            ("nvidia-h100-gpu-accelerator-sxm-card", 80.0, 3000.0, 900.0),
            ("nvidia-h200-gpu-accelerator-sxm-card", 141.0, 4500.0, 900.0),
            # Blackwell — added in P13
            ("nvidia-b200-gpu-accelerator-sxm-card", 180.0, 7500.0, 2000.0),
            ("nvidia-b200-gpu-accelerator-pcie-card", 180.0, 7500.0, 2000.0),
            ("nvidia-b300-gpu-accelerator-sxm-card", 250.0, 7500.0, 2000.0),
            ("nvidia-gh200-grace-hopper-superchip-144gb", 144.0, 4500.0, 900.0),
            # Server-edition Blackwell — added in P13
            ("nvidia-rtx-pro-6000-blackwell-server-edition", 96.0, 1500.0, 200.0),
            # AMD — already in catalog
            ("amd-amd-instinct-mi300x-aqua-vanjaram", 192.0, 5000.0, 1300.0),
        ],
    )
    def test_gpu_present_with_sane_specs(
        self, catalog, gpu_id, min_mem_gb, min_bw_gbs, min_fp16_tflops
    ):
        gpu = _find(catalog, gpu_id)
        assert gpu["memory_gb"] >= min_mem_gb, (
            f"{gpu_id} has {gpu['memory_gb']} GB, expected >= {min_mem_gb}"
        )
        assert gpu["memory_bandwidth_gbs"] >= min_bw_gbs, (
            f"{gpu_id} has {gpu['memory_bandwidth_gbs']} GB/s, expected >= {min_bw_gbs}"
        )
        assert gpu["tflops_fp16"] >= min_fp16_tflops, (
            f"{gpu_id} has {gpu['tflops_fp16']} TFLOPS FP16, expected >= {min_fp16_tflops}"
        )


class TestCatalogIntegrity:
    """Catalog-wide invariants."""

    def test_no_duplicate_ids(self, catalog):
        ids = [g["id"] for g in catalog]
        assert len(ids) == len(set(ids)), "Duplicate IDs in gpu_data.json"

    def test_blackwell_skus_present(self, catalog):
        # P13 exit criterion: B200 + B300 SXM entries surfaced
        ids = {g["id"] for g in catalog}
        assert "nvidia-b200-gpu-accelerator-sxm-card" in ids
        assert "nvidia-b300-gpu-accelerator-sxm-card" in ids

    def test_b200_higher_bandwidth_than_h200(self, catalog):
        # Sanity: Blackwell HBM3e bandwidth > Hopper HBM3e bandwidth
        b200 = _find(catalog, "nvidia-b200-gpu-accelerator-sxm-card")
        h200 = _find(catalog, "nvidia-h200-gpu-accelerator-sxm-card")
        assert b200["memory_bandwidth_gbs"] > h200["memory_bandwidth_gbs"]

    def test_b300_more_memory_than_b200(self, catalog):
        # Blackwell Ultra's signature: 12-high HBM3e stacks → more memory
        b200 = _find(catalog, "nvidia-b200-gpu-accelerator-sxm-card")
        b300 = _find(catalog, "nvidia-b300-gpu-accelerator-sxm-card")
        assert b300["memory_gb"] > b200["memory_gb"]
