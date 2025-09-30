from dataclasses import dataclass

@dataclass
class SizingOutput:
    total_active_users: float
    T_tokens_per_request: float
    required_RPS: float
    model_mem_gb: float
    gpus_per_instance: int
    instances_per_server: int
    kv_per_session_gb_opt: float
    sessions_per_server: int
    servers_by_memory: int
    rps_per_server: float
    servers_by_compute: int
    servers_final: int
