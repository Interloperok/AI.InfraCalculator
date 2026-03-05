"""
Тесты расчёта серверов — на основании эталонного Excel-калькулятора.

Все ожидаемые значения взяты из скриншотов Excel:
- 500 000 пользователей, 32B модель, 80 GiB GPU × 8, Z=4
- MRT=0 (без reasoning tokens)
- Результат: 23 сервера (по памяти = 23, по compute = 5)
"""

import math
import sys
import os
import pytest

# Добавляем app/ в путь для импорта
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (
    calc_Ssim,
    calc_T,
    calc_model_mem_gb,
    calc_session_context_TS,
    calc_SL,
    calc_kv_per_session_gb,
    calc_gpus_per_instance,
    calc_instances_per_server,
    calc_kv_free_per_instance_gb,
    calc_S_TP,
    calc_Kbatch,
    calc_instances_per_server_tp,
    calc_sessions_per_server,
    calc_servers_by_memory,
    calc_FPS,
    calc_Tdec,
    calc_th_prefill_analyt,
    calc_th_decode_analyt,
    calc_Cmodel,
    calc_th_server_comp,
    calc_servers_by_compute,
    calc_ttft,
    calc_generation_time,
    calc_e2e_latency,
    run_sizing,
)
from models.sizing import SizingInput


# ═══════════════════════════════════════════════════════════
# Эталонные входные данные из Excel
# ═══════════════════════════════════════════════════════════

EXCEL_INPUT = dict(
    # Пользователи (Сегмент 1)
    internal_users=500_000,
    penetration_internal=0.1,
    concurrency_internal=0.05,
    external_users=0,
    penetration_external=0.0,
    concurrency_external=0.0,
    sessions_per_user_J=1,
    # Токены
    system_prompt_tokens_SP=1000,
    user_prompt_tokens_Prp=200,
    reasoning_tokens_MRT=0,       # MRT = 0 (модель без reasoning)
    answer_tokens_A=400,
    dialog_turns=5,               # N_prp = 5
    # Модель
    params_billions=32,
    bytes_per_param=2,
    safe_margin=5.0,              # SM = 5 GiB (safe margin)
    emp_model=1.0,
    layers_L=64,
    hidden_size_H=4096,
    # KV-cache
    num_kv_heads=32,
    num_attention_heads=32,
    bytes_per_kv_state=2,
    emp_kv=1.0,
    max_context_window_TSmax=32768,
    # Hardware & TP
    gpu_mem_gb=80,
    gpus_per_server=8,
    kavail=0.9,
    tp_multiplier_Z=4,
    saturation_coeff_C=10.0,      # C = 10 (Excel)
    # Compute
    gpu_flops_Fcount=312,         # 312 TFLOPS (A100 FP16)
    eta_prefill=0.20,
    eta_decode=0.15,
    # SLA
    rps_per_session_R=0.02,
    sla_reserve_KSLA=1.25,
)


# ═══════════════════════════════════════════════════════════
# Эталонные промежуточные и итоговые значения из Excel
# ═══════════════════════════════════════════════════════════

EXCEL_EXPECTED = dict(
    # Section 2
    Ssim=2500.0,
    T=1600.0,
    # Section 3 (Mmodel = (P×10⁹×Bquant/1024³)×EMPmodel + SM)
    Mmodel_gb=64.60464477539062,  # (32e9 × 2 / 1024³) × 1.0 + 5.0
    TS=4000.0,                    # SP + 5 × (200 + 0 + 400)
    SL=4000.0,                    # min(4000, 32768)
    MKV_gb=3.90625,               # 2 × 64 × 4096 × 4000 × 2 × 1 / 1024³
    # Section 4
    GPUcount_model=1,
    Ncount_model=8,
    kv_free_base_gb=7.395355224609375,  # 1 × 80 × 0.9 − 64.605...
    S_TP_min=1,                   # floor(7.395 / 3.906)
    S_TP_Z=57,                    # floor(223.395 / 3.906)
    Kbatch=9.35820895522388,      # (57/1) × ((1+10)/(57+10))
    # Section 5
    NcountTP=2,                   # floor(8 / (4 × 1))
    Sserver=114,                  # 2 × 57
    Servers_mem=22,               # ceil(2500 / 114)
    # Section 6
    FPS=64_000_000_000.0,         # 2 × 32 × 10⁹
    Tdec=400.0,                   # A + MRT = 400 + 0
    Fcount_model_tflops=312.0,    # 1 × 312
    th_prefill=8563.064721739373, # аналитический расчёт
    th_decode=6402.657929509471,  # аналитический расчёт
    Cmodel=1.888229890920555,     # 1 / (SL/Th_pf + Tdec/Th_dec)
    th_server_comp=3.77645978184111,   # NcountTP × Cmodel = 2 × 1.888 (изм.8)
    Servers_comp=17,              # ceil(2500 × 0.02 × 1.25 / 3.776)
    # Section 8
    Servers_final=22,
)


