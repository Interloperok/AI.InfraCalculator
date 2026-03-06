# Documentation Structure (Proposed)

## 1) Getting Started (Dev + Prod)
- `./README.md`
- `./docs/getting-started.md`
- Contents: quick local setup, docker setup, production deployment flow, troubleshooting.

## 2) Python 3.14 + uv Workflow
- `./docs/python-uv-workflow.md`
- Contents: install Python 3.14, `uv sync --frozen`, lockfile update policy, running API/tests/lint/type checks, and explicit `uv-only` packaging policy (no `requirements.txt` in repo).

## 3) Theory And Assumptions For GPU Sizing
- `./docs/theory/gpu-sizing-assumptions.md`
- Contents: formula derivation, units, constraints, SLA assumptions, approximation limits, known caveats.

## 4) Reproducible Examples (Input → Output)
- `./docs/examples/`
- Suggested files: `example-small-model.md`, `example-large-model.md`, `example-auto-optimize.md`.
- Contents: exact JSON inputs, expected outputs, command to reproduce, golden fixture linkage.

## 5) Validation Strategy And Test Coverage
- `./docs/validation-and-coverage.md`
- Contents: test pyramid, golden fixtures, Hypothesis invariants, frontend unit/E2E strategy, thresholds:
  - Backend overall: >=85% line and >=80% branch.
  - Core math scope: >=95% line and >=90% branch.
  - Frontend overall: >=75% line.
- Also include commands and report locations (`coverage.xml`, `htmlcov/`, frontend coverage artifacts).

## 6) Architecture (Backend + Frontend)
- `./docs/architecture.md`
- Contents: module boundaries, request flow, sizing core isolation, GPU catalog pipeline, frontend feature structure and state flow.

## 7) Contribution + Governance
- `./CONTRIBUTING.md`
- `./CODE_OF_CONDUCT.md`
- `./SECURITY.md`
- `./docs/releases.md`
- `./docs/maintainer-policies.md`
- `./CITATION.cff`
- Contents: branching/commit conventions, PR checklist, security reporting, support/deprecation policy, release process, citation guidance.
