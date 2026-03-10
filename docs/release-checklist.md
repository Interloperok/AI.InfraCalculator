# Release Checklist

This is the final release checklist for open-source publication readiness.

## Release checklist scope

- Repository hygiene
- Quality gates
- Security scans
- Workflow readiness
- Documentation and citation completeness

## 1) Preconditions

- [ ] Target commit is selected on release branch.
- [ ] No uncommitted changes in release working tree.
- [ ] All milestone docs are up to date.

Quick checks:

```bash
git status --short
rg -n "\| M[0-9]+ \|" docs/milestones.md
```

## 2) Backend quality gates

- [ ] Lint passes
- [ ] Format check passes
- [ ] Type checks pass (`ty`, `mypy`)
- [ ] Tests and coverage gates pass

Commands:

```bash
cd backend
uv sync --frozen --all-groups
uv run ruff check .
uv run ruff format --check .
uv run ty check .
uv run mypy .
AI_SC_DISABLE_SCHEDULER=1 uv run pytest --cov=. --cov-branch --cov-report=xml:coverage.xml --cov-report=html:htmlcov
uv run coverage json -o coverage.json
uv run python scripts/check_coverage_thresholds.py --overall-line 85 --overall-branch 80 --core-line 95 --core-branch 90
```

## 3) Frontend quality gates

- [ ] Lint passes
- [ ] Format check passes
- [ ] Typecheck passes
- [ ] Unit tests with coverage pass
- [ ] E2E smoke passes (if applicable)

Commands:

```bash
cd frontend
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:ci -- --coverage
npm run test:e2e
```

## 4) Security and dependency checks

- [ ] Secret scan passes
- [ ] Python dependency audit passes
- [ ] JS dependency audit passes
- [ ] Dependabot config is present

Commands:

```bash
gitleaks detect --source . --config gitleaks.toml --redact --no-banner
cd backend
uv export --frozen --format requirements-txt -o /tmp/backend-requirements.txt
uvx pip-audit -r /tmp/backend-requirements.txt
cd frontend
npm audit --audit-level=high
```

## 5) Workflow readiness

For private repository phase:
- [ ] Workflow templates are present as `.yml.disabled` files.

```bash
test -f .github/workflows/ci.yml.disabled
test -f .github/workflows/security.yml.disabled
test -f .github/workflows/e2e.yml.disabled
test -f .github/workflows/release.yml.disabled
```

For public release phase:
- [ ] Rename selected workflow files to `.yml`.
- [ ] Configure branch protection required checks on `main`.
- [ ] Perform one manual workflow run via `workflow_dispatch`.

## 6) Documentation and citation

- [ ] `README.md` reflects current setup and workflows
- [ ] `docs/ci.md` and `docs/releases.md` are актуальны
- [ ] `CITATION.cff` validates

Commands:

```bash
uvx cffconvert --validate -i CITATION.cff
rg -n "CI Workflows|Trigger summary|Citation|Release/versioning" README.md docs/ci.md docs/releases.md
```

## 7) Tag and release execution

- [ ] Version chosen (`vX.Y.Z`)
- [ ] Annotated tag created
- [ ] Tag pushed
- [ ] GitHub release notes checked

Commands:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

## 8) Final go/no-go

Go only if all sections above are complete with no critical blockers.

- [ ] GO for public release
- [ ] NO-GO (blocking issues documented)

## Dry run record

| Date (YYYY-MM-DD) | Branch | Scope | Result | Notes |
|---|---|---|---|---|
| 2026-03-10 | `feature/oss-refactoring-2` | release readiness dry run | PASS (docs+config) | Local binary checks completed; workflows still disabled for private mode |
