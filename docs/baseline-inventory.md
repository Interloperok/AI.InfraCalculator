# Baseline Inventory (M01)

- Captured on: 2026-02-16
- Repository root: `./`
- Purpose: freeze current state before refactoring implementation.

## 1) Verification Commands And Outputs

```bash
git status --short --untracked-files=all
```

Output:

```text
(no output; working tree was clean when captured)
```

```bash
python3 --version
which python3
uv --version
node --version
npm --version
docker --version
```

Output:

```text
Python 3.14.3
(pyenv shim path omitted)
uv 0.10.2 (Homebrew 2026-02-10)
v25.6.1
11.9.0
Docker version 29.2.0, build 0b9d198
```

## 2) Repository Topology Snapshot

Top-level directories (depth <= 2):

- `./app`
- `./frontend`
- `./docs`
- `./nginx`
- `./.cursor`

Backend highlights:

- Main API module: `./app/main.py` (monolithic).
- Data/model scripts: `./app/gpu_scraper.py`, `./app/gpu_normalizer.py`, `./app/report_generator.py`.
- Tests: `./app/tests/test_sizing.py`.
- Packaging: `./app/requirements.txt`.

Frontend highlights:

- CRA entry points: `./frontend/src/index.js`, `./frontend/src/App.js`.
- API client: `./frontend/src/services/api.js`.
- Package manager files: `./frontend/package.json`, `./frontend/package-lock.json`.

## 3) Tooling/OSS Presence Matrix

| Item | Present now? | Evidence |
|---|---|---|
| Backend `pyproject.toml` | No | no file in repo scan |
| Backend `uv.lock` | No | no file in repo scan |
| Pre-commit config | No | no `./.pre-commit-config.yaml` |
| CI workflows | No | no `./.github/workflows/*` |
| TS config | No | no `./frontend/tsconfig*.json` |
| ESLint project config | No | no `./frontend/.eslintrc*` |
| Prettier config | No | no `./frontend/.prettierrc*` |
| CITATION file | No | no `./CITATION.cff` |
| OSS governance docs (`CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`) | No | files absent |
| Issue/PR templates | No | `.github` templates absent |
| License | Yes | `./LICENSE` (MIT) |

## 4) Detected Risks/Gaps

1. Packaging inconsistency: backend still uses `requirements.txt` and mixed version constraints in docs/deploy assets.
2. Determinism gap: no lockfile strategy for Python, no CI quality gates, no coverage thresholds.
3. Architecture risk: `./app/main.py` mixes API layer + business math + scheduler + data operations.
4. Frontend maintainability gap: JavaScript-only, no strict typecheck gate.
5. OSS release gap: missing contribution/governance/security/citation templates and policies.

## 5) Target Standard Summary (Approved In ADR-0001)

- Python backend: `3.14`.
- Dependency manager: `uv` with committed `uv.lock`.
- Backend config hub: `./backend/pyproject.toml` (after M03 rename).
- Quality gates: `ruff`, `ty`, `mypy`, `pytest` + coverage branch/line thresholds.
- Frontend: `eslint`, `prettier`, `tsc --noEmit`, component/unit + E2E tests.
- Process: milestone-driven implementation (one milestone = one commit), tracked in `./docs/milestones.md`.

## 6) Exit Criteria For M01

- `./docs/adr/0001-toolchain-standardization.md` exists and is accepted.
- This baseline file exists and includes command outputs + gap inventory.
- Milestone status for M01 updated from `TODO` to `DONE` in `./docs/milestones.md`.
