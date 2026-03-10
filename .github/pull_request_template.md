## Summary

- What changed?
- Why was this needed?

## Linked issue

- Closes #
- Related #

## Scope

- [ ] backend
- [ ] frontend
- [ ] docs
- [ ] ci
- [ ] infra

## Validation

Backend checks run:
- [ ] `cd backend && uv run ruff check .`
- [ ] `cd backend && uv run ruff format --check .`
- [ ] `cd backend && uv run ty check .`
- [ ] `cd backend && uv run mypy .`
- [ ] `cd backend && uv run pytest -q`

Frontend checks run:
- [ ] `cd frontend && npm run lint`
- [ ] `cd frontend && npm run format:check`
- [ ] `cd frontend && npm run typecheck`
- [ ] `cd frontend && npm run test:ci -- --coverage`
- [ ] `cd frontend && npm run test:e2e` (if relevant)

## Coverage and tests

- New/updated tests:
- Coverage impact:

## Breaking changes

- [ ] No breaking changes
- [ ] Breaking change (describe migration):

## Documentation

- [ ] README/docs updated where applicable
- [ ] API contract changes documented

## Checklist

- [ ] Commit messages follow Conventional Commits
- [ ] No secrets or generated artifacts were added
- [ ] Milestone status in `docs/milestones.md` is updated when applicable
