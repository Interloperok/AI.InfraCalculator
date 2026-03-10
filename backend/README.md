# Backend (FastAPI)

Backend API for AI/LLM server sizing.

## Stack

- Python 3.14
- FastAPI
- uv (dependency and runtime manager)
- Pydantic v2 models

## Local run

```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Docs:
- Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Main endpoints

- `GET /healthz`
- `GET /v1/scheduler/status`
- `POST /v1/size`
- `POST /v1/report`
- `POST /v1/whatif`
- `POST /v1/auto-optimize`
- `GET /v1/gpus`
- `GET /v1/gpus/{gpu_id}`
- `GET /v1/gpus/export`
- `POST /v1/gpus/refresh`
- `GET /v1/gpus/stats`

## Settings (env)

- `AI_SC_ENV` (default: `dev`)
- `AI_SC_LOG_LEVEL` (default: `INFO`)
- `AI_SC_DISABLE_SCHEDULER` (default: `false`)
- `AI_SC_GPU_REFRESH_INTERVAL_HOURS` (default: `1`)

For deterministic tests, scheduler is typically disabled:

```bash
AI_SC_DISABLE_SCHEDULER=1 uv run pytest -q
```

## Quality checks

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
uv run pytest -q
```

## Coverage

```bash
cd backend
uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
uv run coverage json -o coverage.json
uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
```

Core math coverage scope is documented in `docs/testing/core-math-scope.md`.
