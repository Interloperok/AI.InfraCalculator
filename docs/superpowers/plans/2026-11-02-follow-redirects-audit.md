# Restore the frontend runtime dependency audit

The existing lock selects follow-redirects 1.16.1. The unchanged runtime audit
fails on the public GHSA-mrwp-f3q8-3g9p advisory, including in dependency PRs
#140 and #141. Fix the shared baseline without editing either bot branch.

Standard: npm's targeted lock update, followed by the existing npm ci and
npm audit --omit=dev --audit-level=high commands. Do not use audit fix --force,
weaken the audit threshold, add an override, or upgrade unrelated packages.

### Task 1: Update one transitive dependency

Files: frontend/package-lock.json and this plan.

- [ ] Confirm the original runtime audit failure.
- [ ] Select follow-redirects 1.16.2 with its npm integrity, preserving all
  other dependency versions and the root manifest. This is the published
  security fix; its package-only early adoption is approved for this fix.
- [ ] Repeat npm ci; require the unchanged runtime audit to pass.
- [ ] Run frontend lint, formatting, type checks, unit coverage and build;
  leave browser smoke and the Linux/container path to the existing CI.
- [ ] Obtain independent review and green exact-head CI before integration.
  Verify the merged revision and the existing deployment separately.

Rollback: revert the lock update. Do not combine this repair with the broader
backend or Axios updates; their normal release-age gates remain separate.

Sources: https://github.com/advisories/GHSA-mrwp-f3q8-3g9p and npm publication
metadata (1.16.2 published 2026-10-25T21:32:25.963Z).
