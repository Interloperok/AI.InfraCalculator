# Restore the frontend runtime dependency audit

The existing lock selects follow-redirects 1.16.1. The unchanged runtime audit
fails on the public GHSA-mrwp-f3q8-3g9p advisory, including in dependency PRs
#140 and #141. Fix the shared baseline without editing either bot branch.

Standard: npm's targeted lock update, followed by the existing npm ci and
npm audit --omit=dev --audit-level=high commands. Do not use audit fix --force,
weaken the audit threshold, add an override, or upgrade unrelated packages.

### Task 1: Update one transitive dependency

Files: frontend/package-lock.json and this plan.

- [x] Confirm the original runtime audit failure.
- [x] Select follow-redirects 1.16.2 with its npm integrity, preserving all
  other dependency versions and the root manifest. This is the published
  security fix; its package-only early adoption is approved for this fix.
- [x] Repeat npm ci; require the unchanged runtime audit to pass.
- [x] Run frontend lint, formatting, type checks, unit coverage and build;
  leave browser smoke and the Linux/container path to the existing CI.
- [ ] Obtain independent review and green exact-head CI before integration.
  Verify the merged revision and the existing deployment separately.

Rollback: revert the lock update. Do not combine this repair with the broader
backend or Axios updates; their normal release-age gates remain separate.

Sources: https://github.com/advisories/GHSA-mrwp-f3q8-3g9p and npm publication
metadata (1.16.2 published 2026-10-25T21:32:25.963Z).

## Local results

- Baseline audit: exit1, one high and three low runtime findings. After the
  targeted update: exit0, no high/critical runtime findings, three prior lows.
- Exactly one package-lock entry changed (version, resolved, SHA512 integrity).
  The root package manifest and every other package entry are identical.
- npm ci succeeded on macOS ARM64, existing Node26.12.0. Its default local npm
  policy did not run three optional/unapproved install scripts; that policy was
  not changed. Linux/Node22 installation and browser smoke remain CI evidence.
- Existing lint, format:check, typecheck, 12 suites/87 tests with coverage,
  production build and the unchanged runtime audit all passed. No new test
  mirrors a generated lock, and no threshold or CI workflow was changed.
- The three low deepmerge/react-floater/react-joyride findings and existing dev
  dependency findings remain separate debt; this patch does not claim zero
  vulnerabilities throughout the project. Early use of1.16.2 is restricted
  to the public high-severity fix, not the unrelated broader bot updates.
