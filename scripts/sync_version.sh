#!/usr/bin/env bash
#
# Sync the version from VERSION (root) to every other place.
#
# Usage:
#   ./scripts/sync_version.sh            # write — propagate VERSION → all targets
#   ./scripts/sync_version.sh --check    # verify — exit 1 if any target is out of sync
#
# Targets:
#   backend/pyproject.toml         project.version
#   frontend/package.json          .version
#   frontend/src/App.js            APP_VERSION constant
#   CITATION.cff                   version
#   charts/ai-infra-calculator/Chart.yaml   both `version` and `appVersion`
#
# Convention: chart `version` and `appVersion` track the calculator
# version one-to-one. Future flexibility (e.g., chart 1.3.1 patching
# only chart logic) would warrant decoupling.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"

if [[ -z "$VERSION" ]]; then
  echo "VERSION file is empty" >&2
  exit 1
fi

CHECK_ONLY=0
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=1
fi

errors=()

# Each target is: "label|path|extractor (returns current value)"
# Extractor uses tools we know are available: grep+sed, jq.
declare -a targets=(
  "pyproject.toml|$ROOT/backend/pyproject.toml|grep -E '^version = ' '$ROOT/backend/pyproject.toml' | sed -E 's/^version = \"(.+)\"/\1/'"
  "frontend/package.json|$ROOT/frontend/package.json|jq -r '.version' '$ROOT/frontend/package.json'"
  "frontend/src/App.js|$ROOT/frontend/src/App.js|grep -E '^const APP_VERSION' '$ROOT/frontend/src/App.js' | sed -E 's/.*\"(.+)\";/\1/'"
  "CITATION.cff|$ROOT/CITATION.cff|grep -E '^version: ' '$ROOT/CITATION.cff' | sed -E 's/^version: (.+)/\1/'"
  "Chart.yaml/version|$ROOT/charts/ai-infra-calculator/Chart.yaml|grep -E '^version: ' '$ROOT/charts/ai-infra-calculator/Chart.yaml' | sed -E 's/^version: (.+)/\1/'"
  "Chart.yaml/appVersion|$ROOT/charts/ai-infra-calculator/Chart.yaml|grep -E '^appVersion: ' '$ROOT/charts/ai-infra-calculator/Chart.yaml' | sed -E 's/^appVersion: \"?([^\"]+)\"?/\1/'"
)

check() {
  local label="$1" path="$2" extractor="$3"
  if [[ ! -f "$path" ]]; then
    echo "MISSING $label ($path)" >&2
    errors+=("$label: file not found")
    return
  fi
  local current
  current="$(eval "$extractor")"
  if [[ "$current" != "$VERSION" ]]; then
    echo "DRIFT $label: current='$current' expected='$VERSION'" >&2
    errors+=("$label: '$current' != '$VERSION'")
  else
    echo "OK    $label: $current"
  fi
}

write() {
  # backend/pyproject.toml
  sed -i.bak -E "s/^version = \"[^\"]+\"/version = \"$VERSION\"/" "$ROOT/backend/pyproject.toml"
  rm -f "$ROOT/backend/pyproject.toml.bak"

  # frontend/package.json
  local tmp="$ROOT/frontend/package.json.tmp"
  jq ".version = \"$VERSION\"" "$ROOT/frontend/package.json" > "$tmp"
  mv "$tmp" "$ROOT/frontend/package.json"

  # frontend/src/App.js
  sed -i.bak -E "s/const APP_VERSION = \"[^\"]+\";/const APP_VERSION = \"$VERSION\";/" "$ROOT/frontend/src/App.js"
  rm -f "$ROOT/frontend/src/App.js.bak"

  # CITATION.cff
  sed -i.bak -E "s/^version: .+$/version: $VERSION/" "$ROOT/CITATION.cff"
  rm -f "$ROOT/CITATION.cff.bak"

  # Chart.yaml — version + appVersion
  sed -i.bak -E "s/^version: .+$/version: $VERSION/" "$ROOT/charts/ai-infra-calculator/Chart.yaml"
  sed -i.bak -E "s/^appVersion: .+$/appVersion: \"$VERSION\"/" "$ROOT/charts/ai-infra-calculator/Chart.yaml"
  rm -f "$ROOT/charts/ai-infra-calculator/Chart.yaml.bak"

  echo ""
  echo "Wrote VERSION=$VERSION to all targets."
}

echo "Target version: $VERSION"
echo ""

if [[ $CHECK_ONLY -eq 1 ]]; then
  for target in "${targets[@]}"; do
    IFS='|' read -r label path extractor <<< "$target"
    check "$label" "$path" "$extractor"
  done
  if [[ ${#errors[@]} -gt 0 ]]; then
    echo ""
    echo "❌ ${#errors[@]} version mismatch(es). Run ./scripts/sync_version.sh to fix." >&2
    exit 1
  fi
  echo ""
  echo "✓ All targets synchronized."
else
  write
  echo ""
  echo "Verifying..."
  echo ""
  for target in "${targets[@]}"; do
    IFS='|' read -r label path extractor <<< "$target"
    check "$label" "$path" "$extractor"
  done
fi
