"""Single-source catalogs: GPU overlay, quantization constants, frontend export."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.methodology_constants import QUANTIZATION_FORMATS, QUANTIZATION_LABELS  # noqa: E402
from models.sizing import SizingInput  # noqa: E402
from services.gpu_catalog_service import (  # noqa: E402
    apply_gpu_overrides,
    load_gpu_catalog,
    load_gpu_overrides,
    lookup_gpu_bandwidth_gbs,
    lookup_gpu_tflops,
)
from tests.test_sizing import EXCEL_INPUT  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


def _by_id():
    return {g["id"]: g for g in load_gpu_catalog()}


class TestGpuOverlay:
    def test_mi35x_memory_fixed(self):
        catalog = _by_id()
        for gpu_id in ("amd-amd-instinct-mi350x", "amd-amd-instinct-mi355x"):
            assert catalog[gpu_id]["memory_gb"] == 288.0
            assert catalog[gpu_id]["tflops_fp16"] > 2000

    def test_h800_has_tflops(self):
        assert lookup_gpu_tflops("nvidia-h800-gpu-accelerator-sxm-card", 80) == 989.5

    @pytest.mark.parametrize(
        "gpu_id,mem,tflops,bw",
        [
            ("nvidia-a100-sxm4-80gb", 80, 312, 2039),
            ("nvidia-a100-pcie-40gb", 40, 312, 1555),
            ("nvidia-l40s", 48, 362.05, 864),
            ("nvidia-h20", 96, 148, 4000),
            ("amd-instinct-mi325x", 256, 1307.4, 6000),
            ("nvidia-v100s-pcie-32gb", 32, 130, 1134),
        ],
    )
    def test_additions(self, gpu_id, mem, tflops, bw):
        gpu = _by_id()[gpu_id]
        assert gpu["memory_gb"] == mem
        assert lookup_gpu_tflops(gpu_id, mem) == tflops
        assert lookup_gpu_bandwidth_gbs(gpu_id) == bw

    def test_every_override_has_source(self):
        overrides = load_gpu_overrides()
        for item in overrides["patches"] + overrides["additions"]:
            assert item.get("sources"), item["id"]

    def test_overlay_survives_catalog_refresh(self):
        raw = json.loads((BACKEND / "gpu_data.json").read_text(encoding="utf-8"))
        merged = apply_gpu_overrides(raw, load_gpu_overrides())
        assert len(merged) == len(raw) + len(load_gpu_overrides()["additions"])

    def test_unknown_gpu_id_has_no_memory_fallback(self):
        assert lookup_gpu_tflops("no-such-gpu", 141) == 0.0
        # memory fallback only without gpu_id
        assert lookup_gpu_tflops(None, 141) > 0


class TestQuantization:
    def test_frontend_export_in_sync(self):
        from scripts.export_methodology_constants import TARGET, render

        assert TARGET.read_text(encoding="utf-8") == render(), (
            "frontend/src/data/quantization.json is stale: "
            "run python backend/scripts/export_methodology_constants.py"
        )

    def test_labels_cover_methodology_table(self):
        assert {"FP32", "FP16", "BF16", "FP8", "FP4", "INT4"} <= set(QUANTIZATION_LABELS)
        assert len(QUANTIZATION_FORMATS) == len(QUANTIZATION_LABELS)

    def test_label_must_match_bytes(self):
        SizingInput(**{**EXCEL_INPUT, "quantization": "BF16"})
        with pytest.raises(ValueError):
            SizingInput(**{**EXCEL_INPUT, "quantization": "FP8"})
        with pytest.raises(ValueError):
            SizingInput(**{**EXCEL_INPUT, "quantization": "FP7"})
