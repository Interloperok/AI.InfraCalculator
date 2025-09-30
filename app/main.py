from __future__ import annotations

import math
import logging
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, conint, confloat, validator

logger = logging.getLogger("sizing")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)

class SizingInput(BaseModel):
    internal_users: conint(ge=0)
    penetration_internal: confloat(ge=0.0, le=1.0)
    concurrency_internal: confloat(ge=0.0, le=1.0)
    external_users: conint(ge=0) = 0
    penetration_external: confloat(ge=0.0, le=1.0) = 0.0
    concurrency_external: confloat(ge=0.0, le=1.0) = 0.0
    prompt_tokens_P: confloat(gt=0)
    answer_tokens_A: confloat(ge=0)
    rps_per_active_user_R: confloat(gt=0)
    session_duration_sec_t: confloat(gt=0)
    params_billions: confloat(gt=0)
    bytes_per_param: confloat(gt=0)
    overhead_factor: confloat(ge=1.0)
    layers_L: conint(gt=0)
    hidden_size_H: conint(gt=0)
    bytes_per_kv_state: confloat(gt=0)
    paged_attention_gain_Kopt: confloat(ge=1.0)
    gpu_mem_gb: confloat(gt=0)
    gpus_per_server: conint(gt=0)
    mem_reserve_fraction: confloat(ge=0.0, lt=1.0) = 0.07
    tps_per_instance: confloat(gt=0)
    batching_coeff: confloat(gt=0) = 1.2
    sla_reserve: confloat(gt=0) = 1.25

class SizingOutput(BaseModel):
    total_active_users: float
    T_tokens_per_request: float
    required_RPS: float
    tokens_per_session_TS: float
    model_mem_gb: float
    gpus_per_instance: int
    instances_per_server: int
    kv_per_session_gb_no_opt: float
    kv_per_session_gb_opt: float
    kv_free_per_instance_gb: float
    sessions_per_instance: int
    sessions_per_server: int
    servers_by_memory: int
    rps_per_instance: float
    rps_per_server: float
    servers_by_compute: int
    servers_final: int

class WhatIfScenario(BaseModel):
    name: str
    overrides: dict = {}

class WhatIfRequest(BaseModel):
    base: SizingInput
    scenarios: List[WhatIfScenario]

def calc_total_active(iu, pin, cin, eu, pex, cex):
    return iu*pin*cin + eu*pex*cex
def calc_tokens_per_request(P,A): return P+A
def calc_required_rps(total_active, R): return total_active * R
def calc_tokens_per_session(t, R, T): return t * R * T
def calc_model_mem_gb(params_b, bytes_per_param, overhead): 
    return (params_b * 1_000_000_000 * bytes_per_param * overhead) / (1024**3)
def calc_gpus_per_instance(model_mem_gb, gpu_mem_gb): 
    import math; return max(1, math.ceil(model_mem_gb / gpu_mem_gb))
