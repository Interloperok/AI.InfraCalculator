from dataclasses import dataclass

@dataclass
class SizingInput:
    # Users & behavior
    internal_users: int
    penetration_internal: float      # 0..1
    concurrency_internal: float      # 0..1
    external_users: int
    penetration_external: float      # 0..1
    concurrency_external: float      # 0..1

    # Tokens & sessions
    prompt_tokens_P: float           # e.g. 350
    answer_tokens_A: float           # e.g. 200
    rps_per_active_user_R: float     # e.g. 0.05
    session_duration_sec_t: float    # e.g. 300

    # Model & KV
    params_billions: float           # e.g. 7
    bytes_per_param: float           # 1,2,4
    overhead_factor: float           # 1.1..1.2
    layers_L: int
    hidden_size_H: int
    bytes_per_kv_state: float        # 1,2,4
    paged_attention_gain_Kopt: float # >=1

    # Hardware
    gpu_mem_gb: float                # e.g. 80
    gpus_per_server: int             # e.g. 8
    mem_reserve_fraction: float      # 0..1 (e.g. 0.07)

    # Empirics
    tps_per_instance: float          # tokens/sec per instance
    batching_coeff: float            # e.g. 1.2
    sla_reserve: float               # e.g. 1.25
