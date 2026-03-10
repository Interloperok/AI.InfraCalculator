# Tooling Matrix

| Tool | Purpose | Scope | Command | Config file | Runs in pre-commit? | Runs in CI? |
|---|---|---|---|---|---|---|
| `uv` | Reproducible Python env + lock management | py | `cd backend && uv sync --frozen --all-groups` | `./backend/pyproject.toml`, `./backend/uv.lock` | No | Yes |
| `ruff check` | Python linting | py | `cd backend && uv run ruff check .` | `./backend/pyproject.toml` | Yes | Yes |
| `ruff format` | Python formatting | py | `cd backend && uv run ruff format --check .` | `./backend/pyproject.toml` | Yes | Yes |
| `ty` | Fast Python type analysis (broad) | py | `cd backend && uv run ty check .` | `./backend/pyproject.toml` | Yes | Yes |
| `mypy` | Strict Python type gate (core/service boundaries) | py | `cd backend && uv run mypy .` | `./backend/pyproject.toml` | Yes | Yes |
| `pytest` | Backend tests | py | `cd backend && uv run pytest -q` | `./backend/pyproject.toml` | No | Yes |
| `pytest-cov + coverage.py` | Coverage reports and threshold enforcement | py | `cd backend && uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov` | `./backend/pyproject.toml`, `./backend/scripts/check_coverage_thresholds.py` | No | Yes |
| `Hypothesis` | Property-based tests for core math invariants | py | `cd backend && uv run pytest -q tests/test_sizing_properties.py` | `./backend/pyproject.toml` | No | Yes |
| `pre-commit` | Unified local quality gate runner | both | `uvx pre-commit run --all-files` | `./.pre-commit-config.yaml` | Yes | Optional |
| `eslint` | Frontend linting | frontend | `cd frontend && npm run lint` | `./frontend/.eslintrc.cjs` | Yes | Yes |
| `prettier` | Frontend formatting | frontend | `cd frontend && npm run format:check` | `./frontend/.prettierrc.json` | Yes | Yes |
| `tsc --noEmit` | Strict TypeScript compile-time checks | frontend | `cd frontend && npm run typecheck` | `./frontend/tsconfig.json` | Yes | Yes |
| `Jest + Testing Library` | Frontend unit/component tests | frontend | `cd frontend && npm run test:ci -- --coverage` | `./frontend/package.json`, `./frontend/jest.config.js` | No | Yes |
| `Playwright` | Frontend key E2E flows | frontend | `cd frontend && npm run test:e2e` | `./frontend/playwright.config.ts` | No | Yes |
| `pip-audit` | Python dependency vulnerability scanning | py | `cd backend && uv export --frozen --format requirements-txt -o /tmp/backend-requirements.txt && uvx pip-audit -r /tmp/backend-requirements.txt` | `./backend/pyproject.toml`, `./.github/workflows/security.yml.disabled` | No | Yes |
| `npm audit` | JS dependency vulnerability scanning | frontend | `cd frontend && npm audit --audit-level=high` | `./.github/workflows/security.yml.disabled` | No | Yes |
| `gitleaks` | Secret scanning | repo | `gitleaks detect --source .` | `./gitleaks.toml` | Optional | Yes |
| `CodeQL` | Static security analysis | both | GitHub Action run | `./.github/workflows/security.yml.disabled` | No | Yes |
| `SBOM generator` | Produce software bill of materials for release artifacts | both | CI workflow step (e.g., CycloneDX/Syft) | `./.github/workflows/security.yml.disabled` | No | Yes |
| `Action SHA pinning check` | Enforce immutable GitHub Action references | repo | `rg -n "uses: .+@[a-f0-9]{40}" .github/workflows/*.yml` | `./.github/workflows/*.yml` | No | Yes |
| `Dependabot` | Automated dependency update PRs | both | GitHub-native schedule | `./.github/dependabot.yml` | No | Yes |
