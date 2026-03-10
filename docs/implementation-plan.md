# Implementation Plan

This implementation plan is dependency-ordered and atomic (`1 milestone = 1 commit`).

## How To Use This Plan

1. Use this document (`docs/implementation-plan.md`) as the scope/specification source for each milestone.
2. Use `docs/milestones.md` as the execution index and status source (`TODO` / `DONE`).
3. Implement milestones strictly in order unless dependencies explicitly allow parallel work.
4. Keep each milestone atomic in git history (one commit per milestone).

## Reuse For Future Releases

- Keep this file as a living implementation template.
- For next release tracks, append new milestones (for example `M32+`) or create a new section with a release-specific prefix while preserving this execution model.

## Detected Current State (from repository scan)

- Repository structure: monorepo with backend in `./backend`, frontend in `./frontend`, deployment files in `./docker-compose*.yml` and `./nginx/`.
- Languages/frameworks:
  - Backend: Python + FastAPI + Pydantic + APScheduler + pandas/requests/openpyxl/lxml.
  - Frontend: React 18 (Create React App via `react-scripts`), Tailwind CSS, Recharts, Axios; JavaScript (no TypeScript config yet).
- Existing Python packaging/tooling state:
  - Uses `./backend/requirements.txt`.
  - No `./backend/pyproject.toml`.
  - No uv lockfile (`uv.lock`) yet.
  - No pre-commit config yet.
  - No centralized linter/type/test config files.
- Existing frontend tooling state:
  - `package.json` scripts are CRA defaults (`start`, `build`, `test`, `eject`).
  - No explicit project ESLint/Prettier config files committed.
  - No TypeScript config (`tsconfig.json`) at repo state scanned.
- Tests and quality gates:
  - Backend has existing tests in `./backend/tests/test_sizing.py`.
  - Frontend has no source test files in `./frontend/src` at scan time.
  - No enforced coverage thresholds in current repo state.
  - No CI workflows (`.github/workflows`) at scan time.
- Documentation state:
  - Root, backend, and frontend READMEs exist but contain stale/inconsistent runtime and API field guidance.
  - No dedicated `docs/` architecture/theory/validation structure before this plan.
