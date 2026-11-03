# Repository workflow

These instructions apply throughout AI Infrastructure Calculator. Start with
[README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and
[docs/getting-started.md](docs/getting-started.md). Follow the contribution
requirements in those documents and the checks configured in
[.pre-commit-config.yaml](.pre-commit-config.yaml) and
[.github/workflows/](.github/workflows/).

## Development and architecture

- Create a focused branch from `main` and keep changes atomic and scoped to one
  concern.
- Use Python 3.14 and `uv` for the backend. Install the locked development
  dependencies with `cd backend && uv sync --frozen --all-groups`.
- Use Node.js and npm for the frontend. Local setup is
  `cd frontend && npm install`.
- Keep backend logic layered: `backend/api/` handles HTTP transport,
  `backend/services/` orchestrates business logic, and `backend/core/` provides
  calculation primitives. Dependencies follow `api` -> `services` -> `core`.
- Put pure, deterministic sizing math in `backend/core/sizing_math.py` and keep
  input/output contracts in `backend/models/`.
- Keep frontend code feature-oriented under `frontend/src/features/` and API
  communication in `frontend/src/services/api.ts`.
- Add or update tests for every behavior change and update the relevant README,
  architecture, and getting-started documentation alongside it.
- Do not commit generated artifacts such as Python caches, coverage outputs, or
  local IDE files.

See [docs/architecture.md](docs/architecture.md) for component boundaries and the
unit, golden regression, property-based, API integration, and frontend test
strategy.

## Required quality checks

Run the quality checks required by [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request. Keep the existing checks and coverage gates intact.
The [tooling matrix](docs/tooling-matrix.md) describes the tools; the current
workflow and configuration files define their execution in CI.

Backend checks, from `backend/`:

```bash
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
uv run pytest -q
uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
uv run coverage json -o coverage.json
uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
```

Backend coverage must meet 85% overall line coverage and 80% overall branch
coverage. The critical math in `backend/core/sizing_math.py` must meet 95% line
coverage and 90% branch coverage.

Frontend checks, from `frontend/`:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e
```

The documented frontend global line coverage target is at least 75%.

Repository checks, from the repository root:

```bash
./scripts/sync_version.sh --check
uvx pre-commit run --all-files
```

The pre-commit configuration includes whitespace, end-of-file, merge-conflict,
large-file, staged secret, and backend/frontend quality checks. CI also runs
build, test, coverage, infrastructure validation, and security jobs according to
the current workflow triggers and changed areas.

## Security and pull requests

- Follow [SECURITY.md](SECURITY.md). Report vulnerabilities through a private
  GitHub Security Advisory in this repository, or the maintainers' configured
  private channel if advisories are unavailable. Include reproduction steps,
  affected modules or endpoints, impact, and any suggested mitigation.
- Keep vulnerability details out of public issues and coordinate disclosure
  after a fix or mitigation is available.
- Use concise, imperative Conventional Commits, such as `docs: clarify setup`.
  Prefer one task per commit.
- Describe what changed, why, how it was tested, and any relevant backward
  compatibility considerations in the pull request.