# ═══════════════════════════════════════════════════════════
# Тесты отдельных формул
# ═══════════════════════════════════════════════════════════

class TestSection2LoadCalculation:
    """Раздел 2: Определение нагрузки"""

    def test_Ssim(self):
        result = calc_Ssim(500_000, 0.1, 0.05, 0, 0.0, 0.0, 1)
        assert result == EXCEL_EXPECTED["Ssim"]

    def test_T(self):
        result = calc_T(1000, 200, 0, 400)
        assert result == EXCEL_EXPECTED["T"]


class TestSection3Memory:
    """Раздел 3: Память GPU"""

    def test_model_memory(self):
        result = calc_model_mem_gb(32, 2, 1.0, 5.0)
        assert result == pytest.approx(EXCEL_EXPECTED["Mmodel_gb"], rel=1e-6)

    def test_session_context_TS(self):
        result = calc_session_context_TS(1000, 200, 0, 400, 5)
        assert result == EXCEL_EXPECTED["TS"]

    def test_sequence_length_SL(self):
        result = calc_SL(4000, 32768)
        assert result == EXCEL_EXPECTED["SL"]

    def test_sequence_length_SL_capped(self):
        """SL не может превышать TS_max"""
        result = calc_SL(50000, 32768)
        assert result == 32768

    def test_kv_per_session(self):
        result = calc_kv_per_session_gb(64, 4096, 4000, 2, 1.0, 32, 32)
        assert result == pytest.approx(EXCEL_EXPECTED["MKV_gb"], rel=1e-6)


class TestSection4GpuTP:
    """Раздел 4: GPU и Tensor Parallelism"""

    def test_gpus_per_instance(self):
        result = calc_gpus_per_instance(EXCEL_EXPECTED["Mmodel_gb"], 80, 0.9)
        assert result == EXCEL_EXPECTED["GPUcount_model"]

    def test_instances_per_server(self):
        result = calc_instances_per_server(8, 1)
        assert result == EXCEL_EXPECTED["Ncount_model"]

    def test_kv_free_per_instance_base(self):
        Mmodel = EXCEL_EXPECTED["Mmodel_gb"]
        result = calc_kv_free_per_instance_gb(1, 80, 0.9, Mmodel)
        assert result == pytest.approx(EXCEL_EXPECTED["kv_free_base_gb"], rel=1e-6)

    def test_S_TP_min(self):
        kv_free = EXCEL_EXPECTED["kv_free_base_gb"]
        mkv = EXCEL_EXPECTED["MKV_gb"]
        result = calc_S_TP(kv_free, mkv)
        assert result == EXCEL_EXPECTED["S_TP_min"]

    def test_S_TP_Z(self):
        Mmodel = EXCEL_EXPECTED["Mmodel_gb"]
        Z = 4
        kv_free_z = calc_kv_free_per_instance_gb(Z * 1, 80, 0.9, Mmodel)
        mkv = EXCEL_EXPECTED["MKV_gb"]
        result = calc_S_TP(kv_free_z, mkv)
        assert result == EXCEL_EXPECTED["S_TP_Z"]

    def test_Kbatch(self):
        result = calc_Kbatch(EXCEL_EXPECTED["S_TP_Z"], EXCEL_EXPECTED["S_TP_min"], 10)
        assert result == pytest.approx(EXCEL_EXPECTED["Kbatch"], rel=1e-6)

    def test_Kbatch_no_tp(self):
        """При Z=1: S_TP_z == S_TP_base → Kbatch = 1.0"""
        result = calc_Kbatch(4, 4, 8)
        assert result == 1.0


