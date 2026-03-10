# AI Server Calculator

Open-source tool for AI/LLM infrastructure sizing.
<img width="997" height="1172" alt="image" src="https://github.com/user-attachments/assets/97951fb9-b664-4494-980c-ba4c5f902303" />

Project includes:
- FastAPI backend with sizing math, GPU catalog and auto-optimization API
- React frontend with calculator UI and scenario analysis
- Docker setup for local and production-like runs

## getting started

### Option A: Docker compose (fastest)

```bash
docker compose up --build
```

Services:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:8000](http://localhost:8000)
- Backend OpenAPI docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Option B: Local development

Backend (Python 3.14 + uv):

```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Frontend (Node.js + npm):

```bash
cd frontend
npm install
npm start
```

Notes:
- Final runtime can be Docker-only.
- Local Node.js/npm are still required for frontend lint/type/tests and pre-commit hooks.

## Repository Structure

```text
AI.ServerCalculationApp/
├── backend/                  # FastAPI backend (API, services, sizing core)
│   ├── api/                  # HTTP handlers (transport layer)
│   ├── core/                 # Pure sizing math (critical core math scope)
│   ├── services/             # Business services (sizing, GPU, optimization)
│   ├── models/               # Pydantic request/response models
│   ├── tests/                # pytest tests, golden fixtures, property tests
│   ├── pyproject.toml        # Python metadata and tool configuration
│   └── uv.lock               # Reproducible dependency lockfile
├── frontend/                 # React frontend
│   ├── src/features/         # Feature modules (calculator/gpu/optimization)
│   ├── src/services/         # API client
│   └── e2e/                  # Playwright smoke tests
├── docs/                     # Project documentation
├── docker-compose.yml        # Local compose setup
├── docker-compose.prod.yml   # Production-like compose setup
└── redeploy.sh               # Simple redeploy helper
```

## API Overview

Main backend routes:
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

## Tooling Standard

Backend standard:
- Python 3.14
- `uv` only (no `requirements.txt` workflow)
- single source of project/tool config in `backend/pyproject.toml`

Quality tools:
- Backend: `ruff`, `ty`, `mypy`, `pytest`, `coverage.py`, `hypothesis`
- Frontend: `eslint`, `prettier`, `tsc --noEmit`, `jest`, `playwright`

## Tests And Coverage

Backend:

```bash
cd backend
uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
uv run coverage json -o coverage.json
uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
```

Frontend:

```bash
cd frontend
npm run lint
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e
```

Coverage thresholds:
- Backend overall: line >= 85%, branch >= 80%
- Core math (`backend/core/sizing_math.py`): line >= 95%, branch >= 90%
- Frontend overall: line >= 75%

## Documentation

- Main docs index: `docs/index.md`
- Onboarding and dev/prod setup: `docs/getting-started.md`
- System architecture: `docs/architecture.md`
- Core math scope definition: `docs/testing/core-math-scope.md`

## CI Workflows

Repository keeps CI workflow templates as disabled files while project is private:
- `.github/workflows/ci.yml.disabled`
- `.github/workflows/e2e.yml.disabled`

When moving to public repository, rename them to `.yml` to enable GitHub Actions.
