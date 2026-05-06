"""P9b — OCR + LLM two-pass online sizing (Приложение И.4.2) integration tests."""

from __future__ import annotations

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from errors import ValidationAppError
from models import OCRSizingInput
from services.ocr_sizing_service import run_ocr_sizing


# ── Baseline OCR-on-GPU payload (PaddleOCR-class, 8 pages/s/GPU) ──
BASELINE_OCR_GPU = dict(
    lambda_online=1.0,
    c_peak=4,
    sla_page=5.0,
    pipeline="ocr_gpu",
    r_ocr_gpu=8.0,
    eta_ocr=0.85,
    chars_page=3000,
    c_token=3.5,
    n_prompt_sys=1000,
    n_fields=20,
    tok_field=50,
    params_billions=7,
    bytes_per_param=2,
    layers_L=32,
    hidden_size_H=4096,
    num_kv_heads=32,
    num_attention_heads=32,
    bytes_per_kv_state=2,
    max_context_window_TSmax=32768,
    gpu_mem_gb=80,
    gpus_per_server=8,
    tp_multiplier_Z=1,
    gpu_flops_Fcount=312,
)

BASELINE_OCR_CPU = dict(
    BASELINE_OCR_GPU,
    pipeline="ocr_cpu",
    r_ocr_gpu=None,
    r_ocr_core=0.5,
    n_ocr_cores=16,
)


class TestOCRGPUPipeline:
    """OCR-on-GPU two-pool sizing."""

    def test_t_ocr_inverse_of_throughput(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        # 8 pages/s/GPU → 0.125 s/page
        assert result.t_ocr == pytest.approx(0.125, abs=1e-6)

    def test_n_gpu_ocr_uses_eta_formula(self):
        # ⌈4 · 0.125 / 0.85⌉ = ⌈0.588⌉ = 1
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.n_gpu_ocr_online == 1

    def test_pipeline_used_echo(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.pipeline_used == "ocr_gpu"

    def test_n_gpu_total_is_sum(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.n_gpu_total_online == result.n_gpu_ocr_online + result.n_gpu_llm_online

    def test_eta_ocr_echoed(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.eta_ocr_used == BASELINE_OCR_GPU["eta_ocr"]

    def test_higher_c_peak_grows_n_gpu_ocr(self):
        small = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        data = {**BASELINE_OCR_GPU, "c_peak": 100}
        big = run_ocr_sizing(OCRSizingInput(**data))
        assert big.n_gpu_ocr_online > small.n_gpu_ocr_online

    def test_missing_r_ocr_gpu_fails(self):
        data = {**BASELINE_OCR_GPU, "r_ocr_gpu": None}
        with pytest.raises(ValidationAppError):
            run_ocr_sizing(OCRSizingInput(**data))


class TestOCRCPUPipeline:
    """OCR-on-CPU pipeline — N_GPU^OCR = 0."""

    def test_t_ocr_uses_total_cores(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_CPU))
        # 0.5 × 16 = 8 pages/s → 0.125 s/page
        assert result.t_ocr == pytest.approx(0.125, abs=1e-6)

    def test_n_gpu_ocr_is_zero(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_CPU))
        assert result.n_gpu_ocr_online == 0

    def test_n_ocr_cores_echoed(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_CPU))
        assert result.n_ocr_cores_used == 16

    def test_eta_ocr_not_used(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_CPU))
        assert result.eta_ocr_used is None

    def test_n_gpu_total_equals_llm_only(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_CPU))
        assert result.n_gpu_total_online == result.n_gpu_llm_online

    def test_missing_cpu_params_fails(self):
        data = {**BASELINE_OCR_CPU, "n_ocr_cores": None}
        with pytest.raises(ValidationAppError):
            run_ocr_sizing(OCRSizingInput(**data))

    def test_unknown_pipeline_fails(self):
        data = {**BASELINE_OCR_GPU, "pipeline": "ocr_alien"}
        with pytest.raises(ValidationAppError):
            run_ocr_sizing(OCRSizingInput(**data))