class TestSection5ServersByMemory:
    """Раздел 5: Серверы по памяти"""

    def test_instances_per_server_tp(self):
        result = calc_instances_per_server_tp(8, 1, 4)
        assert result == EXCEL_EXPECTED["NcountTP"]

    def test_sessions_per_server(self):
        result = calc_sessions_per_server(EXCEL_EXPECTED["NcountTP"], EXCEL_EXPECTED["S_TP_Z"])
        assert result == EXCEL_EXPECTED["Sserver"]

    def test_servers_by_memory(self):
        result = calc_servers_by_memory(EXCEL_EXPECTED["Ssim"], EXCEL_EXPECTED["Sserver"])
        assert result == EXCEL_EXPECTED["Servers_mem"]


class TestSection6Compute:
    """Раздел 6: Серверы по вычислительной мощности"""

    def test_FPS(self):
        result = calc_FPS(32)
        assert result == EXCEL_EXPECTED["FPS"]

    def test_Tdec(self):
        result = calc_Tdec(400, 0)
        assert result == EXCEL_EXPECTED["Tdec"]

    def test_th_prefill_analyt(self):
        Fcount_flops = 312 * 1e12 * 1  # 312 TFLOPS × 1 GPU
        result = calc_th_prefill_analyt(
            Fcount_flops, 0.20, EXCEL_EXPECTED["Kbatch"],
            64e9, 64, 4096, 4000
        )
        assert result == pytest.approx(EXCEL_EXPECTED["th_prefill"], rel=1e-4)

    def test_th_decode_analyt(self):
        Fcount_flops = 312 * 1e12 * 1
        result = calc_th_decode_analyt(
            Fcount_flops, 0.15, EXCEL_EXPECTED["Kbatch"],
            64e9, 64, 4096, 4000, 400
        )
        assert result == pytest.approx(EXCEL_EXPECTED["th_decode"], rel=1e-4)

    def test_Cmodel(self):
        """Cmodel использует SL (не TS!)"""
        result = calc_Cmodel(
            4000,
            EXCEL_EXPECTED["th_prefill"],
            400,
            EXCEL_EXPECTED["th_decode"]
        )
        assert result == pytest.approx(EXCEL_EXPECTED["Cmodel"], rel=1e-4)

    def test_th_server_comp(self):
        """Th_server = NcountTP × Cmodel (раздел 6.3, изм.8: N_model_TP=Z)"""
        result = calc_th_server_comp(EXCEL_EXPECTED["NcountTP"], EXCEL_EXPECTED["Cmodel"])
        assert result == pytest.approx(EXCEL_EXPECTED["th_server_comp"], rel=1e-4)

    def test_servers_by_compute(self):
        result = calc_servers_by_compute(
            EXCEL_EXPECTED["Ssim"], 0.02, 1.25, EXCEL_EXPECTED["th_server_comp"]
        )
        assert result == EXCEL_EXPECTED["Servers_comp"]


# ═══════════════════════════════════════════════════════════
# Интеграционный тест: полный pipeline
# ═══════════════════════════════════════════════════════════

