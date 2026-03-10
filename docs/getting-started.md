# Getting Started

This guide assumes the current working directory is repository root.

## 1) Prerequisites

- Docker + Docker Compose plugin (for containerized run)
- Python 3.14
- `uv`
- Node.js + npm (required for frontend local checks and tests)

## 2) Quick start with Docker

```bash
docker compose up --build
```

Endpoints:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:8000](http://localhost:8000)
- Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

Stop:

```bash
docker compose down
```

## 3) Local backend (Python 3.14 + uv)

```bash
cd backend
uv sync --frozen --all-groups
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Useful checks:

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
uv run pytest -q
```

## 4) Local frontend

```bash
cd frontend
npm install
npm start
```

Quality checks:

```bash
cd frontend
npm run lint
npm run format:check
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e
```

## 5) coverage workflow

Backend reports:

```bash
cd backend
uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
uv run coverage json -o coverage.json
uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
```

Frontend report:

```bash
cd frontend
npm run test:ci -- --coverage
```

Threshold targets:
- Backend overall: line >= 85%, branch >= 80%
- Core math (`backend/core/sizing_math.py`): line >= 95%, branch >= 90%
- Frontend global lines: >= 75%

## 6) Production-like compose run

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Or use helper script:

```bash
./redeploy.sh
```

## 7) CI notes

Workflow files are intentionally disabled in private mode:
- `.github/workflows/ci.yml.disabled`
- `.github/workflows/e2e.yml.disabled`

To enable on public repo, rename files to `.yml`.
