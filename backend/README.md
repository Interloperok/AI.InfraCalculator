# GenAI Server Sizing API

FastAPI backend that calculates AI/LLM server capacity and compares “what-if” scenarios. Designed to be used by the React frontend.

## Features

- Predicts active users, RPS, sessions, and required servers
- What-if scenarios with field overrides
- Clean Pydantic contracts and validation
- Health check endpoint for tooling/monitoring
- CORS ready for local dev (frontend on 3000/5173)

## Prerequisites

- Python 3.14
- uv
- (Optional) Frontend running at http://localhost:3000 or http://localhost:5173

## Installation

1) Go to the backend folder:
```bash
cd backend
```

2) Sync the project environment:
```bash
uv sync --frozen --all-groups
```

## Run

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000  
Interactive docs: http://localhost:8000/docs (Swagger) and http://localhost:8000/redoc

## API Endpoints

- `GET /healthz` – Health check
- `POST /v1/size` – Calculate server requirements for a single input
- `POST /v1/whatif` – Run multiple scenarios against a base input

## Request/Response Models (summary)

- **SizingInput** → **SizingOutput** (`/v1/size`)
- **WhatIfRequest** (base: SizingInput, scenarios: [{name, overrides}]) → `[{ name, output: SizingOutput }]` (`/v1/whatif`)

> All numeric fields are validated (ranges, >0, etc.). See `/docs` for the full schema.

## Example Requests (curl)

### 1) Single calculation
```bash
curl -s http://localhost:8000/v1/size   -H "Content-Type: application/json"   -d '{
    "internal_users": 1000,
    "penetration_internal": 0.6,
    "concurrency_internal": 0.2,
    "external_users": 0,
    "penetration_external": 0.0,
    "concurrency_external": 0.0,
    "prompt_tokens_P": 300,
    "answer_tokens_A": 700,
    "rps_per_active_user_R": 0.02,
    "session_duration_sec_t": 120,
    "params_billions": 7,
    "bytes_per_param": 2,
    "overhead_factor": 1.2,
    "layers_L": 32,
    "hidden_size_H": 4096,
    "bytes_per_kv_state": 2,
    "paged_attention_gain_Kopt": 2.5,
    "gpu_mem_gb": 80,
    "gpus_per_server": 8,
    "mem_reserve_fraction": 0.07,
    "tps_per_instance": 250,
    "batching_coeff": 1.2,
    "sla_reserve": 1.25
  }' | jq
```

### 2) What-if scenarios
```bash
curl -s http://localhost:8000/v1/whatif   -H "Content-Type: application/json"   -d '{
    "base": {
      "internal_users": 1000,
      "penetration_internal": 0.6,
      "concurrency_internal": 0.2,
      "external_users": 0,
      "penetration_external": 0.0,
      "concurrency_external": 0.0,
      "prompt_tokens_P": 300,
      "answer_tokens_A": 700,
      "rps_per_active_user_R": 0.02,
      "session_duration_sec_t": 120,
      "params_billions": 7,
      "bytes_per_param": 2,
      "overhead_factor": 1.2,
      "layers_L": 32,
      "hidden_size_H": 4096,
      "bytes_per_kv_state": 2,
      "paged_attention_gain_Kopt": 2.5,
      "gpu_mem_gb": 80,
      "gpus_per_server": 8,
      "mem_reserve_fraction": 0.07,
      "tps_per_instance": 250,
      "batching_coeff": 1.2,
      "sla_reserve": 1.25
    },
    "scenarios": [
      { "name": "Double users", "overrides": { "internal_users": 2000 } },
      { "name": "Bigger model", "overrides": { "params_billions": 13 } }
    ]
  }' | jq
```

## Health Check
```bash
curl -s http://localhost:8000/healthz
```

## CORS (local dev)

If your frontend runs on a different origin (e.g., `http://localhost:3000` for CRA or `http://localhost:5173` for Vite), enable CORS in `main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Technologies Used

- FastAPI (web framework)
- Pydantic (validation & schemas)
- Uvicorn (ASGI server)
