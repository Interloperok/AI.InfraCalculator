# Security Policy

## Supported Versions

Until the first stable public release, only the latest `main` branch is considered supported for security fixes.

| Version | Supported |
|---|---|
| `main` | Yes |
| older commits/releases | No |

## Reporting a Vulnerability

Please do **not** report security vulnerabilities in public issues.

Preferred process:
1. Open a private GitHub Security Advisory in this repository.
2. Include reproduction steps, affected endpoints/modules, and impact assessment.
3. Include suggested mitigation if available.

If GitHub Security Advisory is unavailable, contact maintainers through a private channel configured by repository owners.

## Response Targets

- Initial triage response: within 5 business days
- Fix plan or mitigation guidance: within 10 business days (for confirmed issues)
- Coordinated disclosure after patch availability

## Scope

Examples of in-scope security reports:
- authentication/authorization bypasses
- data exposure through API responses or logs
- injection vectors and unsafe deserialization
- dependency vulnerabilities with practical impact
- secrets exposure in repository or CI

Out of scope:
- purely theoretical findings without exploit path
- issues only affecting unsupported forks/old commits

## Disclosure Policy

- Do not publish details before maintainers release a fix or mitigation.
- Maintainers will credit reporters in release/security notes unless anonymity is requested.
