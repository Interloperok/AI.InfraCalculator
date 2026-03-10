# Contributing Guide

Thanks for contributing to AI Server Calculator.

## 1) Before you start

- Read `/README.md` and `/docs/getting-started.md`.
- Follow repository tooling standards:
  - Backend: Python 3.14 + `uv`
  - Frontend: Node.js + npm
- For security-related findings, use `/SECURITY.md` instead of public issues.

## 2) Local setup

Backend:

```bash
cd backend
uv sync --frozen --all-groups
```

Frontend:

```bash
cd frontend
npm install
```

## 3) Development workflow

1. Create a focused branch from `main`.
2. Keep changes atomic and scoped to one concern.
3. Run quality checks before opening PR.
4. Update docs/tests together with behavioral changes.

## 4) Required quality checks

Backend:

```bash
cd backend
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
uv run pytest -q
```

Backend coverage gates:

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
npm run format:check
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e
```

## 5) Commit and PR style

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `ci:`, `chore:`).
- Prefer one milestone/task per commit when possible.
- Keep commit messages imperative and concise.
- In PR description include:
  - what changed
  - why it changed
  - how it was tested
  - backward-compatibility notes (if relevant)

## 6) Code standards

- Do not commit generated artifacts (`__pycache__`, coverage outputs, local IDE files).
- Keep backend logic layered (`api` -> `services` -> `core`).
- Put pure sizing math in `backend/core/sizing_math.py`.
- Keep frontend feature-oriented under `frontend/src/features/`.
- Add or update tests for all behavior changes.

## 7) Documentation updates

Update relevant docs when changing behavior:
- `/README.md`
- `/backend/README.md`
- `/frontend/README.md`
- `/docs/architecture.md`
- `/docs/getting-started.md`

## 8) Governance references

- Security Policy: `/SECURITY.md`