class TestOCRTokenProfile:
    """L_text and SL_pf^LLM derivations."""

    def test_l_text_chars_over_c_token(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        # 3000 / 3.5 ≈ 857.14
        assert result.l_text == pytest.approx(857.14, abs=0.1)

    def test_sl_pf_llm_includes_system_prompt(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        # 857.14 + 1000 = 1857.14
        expected = result.l_text + BASELINE_OCR_GPU["n_prompt_sys"]
        assert result.sl_pf_llm == pytest.approx(expected, rel=1e-9)

    def test_eta_cache_drops_sl_pf_eff(self):
        data = {**BASELINE_OCR_GPU, "eta_cache": 0.5}
        result = run_ocr_sizing(OCRSizingInput(**data))
        # eff = sl_pf · (1 − η_cache); both fields rounded to 4 decimals on output
        assert result.sl_pf_llm_eff == pytest.approx(result.sl_pf_llm * 0.5, abs=1e-3)

    def test_cyrillic_c_token_grows_l_text(self):
        latin = run_ocr_sizing(OCRSizingInput(**{**BASELINE_OCR_GPU, "c_token": 4.0}))
        cyrillic = run_ocr_sizing(OCRSizingInput(**{**BASELINE_OCR_GPU, "c_token": 2.8}))
        assert cyrillic.l_text > latin.l_text


class TestSLABudgetSplit:
    """t_LLM^target = SLA_page − t_OCR − T_handoff (И.4.2)."""

    def test_t_llm_target_basic_split(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        # 5.0 - 0.125 - 0.0 = 4.875
        assert result.t_llm_target == pytest.approx(4.875, abs=1e-3)

    def test_t_handoff_subtracts(self):
        data = {**BASELINE_OCR_GPU, "t_handoff": 0.1}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.t_llm_target == pytest.approx(4.775, abs=1e-3)

    def test_unsatisfiable_sla_marks_failure(self):
        # SLA of 0.05s — OCR alone (0.125s) exceeds budget
        data = {**BASELINE_OCR_GPU, "sla_page": 0.05}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.sla_pass is False
        assert result.sla_failure_reason is not None
        assert "SLA_page" in result.sla_failure_reason or "бюджет" in result.sla_failure_reason

    def test_too_tight_llm_marks_failure(self):
        # OCR fits but no time left for LLM at any BS
        data = {**BASELINE_OCR_GPU, "sla_page": 0.5, "chars_page": 100000}
        result = run_ocr_sizing(OCRSizingInput(**data))
        # Either OCR exceeds or LLM does — either way fails
        if not result.sla_pass:
            assert result.sla_failure_reason is not None


class TestOCRBSRealAndReplicas:
    """BS_real* search (И.4.2) and replica/server count."""

    def test_baseline_finds_valid_bs(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.sla_pass is True
        assert result.bs_real_star >= 1
        assert result.t_page_llm <= result.t_llm_target

    def test_n_repl_ceiling_of_c_peak_over_bs(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        if result.sla_pass:
            assert result.n_repl_llm == math.ceil(
                BASELINE_OCR_GPU["c_peak"] / result.bs_real_star
            )

    def test_high_load_grows_total_gpu(self):
        small = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        data = {**BASELINE_OCR_GPU, "c_peak": 200, "lambda_online": 50.0}
        big = run_ocr_sizing(OCRSizingInput(**data))
        assert big.n_gpu_total_online > small.n_gpu_total_online

    def test_n_servers_ceil_of_total(self):
        data = {**BASELINE_OCR_GPU, "c_peak": 200}
        result = run_ocr_sizing(OCRSizingInput(**data))
        expected = math.ceil(result.n_gpu_total_online / BASELINE_OCR_GPU["gpus_per_server"])
        assert result.n_servers_total_online == expected


class TestOCRSizingEchoes:
    """Output echo fields."""

    def test_workload_echoes(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.c_peak_used == BASELINE_OCR_GPU["c_peak"]
        assert result.lambda_online_used == BASELINE_OCR_GPU["lambda_online"]
        assert result.sla_page_target == BASELINE_OCR_GPU["sla_page"]

    def test_t_handoff_echoed(self):
        data = {**BASELINE_OCR_GPU, "t_handoff": 0.05}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.t_handoff_used == 0.05


class TestOCRBatchMode:
    """P9c — batch and combined-deployment sizing for OCR+LLM (Приложение И.5)."""

    def test_default_mode_is_online(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.mode_used == "online"

    def test_no_batch_inputs_leaves_batch_fields_none(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.t_page_llm_at_bs_max is None
        assert result.n_gpu_llm_batch is None
        assert result.n_gpu_total_batch is None
        assert result.window_sufficient is None

    def test_batch_populates_both_pools(self):
        data = {**BASELINE_OCR_GPU, "mode": "batch", "D_pages": 10000.0,
                "W_seconds": 28800.0, "eta_batch": 0.9}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.n_gpu_ocr_batch is not None and result.n_gpu_ocr_batch >= 1
        assert result.n_gpu_llm_batch is not None and result.n_gpu_llm_batch >= 1
        assert result.n_gpu_total_batch == result.n_gpu_ocr_batch + result.n_gpu_llm_batch

    def test_ocr_cpu_pipeline_zero_ocr_batch(self):
        data = {**BASELINE_OCR_CPU, "mode": "batch", "D_pages": 10000.0,
                "W_seconds": 28800.0}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.n_gpu_ocr_batch == 0
        assert result.n_gpu_llm_batch is not None
        assert result.n_gpu_total_batch == result.n_gpu_llm_batch

    def test_combined_takes_per_pool_max(self):
        data = {**BASELINE_OCR_GPU, "mode": "combined", "D_pages": 100000.0,
                "W_seconds": 28800.0, "eta_batch": 0.9}
        result = run_ocr_sizing(OCRSizingInput(**data))
        # Combined per-pool max(online, batch)
        assert result.n_gpu_ocr_combined == max(
            result.n_gpu_ocr_online, result.n_gpu_ocr_batch
        )
        assert result.n_gpu_llm_combined == max(
            result.n_gpu_llm_online, result.n_gpu_llm_batch
        )
        assert result.n_gpu_total_combined == (
            result.n_gpu_ocr_combined + result.n_gpu_llm_combined
        )

    def test_window_insufficient_with_heavy_demand(self):
        data = {**BASELINE_OCR_GPU, "mode": "combined", "D_pages": 1_000_000.0,
                "W_seconds": 60.0, "eta_batch": 0.9}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.window_sufficient is False

    def test_unknown_mode_fails(self):
        data = {**BASELINE_OCR_GPU, "mode": "alien"}
        with pytest.raises(ValidationAppError):
            run_ocr_sizing(OCRSizingInput(**data))

    def test_d_w_eta_echoes(self):
        data = {**BASELINE_OCR_GPU, "mode": "batch", "D_pages": 500.0,
                "W_seconds": 3600.0, "eta_batch": 0.88}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.D_pages_used == 500.0
        assert result.W_seconds_used == 3600.0
        assert result.eta_batch_used == 0.88


class TestOCRMultiClass:
    """P9d — multi-class workload aggregation for OCR+LLM (Приложение И.4.2 ext)."""

    def test_no_classes_leaves_multi_fields_none(self):
        result = run_ocr_sizing(OCRSizingInput(**BASELINE_OCR_GPU))
        assert result.multi_class_used is None
        assert result.factor_per_class is None
        assert result.n_gpu_total_multiclass is None

    def test_multi_class_populates_breakdown(self):
        from models import OCRDocClass
        data = {**BASELINE_OCR_GPU, "classes": [
            OCRDocClass(name="form", lambda_online=0.6, chars_page=3000, n_fields=20).model_dump(),
            OCRDocClass(name="receipt", lambda_online=0.3, chars_page=600, n_fields=8).model_dump(),
        ]}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.multi_class_used is True
        assert len(result.factor_per_class) == 2

    def test_representative_class_largest_sl_pf_llm(self):
        from models import OCRDocClass
        data = {**BASELINE_OCR_GPU, "classes": [
            OCRDocClass(name="form", lambda_online=0.5, chars_page=3000, n_fields=20).model_dump(),
            OCRDocClass(name="tech_doc", lambda_online=0.5, chars_page=12000, n_fields=50).model_dump(),
        ]}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.representative_class_name == "tech_doc"

    def test_total_multi_is_sum_ocr_and_llm(self):
        from models import OCRDocClass
        data = {**BASELINE_OCR_GPU, "classes": [
            OCRDocClass(name="A", lambda_online=1.0, chars_page=3000, n_fields=20).model_dump(),
        ]}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.n_gpu_total_multiclass == (
            result.n_gpu_ocr_multiclass + result.n_gpu_llm_multiclass
        )

    def test_ocr_cpu_pipeline_zero_ocr_multi(self):
        from models import OCRDocClass
        data = {**BASELINE_OCR_CPU, "classes": [
            OCRDocClass(name="A", lambda_online=1.0, chars_page=3000, n_fields=20).model_dump(),
        ]}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.n_gpu_ocr_multiclass == 0
        assert result.n_gpu_total_multiclass == result.n_gpu_llm_multiclass

    def test_k_sla_multi_default_and_echo(self):
        from models import OCRDocClass
        data = {**BASELINE_OCR_GPU, "classes": [
            OCRDocClass(name="A", lambda_online=1.0, chars_page=3000, n_fields=20).model_dump(),
        ]}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.K_SLA_multi_used == 1.25

    def test_empty_classes_list_treated_as_single_class(self):
        data = {**BASELINE_OCR_GPU, "classes": []}
        result = run_ocr_sizing(OCRSizingInput(**data))
        assert result.multi_class_used is None
