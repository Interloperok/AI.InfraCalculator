# CI/CD Workflows And Triggers

This document describes how GitHub Actions workflows are expected to behave after enabling `.yml.disabled` files.

## Current state (private repository mode)

Workflows are intentionally disabled and stored as templates:
- `.github/workflows/ci.yml.disabled`
- `.github/workflows/security.yml.disabled`
- `.github/workflows/e2e.yml.disabled`
- `.github/workflows/release.yml.disabled`

No GitHub Actions runs happen while files keep `.disabled` suffix.

## Enable workflows

1. Rename each required workflow file from `*.yml.disabled` to `*.yml`.
2. Push changes to repository default branch.
3. Configure required checks in branch protection for `main`.

## Trigger matrix

| Workflow | Main purpose | Trigger events | Branch/tag filter | Notes |
|---|---|---|---|---|
| `ci.yml` | Lint/type/test/build + coverage artifacts | `push`, `pull_request`, `workflow_dispatch` | `push` on all branches (`**`), `pull_request` to `main` | Fast jobs for non-`main` pushes, full jobs for `main`/PR/manual |
| `security.yml` | Secret scan + dependency scan + CodeQL | `push`, `pull_request`, `workflow_dispatch` | `push` on all branches (`**`), `pull_request` to `main` | Secret scan on every push; heavy security jobs on `main`/PR/manual |
| `e2e.yml` | Playwright smoke tests | `pull_request`, `workflow_dispatch` | `pull_request` to `main` | No `push` trigger by design |
| `release.yml` | Validate citation + publish GitHub release | `push`, `workflow_dispatch` | `push` tags `v*` | Release only for version tags or manual run |

## Job behavior details

### `ci.yml`

On `push` to non-`main` branches:
- runs `backend-fast`
- runs `frontend-fast`

On `pull_request` to `main`, `push` to `main`, or manual run:
- runs `backend-quality`
- runs `frontend-quality`

`backend-fast`/`frontend-fast` and `backend-quality`/`frontend-quality` are independent jobs and can run in parallel.

### `security.yml`

On every `push` (all branches):
- runs `secret-scan`

On `pull_request` to `main`, `push` to `main`, or manual run:
- runs `dependency-scan-backend`
- runs `dependency-scan-frontend`
- runs `codeql`

Security jobs are independent and can run in parallel.

### `e2e.yml`

Runs Playwright smoke tests only for:
- PR to `main`
- manual run

### `release.yml`

Runs release workflow for:
- pushed tags like `v0.1.0`
- manual run

## Concurrency and cancellation

- `ci.yml` uses `concurrency.group: ci-${{ github.ref }}` with `cancel-in-progress: true`.
- `security.yml` uses `concurrency.group: security-${{ github.ref }}` with `cancel-in-progress: true`.

This prevents redundant queued runs for the same ref.

## Recommended branch protection checks

After enabling workflows, set required checks for `main`:
- `Backend full checks (main/pr)`
- `Frontend full checks (main/pr)`
- `Secret scan (gitleaks)`
- `Backend dependency scan (pip-audit)`
- `Frontend dependency scan (npm audit)`
- `CodeQL scan`
- `Playwright smoke tests` (if E2E is required before merge)

## Local equivalents of critical checks

```bash
# Backend quality
cd backend
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov

# Frontend quality
cd frontend
npm run lint
npm run format:check
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e

# Security
cd ..
gitleaks detect --source . --config gitleaks.toml --redact --no-banner
```