- OSS readiness state:
  - `LICENSE` exists (MIT).
  - Missing OSS community/release files (`CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, `CITATION.cff`).
- Code structure risks identified:
  - `./backend/main.py` is monolithic and mixes math, API, scheduler, and data operations.
  - Python cache artifacts are tracked (`__pycache__`, `.pyc`) and should be removed from version control.
- Environment note during scan:
  - Local scan environment had `python3`, `uv`, `node`, `npm`, and `docker` available.

1. **M01 — Baseline Inventory And ADR**
   - Objective: Capture an explicit baseline and migration decisions before code/tool changes.
   - Exact files/areas impacted (paths): `./docs/adr/0001-toolchain-standardization.md`, `./docs/baseline-inventory.md`.
   - Exact commands to run/verify locally:
     ```bash
     git status --short
     python3 --version
     uv --version
     node --version
     npm --version
     docker --version
     ```
   - Done criteria: baseline doc records current gaps and approved target stack (Python 3.14 + uv + pyproject + TS strict + CI thresholds).
   - Risk/notes: Low.

2. **M02 — Repository Hygiene Guardrails**
   - Objective: Remove generated artifacts from version control and enforce ignore rules.
   - Exact files/areas impacted (paths): `./.gitignore`, `./backend/__pycache__/`, `./backend/models/__pycache__/`, `./backend/tests/__pycache__/`, `./.editorconfig`.
   - Exact commands to run/verify locally:
     ```bash
     git ls-files | rg "__pycache__|\.pyc$"
     ```
   - Done criteria: no tracked `__pycache__`/`.pyc`; root ignore rules prevent recurrence.
   - Risk/notes: Low.

3. **M03 — Rename Backend Directory (`app` -> `backend`)**
   - Objective: Align backend naming with OSS conventions by renaming `app` to `backend`.
   - Exact files/areas impacted (paths): `./backend/` (renamed from `app`), `./docker-compose.yml`, `./docker-compose.prod.yml`, `./README.md`, `./docs/**/*.md`.
   - Exact commands to run/verify locally:
     ```bash
     git mv app backend
     test -d backend
     ! test -d app
     docker compose config
     ```
   - Done criteria: backend code lives under `./backend`, compose/docs references are updated, and no runtime path still depends on `app`.
   - Risk/notes: Medium (path-only migration; no behavior changes).

4. **M04 — Introduce Backend `pyproject.toml` (Metadata + Runtime Constraint)**
   - Objective: Establish PEP 621 metadata and Python runtime constraints in one canonical file.
   - Exact files/areas impacted (paths): `./backend/pyproject.toml`.
   - Exact commands to run/verify locally:
     ```bash
     cd backend
     python3 -c "import tomllib, pathlib; tomllib.loads(pathlib.Path('pyproject.toml').read_text()); print('pyproject valid')"
     rg -n "^\[project\]|requires-python|dependencies" pyproject.toml
     ```
   - Done criteria: `pyproject.toml` is valid and contains backend dependencies and `requires-python = '>=3.14,<3.15'`.
   - Risk/notes: Low.

5. **M05 — Migrate Dependency Resolution To uv Lockfile**
   - Objective: Make Python installs reproducible by committing a lockfile.
   - Exact files/areas impacted (paths): `./backend/pyproject.toml`, `./backend/uv.lock`.
   - Exact commands to run/verify locally:
     ```bash
     cd backend
     uv lock
     uv sync --frozen --all-groups
     uv tree
     ```
   - Done criteria: `uv.lock` is committed; `uv sync --frozen` succeeds on clean environment.
   - Risk/notes: Medium (dependency version adjustments).

6. **M06 — Consolidate Python Tool Config In `pyproject.toml`**
   - Objective: Centralize `ruff`, `ty`, `mypy`, `pytest`, and `coverage` config in `pyproject.toml`.
   - Exact files/areas impacted (paths): `./backend/pyproject.toml`.
   - Exact commands to run/verify locally:
     ```bash
     cd backend
     uv run ruff check .
     uv run ruff format --check .
     uv run ty check .
     uv run mypy .
     uv run pytest -q
     ```
   - Done criteria: all backend static/test tools are configured via `pyproject.toml`; commands are runnable.
   - Risk/notes: Medium. Default policy: run both `ty` (broad fast checks) and `mypy` (strict gate on core math/service boundaries).

7. **M07 — Standardize Python 3.14 In Dev Docs And Local Tooling**
   - Objective: Align local developer workflow to Python 3.14 explicitly.
   - Exact files/areas impacted (paths): `./.python-version`, `./README.md`, `./backend/README.md`.
   - Exact commands to run/verify locally:
     ```bash
     python3 --version
     rg -n "3\.14|uv sync|pyproject" README.md backend/README.md
     ```
   - Done criteria: all developer-facing docs and runtime hints reference Python 3.14 and uv workflow.
   - Risk/notes: Low.

8. **M08 — Update Backend Dockerfile To Python 3.14 + uv**
   - Objective: Standardize container runtime and dependency install path.
   - Exact files/areas impacted (paths): `./backend/Dockerfile`.
   - Exact commands to run/verify locally:
     ```bash
     docker compose build backend
     docker compose run --rm backend python --version
     docker compose run --rm backend uv --version
     ```
   - Done criteria: backend container uses Python 3.14 and installs from `pyproject.toml` + `uv.lock` with frozen sync.
   - Risk/notes: Medium.

9. **M09 — Update Compose/Deployment Artifacts For New Backend Build**
   - Objective: Ensure deployment scripts and compose files are consistent with the uv/3.14 backend.
   - Exact files/areas impacted (paths): `./docker-compose.yml`, `./docker-compose.prod.yml`, `./redeploy.sh`.
   - Exact commands to run/verify locally:
     ```bash
     docker compose config
     docker compose -f docker-compose.prod.yml config
     ```
   - Done criteria: compose configs validate and do not rely on `pip install -r requirements.txt`.
   - Risk/notes: Low.

10. **M10 — Enforce `uv-only` Packaging Policy**
   - Objective: Remove `requirements.txt` compatibility artifacts and make `pyproject.toml` + `uv.lock` the only packaging source of truth.
   - Exact files/areas impacted (paths): `./backend/requirements.txt` (remove), `./backend/scripts/export_requirements.sh` (remove), `./README.md`, `./backend/README.md`, `./docs/**/*.md`.
   - Exact commands to run/verify locally:
     ```bash
     test ! -f ./backend/requirements.txt
     test ! -f ./backend/scripts/export_requirements.sh
     ! rg -n "requirements\.txt|pip install -r" ./backend ./docker-compose*.yml ./redeploy.sh ./README.md ./backend/README.md
     cd backend
     uv sync --frozen --all-groups
     ```
   - Done criteria: repository contains no runtime or onboarding dependency on `requirements.txt`; all install and CI flows rely on `uv sync --frozen`.
   - Risk/notes: Low.

11. **M11 — Add Pre-commit Framework (Backend Hooks)**
    - Objective: Enforce local checks before commit for Python quality gates.
    - Exact files/areas impacted (paths): `./.pre-commit-config.yaml`.
    - Exact commands to run/verify locally:
      ```bash
      uvx pre-commit install
      uvx pre-commit run --all-files
      ```
    - Done criteria: pre-commit runs `ruff`, `ty`, `mypy`, and formatting checks reliably.
    - Risk/notes: Low.

12. **M12 — Frontend Lint/Format Standardization**
    - Objective: Add explicit frontend linting and formatting standards.
    - Exact files/areas impacted (paths): `./frontend/package.json`, `./frontend/.eslintrc.cjs`, `./frontend/.eslintignore`, `./frontend/.prettierrc.json`, `./frontend/.prettierignore`.
    - Exact commands to run/verify locally:
      ```bash
      cd frontend
      npm ci
      npm run lint
      npm run format:check
      ```
    - Done criteria: lint and format commands exist and pass.
    - Risk/notes: Medium (rule tuning).

13. **M13 — TypeScript Strict Check Baseline (`tsc --noEmit`)**
    - Objective: Introduce strict TS type checks with incremental JS→TS migration.
    - Exact files/areas impacted (paths): `./frontend/tsconfig.json`, `./frontend/src/types/`, `./frontend/src/services/api.ts`, `./frontend/package.json`.
    - Exact commands to run/verify locally:
      ```bash
      cd frontend
      npm run typecheck
      ```
    - Done criteria: `tsc --noEmit` passes in strict mode.
    - Risk/notes: Medium. Start with core files and expand conversion gradually.

14. **M14 — Extend Pre-commit With Frontend Hooks**
    - Objective: Run frontend lint/format/type checks in the same pre-commit pipeline.
    - Exact files/areas impacted (paths): `./.pre-commit-config.yaml`.
    - Exact commands to run/verify locally:
      ```bash
      uvx pre-commit run --all-files
      ```
    - Done criteria: Python and frontend hooks run together and fail-fast on violations.
    - Risk/notes: Low.

15. **M15 — Define Core Math Scope And Extract Pure Math Module**
    - Objective: Isolate GPU-sizing formulas into dedicated pure module(s) for strict coverage gating.
    - Exact files/areas impacted (paths): `./backend/core/sizing_math.py`, `./backend/main.py`, `./docs/testing/core-math-scope.md`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run pytest -q tests/test_sizing.py
      ```
    - Done criteria: core math scope is explicitly defined and importable from a dedicated path.
    - Risk/notes: Medium (behavior-preserving extraction only).

16. **M16 — Add Golden Fixture Regression Tests**
    - Objective: Lock expected sizing outputs for representative scenarios and prevent silent regressions.
    - Exact files/areas impacted (paths): `./backend/tests/fixtures/golden/`, `./backend/tests/test_golden_sizing.py`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run pytest -q tests/test_golden_sizing.py
      ```
    - Done criteria: golden fixtures cover baseline, high-load, edge, and invalid scenarios with deterministic assertions.
    - Risk/notes: Low.

17. **M17 — Add Property-based Tests (Hypothesis)**
    - Objective: Validate mathematical invariants and monotonic properties of sizing formulas.
    - Exact files/areas impacted (paths): `./backend/tests/test_sizing_properties.py`, `./backend/pyproject.toml`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run pytest -q tests/test_sizing_properties.py
      ```
    - Done criteria: core invariants are encoded with Hypothesis and stable under seeded runs.
    - Risk/notes: Medium.

18. **M18 — Add Backend API Integration Tests**
    - Objective: Validate HTTP contracts and runtime behavior independent of unit formula tests.
    - Exact files/areas impacted (paths): `./backend/tests/test_api_integration.py`, `./backend/tests/conftest.py`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      AI_SC_DISABLE_SCHEDULER=1 uv run pytest -q tests/test_api_integration.py
      ```
    - Done criteria: `/healthz`, `/v1/size`, `/v1/whatif`, `/v1/auto-optimize`, and GPU endpoints have deterministic integration coverage.
    - Risk/notes: Medium.

19. **M19 — Enforce Backend Coverage Thresholds + Reports**
    - Objective: Enforce line/branch thresholds and emit machine/human-readable reports.
    - Exact files/areas impacted (paths): `./backend/pyproject.toml`, `./backend/scripts/check_coverage_thresholds.py`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
      uv run coverage json -o coverage.json
      uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
      ```
    - Done criteria: backend overall >=85% line and >=80% branch; core math >=95% line and >=90% branch; HTML/XML reports generated.
    - Risk/notes: Medium.

20. **M20 — Add Frontend Unit/Component Tests + Coverage Gate**
    - Objective: Add deterministic UI/service tests and enforce minimum frontend coverage.
    - Exact files/areas impacted (paths): `./frontend/src/**/*.test.tsx`, `./frontend/package.json`, `./frontend/jest.config.js` (or equivalent).
    - Exact commands to run/verify locally:
      ```bash
      cd frontend
      npm run test:ci -- --coverage
      ```
    - Done criteria: frontend line coverage gate is enforced at >=75%.
    - Risk/notes: Medium.

21. **M21 — Add Playwright E2E Smoke Flows**
    - Objective: Validate critical end-to-end UX flows across backend/frontend integration.
    - Exact files/areas impacted (paths): `./frontend/playwright.config.ts`, `./frontend/e2e/`.
    - Exact commands to run/verify locally:
      ```bash
      cd frontend
      npx playwright install
      npm run test:e2e
      ```
    - Done criteria: key flows pass (calculate sizing, view results, auto-optimize, export report).
    - Risk/notes: Medium.

22. **M22 — Build Unified GitHub Actions CI**
    - Objective: Enforce lint/type/test/build on PRs and branch pushes, and publish coverage artifacts on full runs.
    - Exact files/areas impacted (paths): `./.github/workflows/ci.yml`, `./.github/workflows/e2e.yml`.
    - Exact commands to run/verify locally:
      ```bash
      rg -n "branches: \\[\"\\*\\*\"\\]|ruff|mypy|ty|pytest|coverage|eslint|prettier|typecheck|test:e2e|upload-artifact" .github/workflows/*.yml
      ```
    - Done criteria: CI blocks merges on quality gates and uploads backend `coverage.xml/htmlcov` + frontend coverage artifacts.
    - Risk/notes: Medium.

23. **M23 — Backend Layering Refactor (Monolith Decomposition)**
    - Objective: Split `main.py` into clean layers (API routes, services, core math, infrastructure).
    - Exact files/areas impacted (paths): `./backend/main.py`, `./backend/api/`, `./backend/services/`, `./backend/core/`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run ruff check .
      uv run mypy .
      uv run pytest -q
      ```
    - Done criteria: `main.py` becomes composition root; business logic no longer mixed with transport/infrastructure concerns.
    - Risk/notes: High.

24. **M24 — Backend Hardening: Typing, Errors, Logging, Config**
    - Objective: Introduce typed settings, structured logging, and explicit error taxonomy.
    - Exact files/areas impacted (paths): `./backend/settings.py`, `./backend/logging_config.py`, `./backend/errors.py`, `./backend/api/`.
    - Exact commands to run/verify locally:
      ```bash
      cd backend
      uv run mypy .
      uv run pytest -q
      ```
    - Done criteria: no broad untyped exceptions in API boundaries; environment-driven config replaces hardcoded behavior.
    - Risk/notes: Medium.

25. **M25 — Frontend Structural Refactor + Dead Code Removal**
    - Objective: Reorganize frontend by feature, improve state boundaries, and remove unused components.
    - Exact files/areas impacted (paths): `./frontend/src/features/`, `./frontend/src/components/`, `./frontend/src/components/AutoOptimize.js` (remove if unused), `./frontend/src/services/`.
    - Exact commands to run/verify locally:
      ```bash
      cd frontend
      npm run lint
      npm run typecheck
      npm run test:ci -- --coverage
      ```
    - Done criteria: feature-first structure, stronger typed API boundaries, and zero dead exports.
    - Risk/notes: Medium.

26. **M26 — Rewrite Top-level And Architecture Documentation**
    - Objective: Align docs with actual architecture, setup, and workflows.
    - Exact files/areas impacted (paths): `./README.md`, `./docs/index.md`, `./docs/architecture.md`, `./docs/getting-started.md`.
    - Exact commands to run/verify locally:
      ```bash
      rg -n "Python 3.14|uv sync --frozen|core math|coverage" README.md docs/*.md docs/**/*.md
      ```
    - Done criteria: onboarding docs are accurate, concise, and reproducible.
    - Risk/notes: Low.

27. **M27 — Add Theory, Assumptions, And Reproducible Examples**
    - Objective: Document sizing methodology rigorously for scientific citation and reproducibility.
    - Exact files/areas impacted (paths): `./docs/theory/gpu-sizing-assumptions.md`, `./docs/examples/`, `./docs/validation-and-coverage.md`.
    - Exact commands to run/verify locally:
      ```bash
      rg -n "assumption|input|output|threshold|line|branch" docs/theory docs/examples docs/validation-and-coverage.md
      ```
    - Done criteria: documented assumptions, formulas, and reproducible input→output examples exist.
    - Risk/notes: Low.

28. **M28 — Add OSS Governance Files**
    - Objective: Establish contributor behavior/process/security expectations.
    - Exact files/areas impacted (paths): `./CONTRIBUTING.md`, `./SECURITY.md`.
    - Exact commands to run/verify locally:
      ```bash
      test -f CONTRIBUTING.md && test -f SECURITY.md
      ```
    - Done criteria: governance docs are complete and linked from README.
    - Risk/notes: Low.

29. **M29 — Add Issue/PR Templates**
    - Objective: Standardize incoming issue reports and pull requests.
    - Exact files/areas impacted (paths): `./.github/ISSUE_TEMPLATE/bug_report.yml`, `./.github/ISSUE_TEMPLATE/feature_request.yml`, `./.github/pull_request_template.md`.
    - Exact commands to run/verify locally:
      ```bash
      test -f .github/ISSUE_TEMPLATE/bug_report.yml && test -f .github/ISSUE_TEMPLATE/feature_request.yml && test -f .github/pull_request_template.md
      ```
    - Done criteria: templates enforce reproducible bug reports and checklist-driven PRs.
    - Risk/notes: Low.

30. **M30 — Add Citation + Versioning/Release Strategy**
    - Objective: Make project citable and define deterministic release workflow.
    - Exact files/areas impacted (paths): `./CITATION.cff`, `./docs/releases.md`, `./.github/workflows/release.yml.disabled`, `./README.md`.
    - Exact commands to run/verify locally:
      ```bash
      uvx cffconvert --validate -i CITATION.cff
      rg -n "semantic versioning|release|changelog|citation" docs/releases.md README.md
      ```
    - Done criteria: citation metadata validates and release process is documented and automated.
    - Risk/notes: Medium.

31. **M31 — Security/Dependency Scanning + Final Release Readiness**
    - Objective: Add automated security scanning and final public-release checklist.
    - Exact files/areas impacted (paths): `./.github/dependabot.yml`, `./.github/workflows/security.yml.disabled`, `./gitleaks.toml`, `./docs/release-checklist.md`.
    - Exact commands to run/verify locally:
      ```bash
      (cd backend && uv export --frozen --format requirements-txt -o /tmp/backend-requirements.txt && uvx pip-audit -r /tmp/backend-requirements.txt)
      (cd frontend && npm audit --audit-level=high)
      gitleaks detect --source .
      ```
    - Done criteria: dependency and secret scanning are CI-enforced; release checklist passes with no critical blockers.
    - Risk/notes: Medium.

32. **M32 — Reconcile Plan/Index Integrity**
    - Objective: Restore strict 1:1 consistency between implementation plan and milestones index.
    - Exact files/areas impacted (paths): `./docs/implementation-plan.md`, `./docs/milestones.md`.
    - Exact commands to run/verify locally:
      ```bash
      rg -n "^\s*[0-9]+\. \*\*M|\| M[0-9]+ \|" /Users/pavel/projects/AI.ServerCalculationApp/docs/implementation-plan.md /Users/pavel/projects/AI.ServerCalculationApp/docs/milestones.md
      ```
    - Done criteria: IDs, order, titles, dependencies, and statuses are aligned.
    - Risk/notes: Medium.

33. **M33 — Make Frontend Coverage Representative**
    - Objective: enforce true frontend-global coverage gate, not narrow-file coverage.
    - Exact files/areas impacted (paths): `./frontend/package.json`, `./frontend/src/**/*.test.*`, optional Jest config.
    - Exact commands to run/verify locally:
      ```bash
      cd /Users/pavel/projects/AI.ServerCalculationApp/frontend
      npm run test:ci -- --coverage
      ```
    - Done criteria: coverage threshold reflects real frontend scope.
    - Risk/notes: Medium.

34. **M34 — Restore Backend Static-Check Strictness**
    - Objective: reduce temporary excludes/omits in backend quality config.
    - Exact files/areas impacted (paths): `./backend/pyproject.toml`.
    - Exact commands to run/verify locally:
      ```bash
      cd /Users/pavel/projects/AI.ServerCalculationApp/backend
      uv run ruff check .
      uv run mypy .
      AI_SC_DISABLE_SCHEDULER=1 uv run pytest -q
      ```
    - Done criteria: production modules are covered by lint/type gates.
    - Risk/notes: High.

35. **M35 — Migrate Backend Deprecations**
    - Objective: remove FastAPI/Pydantic deprecation patterns.
    - Exact files/areas impacted (paths): `./backend/main.py`, `./backend/models/*.py`.
    - Exact commands to run/verify locally:
      ```bash
      cd /Users/pavel/projects/AI.ServerCalculationApp/backend
      AI_SC_DISABLE_SCHEDULER=1 uv run pytest -q -W error::DeprecationWarning
      ```
    - Done criteria: no deprecation warnings from project code.
    - Risk/notes: Medium.

36. **M36 — Enable Public CI Workflows And Branch Protection (SUSPENDED)**
    - Objective: activate `.github/workflows/*.yml` and required checks for public repo.
    - Exact files/areas impacted (paths): `./.github/workflows/*`, repository settings.
    - Exact commands to run/verify locally (when unsuspended):
      ```bash
      find /Users/pavel/projects/AI.ServerCalculationApp/.github/workflows -name "*.yml"
      ```
    - Done criteria: all required checks run in GitHub on PR/push.
    - Risk/notes: Medium. Deferred until migration to public repo.

37. **M37 — Finalize Public Metadata Placeholders (SUSPENDED)**
    - Objective: replace placeholder repo identifiers in public metadata/docs.
    - Exact files/areas impacted (paths): `./CITATION.cff`, `./README.md`, docs references (if any).
    - Exact commands to run/verify locally (when unsuspended):
      ```bash
      rg -n "your-org|ai-server-calculator" /Users/pavel/projects/AI.ServerCalculationApp/CITATION.cff /Users/pavel/projects/AI.ServerCalculationApp/README.md /Users/pavel/projects/AI.ServerCalculationApp/docs
      ```
    - Done criteria: canonical public org/repo URLs are final.
    - Risk/notes: Low. Explicitly not fixed in current private-repo phase.

38. **M38 — Remove Internal/Non-OSS Tracked Artifacts**
    - Objective: remove internal planning/editor artifacts from tracked files.
    - Exact files/areas impacted (paths): repo root tracking set (for example `.cursor/*` if present).
    - Exact commands to run/verify locally:
      ```bash
      git -C /Users/pavel/projects/AI.ServerCalculationApp ls-files | rg "^\.cursor/|^\.vscode/"
      ```
    - Done criteria: no internal-only tracked artifacts remain.
    - Risk/notes: Low.

## Release Go Criteria (Revised)

- Private-repo GO:
  - M01-M35 and M38 are `DONE`.
  - M36 and M37 are allowed as `SUSPENDED`.
  - Local quality gates are green (`backend` + `frontend` + citation validation).
  - Workflow templates remain `.yml.disabled` by policy.
- Public-repo GO:
  - M36 and M37 are unsuspended and completed.
  - Branch protection required checks are configured.
  - Public repository metadata URLs are finalized.

## Assumptions (Revised)

- Repository is still private during current phase.
- Public canonical repo name/URL is not finalized yet.
- Therefore CI activation and placeholder replacement are intentionally deferred.
