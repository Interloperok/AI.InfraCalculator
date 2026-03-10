# Releases and Versioning

This project follows Semantic Versioning (`MAJOR.MINOR.PATCH`).

## Versioning policy

- `MAJOR`: incompatible API or behavior changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes and maintenance updates.

Before `1.0.0`, minor versions may include larger internal refactors, but API-impacting changes must still be documented.

## Release inputs

A release requires:
- all required CI checks passing
- updated docs for user-visible changes
- tests for behavior changes
- milestone/docs updates when scope changed

## Changelog policy

- Keep a release notes summary per tag in GitHub Releases.
- Group changes by type (`feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`).
- Call out breaking changes explicitly.

## Tag format

Use annotated tags with `v` prefix:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

## Automated release workflow

Release workflow template is stored at:
- `.github/workflows/release.yml.disabled`

It remains disabled while repository is private. To enable on public repository:
1. rename `release.yml.disabled` to `release.yml`
2. ensure GitHub token permissions allow creating releases
3. push a tag `v*` or run workflow manually

## Citation

- Citation metadata is in `CITATION.cff`.
- Validate locally:

```bash
uvx cffconvert --validate -i CITATION.cff
```

## Maintainer checklist

1. Confirm CI green on target commit.
2. Confirm docs and tests updated.
3. Validate `CITATION.cff`.
4. Create and push annotated tag.
5. Verify GitHub Release draft/notes.
