# ADR 0001: Toolchain And Quality Standardization

- Date: 2026-02-16
- Status: Accepted
- Owner: Maintainers
- Related plan: `./docs/review-plan.md` (M01)

## Context

The repository currently has mixed maturity across backend and frontend:

- Backend uses `./backend/requirements.txt` and does not yet use `pyproject.toml` + `uv.lock`.
- Runtime references are inconsistent (`Python 3.10+` / `3.11`) across docs and deployment assets.
- Pre-commit, CI workflows, and coverage thresholds are not yet standardized.
- Frontend is JavaScript CRA with no strict TypeScript gate yet.

For OSS release quality and scientific reproducibility, we need deterministic builds, explicit standards, and enforced quality gates.

## Decision

1. Python backend runtime standard is **Python 3.14**.
2. Python dependency management standard is **uv** with committed **`uv.lock`** and frozen installs.
3. Backend project metadata and tool configuration standard is **`./backend/pyproject.toml`** (after M03 rename).
4. Backend static analysis standard is:
   - `ruff check` + `ruff format`
   - `ty check`
   - `mypy` (strict boundaries, especially core math/service layers)
5. Frontend quality standard is:
   - `eslint`
   - `prettier`
   - `tsc --noEmit` in strict mode
6. Local gate standard is **pre-commit** (backend + frontend hooks).
7. CI standard is GitHub Actions with enforced lint/type/test/build and coverage thresholds:
   - Backend overall: `>=85%` line and `>=80%` branch.
   - Core math modules: `>=95%` line and `>=90%` branch.
   - Frontend overall: `>=75%` line.
8. Refactor and rollout are executed as **atomic milestones** (one milestone = one commit), tracked in `./docs/milestones.md`.

## Consequences

### Positive

- Deterministic developer setup and reproducible CI runs.
- Cleaner contributor onboarding and easier OSS maintenance.
- Stronger correctness guarantees for GPU-sizing math.
- Clear path to publication/citation readiness.

### Trade-offs

- Short-term migration overhead (packaging, config consolidation, CI setup).
- Temporary dual type-checker maintenance (`ty` + `mypy`) until baseline stabilizes.

## Scope Notes

- This ADR defines standards and direction; implementation is tracked milestone-by-milestone in `./docs/milestones.md`.