def calc_instances_per_server(gpus_per_server, gpus_per_instance): 
    return max(0, gpus_per_server // gpus_per_instance)
def calc_kv_per_session_gb_no_opt(L,H,TS,bytes_state): 
    return (2*L*H*TS*bytes_state)/(1024**3)
def calc_kv_per_session_gb_opt(kv_no_opt, Kopt): 
    return kv_no_opt / Kopt if Kopt>0 else kv_no_opt
def calc_kv_free_per_instance_gb(gpi, gpu_mem_gb, model_mem_gb, reserve): 
    total = gpi*gpu_mem_gb*(1-reserve); return max(0.0, total - model_mem_gb)
def calc_sessions_per_instance(kv_free_gb, kv_per_session_gb_opt): 
    return 0 if kv_per_session_gb_opt<=0 else max(0, int(kv_free_gb // kv_per_session_gb_opt))
def calc_servers_by_memory(total_active, sessions_per_server): 
    import math; 
    return math.ceil(total_active / sessions_per_server) if sessions_per_server>0 else math.inf
def calc_rps_per_instance(tps_per_instance, T): 
    return 0.0 if T<=0 else tps_per_instance / T
def calc_rps_per_server(rps_instance, instances_per_server, batching_coeff): 
    return rps_instance * instances_per_server * batching_coeff
def calc_servers_by_compute(required_rps, rps_per_server, sla_reserve): 
    import math
    if rps_per_server<=0: return math.inf
    return math.ceil((required_rps / rps_per_server) * sla_reserve)

def run_sizing(inp: SizingInput) -> SizingOutput:
    total_active = calc_total_active(inp.internal_users, inp.penetration_internal, inp.concurrency_internal,
                                     inp.external_users, inp.penetration_external, inp.concurrency_external)
    T = calc_tokens_per_request(inp.prompt_tokens_P, inp.answer_tokens_A)
    required_rps = calc_required_rps(total_active, inp.rps_per_active_user_R)
    TS = calc_tokens_per_session(inp.session_duration_sec_t, inp.rps_per_active_user_R, T)
    model_mem_gb = calc_model_mem_gb(inp.params_billions, inp.bytes_per_param, inp.overhead_factor)
    gpus_per_instance = calc_gpus_per_instance(model_mem_gb, inp.gpu_mem_gb)
    instances_per_server = calc_instances_per_server(inp.gpus_per_server, gpus_per_instance)
    kv_no_opt = calc_kv_per_session_gb_no_opt(inp.layers_L, inp.hidden_size_H, TS, inp.bytes_per_kv_state)
    kv_opt = calc_kv_per_session_gb_opt(kv_no_opt, inp.paged_attention_gain_Kopt)
    kv_free = calc_kv_free_per_instance_gb(gpus_per_instance, inp.gpu_mem_gb, model_mem_gb, inp.mem_reserve_fraction)
    sessions_per_instance = calc_sessions_per_instance(kv_free, kv_opt)
    sessions_per_server = sessions_per_instance * instances_per_server
    servers_mem = calc_servers_by_memory(total_active, sessions_per_server)
    if servers_mem is math.inf:
        raise Exception("Sessions per server is zero; increase GPU memory or reduce KV/session.")
    rps_instance = calc_rps_per_instance(inp.tps_per_instance, T)
    rps_server = calc_rps_per_server(rps_instance, instances_per_server, inp.batching_coeff)
    servers_comp = calc_servers_by_compute(required_rps, rps_server, inp.sla_reserve)
    if servers_comp is math.inf:
        raise Exception("RPS per server is zero; check TPS per instance / T / instances per server.")
    servers_final = max(servers_mem, servers_comp)
    return SizingOutput(
        total_active_users=total_active,
        T_tokens_per_request=T,
        required_RPS=required_rps,
        tokens_per_session_TS=TS,
        model_mem_gb=model_mem_gb,
        gpus_per_instance=gpus_per_instance,
        instances_per_server=instances_per_server,
        kv_per_session_gb_no_opt=kv_no_opt,
        kv_per_session_gb_opt=kv_opt,
        kv_free_per_instance_gb=kv_free,
        sessions_per_instance=sessions_per_instance,
        sessions_per_server=sessions_per_server,
        servers_by_memory=servers_mem,
        rps_per_instance=rps_instance,
        rps_per_server=rps_server,
        servers_by_compute=servers_comp,
        servers_final=servers_final,
    )

app = FastAPI(title="GenAI Server Sizing API", version="1.0.0")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,         # перечисляй явно; для prod не ставь '*'
    allow_credentials=False,       # True только если реально шлёшь cookies/Authorization
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz(): return {"status":"ok"}

@app.post("/v1/size", response_model=SizingOutput)
def size_endpoint(inp: SizingInput):
    out = run_sizing(inp); 
    return out

class WhatIfScenario(BaseModel):
    name: str
    overrides: dict = {}
class WhatIfRequest(BaseModel):
    base: SizingInput
    scenarios: List[WhatIfScenario]
class WhatIfResponseItem(BaseModel):
    name: str
    output: SizingOutput

@app.post("/v1/whatif", response_model=List[WhatIfResponseItem])
def whatif_endpoint(req: WhatIfRequest):
    items: List[WhatIfResponseItem] = []
    for sc in req.scenarios:
        data = req.base.dict()
        for k,v in sc.overrides.items():
            if k not in data:
                raise Exception(f"Unknown field in overrides: {k}")
            data[k]=v
        out = run_sizing(SizingInput(**data))
        items.append(WhatIfResponseItem(name=sc.name, output=out))
    return items