class TestFullPipeline:
    """Полный расчёт должен совпадать с Excel"""

    @pytest.fixture
    def excel_result(self):
        inp = SizingInput(**EXCEL_INPUT)
        return run_sizing(inp)

    def test_Ssim(self, excel_result):
        assert excel_result.Ssim_concurrent_sessions == EXCEL_EXPECTED["Ssim"]

    def test_T(self, excel_result):
        assert excel_result.T_tokens_per_request == EXCEL_EXPECTED["T"]

    def test_model_mem(self, excel_result):
        assert excel_result.model_mem_gb == pytest.approx(EXCEL_EXPECTED["Mmodel_gb"], rel=1e-6)

    def test_TS(self, excel_result):
        assert excel_result.TS_session_context == EXCEL_EXPECTED["TS"]

    def test_SL(self, excel_result):
        assert excel_result.SL_sequence_length == EXCEL_EXPECTED["SL"]

    def test_kv_per_session(self, excel_result):
        assert excel_result.kv_per_session_gb == pytest.approx(EXCEL_EXPECTED["MKV_gb"], rel=1e-6)

    def test_gpus_per_instance(self, excel_result):
        assert excel_result.gpus_per_instance == EXCEL_EXPECTED["GPUcount_model"]

    def test_instances_per_server(self, excel_result):
        assert excel_result.instances_per_server == EXCEL_EXPECTED["Ncount_model"]

    def test_S_TP_base(self, excel_result):
        assert excel_result.S_TP_base == EXCEL_EXPECTED["S_TP_min"]

    def test_S_TP_z(self, excel_result):
        assert excel_result.S_TP_z == EXCEL_EXPECTED["S_TP_Z"]

    def test_Kbatch(self, excel_result):
        assert excel_result.Kbatch == pytest.approx(EXCEL_EXPECTED["Kbatch"], rel=1e-6)

    def test_instances_per_server_tp(self, excel_result):
        assert excel_result.instances_per_server_tp == EXCEL_EXPECTED["NcountTP"]

    def test_sessions_per_server(self, excel_result):
        assert excel_result.sessions_per_server == EXCEL_EXPECTED["Sserver"]

    def test_servers_by_memory(self, excel_result):
        assert excel_result.servers_by_memory == EXCEL_EXPECTED["Servers_mem"]

    def test_gpu_tflops_used(self, excel_result):
        assert excel_result.gpu_tflops_used == 312.0

    def test_Fcount_model_tflops(self, excel_result):
        assert excel_result.Fcount_model_tflops == EXCEL_EXPECTED["Fcount_model_tflops"]

    def test_FPS(self, excel_result):
        assert excel_result.FPS_flops_per_token == EXCEL_EXPECTED["FPS"]

    def test_Tdec(self, excel_result):
        assert excel_result.Tdec_tokens == EXCEL_EXPECTED["Tdec"]

    def test_th_prefill(self, excel_result):
        assert excel_result.th_prefill == pytest.approx(EXCEL_EXPECTED["th_prefill"], rel=1e-4)

    def test_th_decode(self, excel_result):
        assert excel_result.th_decode == pytest.approx(EXCEL_EXPECTED["th_decode"], rel=1e-4)

    def test_Cmodel(self, excel_result):
        assert excel_result.Cmodel_rps == pytest.approx(EXCEL_EXPECTED["Cmodel"], rel=1e-4)

    def test_th_server_comp(self, excel_result):
        assert excel_result.th_server_comp == pytest.approx(EXCEL_EXPECTED["th_server_comp"], rel=1e-4)

    def test_servers_by_compute(self, excel_result):
        assert excel_result.servers_by_compute == EXCEL_EXPECTED["Servers_comp"]

    def test_servers_final(self, excel_result):
        assert excel_result.servers_final == EXCEL_EXPECTED["Servers_final"]


# ═══════════════════════════════════════════════════════════
# Дополнительные тесты: граничные случаи
# ═══════════════════════════════════════════════════════════

class TestEdgeCases:
    """Граничные случаи и инварианты"""

    def test_servers_final_is_max_of_memory_and_compute(self):
        """Итог = max(по памяти, по compute)"""
        inp = SizingInput(**EXCEL_INPUT)
        result = run_sizing(inp)
        assert result.servers_final == max(
            result.servers_by_memory, result.servers_by_compute
        )

    def test_with_reasoning_tokens(self):
        """С MRT > 0 значения должны существенно отличаться"""
        data = {**EXCEL_INPUT, "reasoning_tokens_MRT": 4096}
        inp = SizingInput(**data)
        result = run_sizing(inp)
        # С reasoning: TS = 1000 + 5*(200+4096+400) = 24480 — гораздо больше
        assert result.TS_session_context == 24480.0
        assert result.kv_per_session_gb > EXCEL_EXPECTED["MKV_gb"]
        # Больше памяти → больше серверов
        assert result.servers_by_memory > EXCEL_EXPECTED["Servers_mem"]

    def test_Z1_Kbatch_equals_1(self):
        """При Z=1 Kbatch должен быть ровно 1.0"""
        data = {**EXCEL_INPUT, "tp_multiplier_Z": 1}
        inp = SizingInput(**data)
        result = run_sizing(inp)
        assert result.Kbatch == 1.0

    def test_SL_capped_by_TSmax(self):
        """SL не превышает TSmax"""
        data = {**EXCEL_INPUT, "max_context_window_TSmax": 2000}
        inp = SizingInput(**data)
        result = run_sizing(inp)
        # TS = 4000, TSmax = 2000 → SL = 2000
        assert result.SL_sequence_length == 2000

    def test_zero_users_zero_servers(self):
        """При 0 пользователях: 0 серверов"""
        data = {**EXCEL_INPUT, "internal_users": 0}
        inp = SizingInput(**data)
        result = run_sizing(inp)
        assert result.Ssim_concurrent_sessions == 0
        assert result.servers_final == 0
