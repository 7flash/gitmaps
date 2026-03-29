#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3335/}"
REPO_PATH="${2:-C:/Code/gitmaps}"
SECOND_REPO_PATH="${3:-C:/Code/jsx-ai}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# shellcheck source=/dev/null
source "$LIB_DIR/browser-smoke-assemble.sh"

FIRST_EXPECTATIONS=$(read_repo_expectations "$REPO_PATH")
SECOND_EXPECTATIONS=$(read_repo_expectations "$SECOND_REPO_PATH")
REPO_LOAD_EXPECTATIONS=$(read_repo_expectations "$REPO_PATH")
SWITCH_SMOKE_SCRIPT=$(build_browser_smoke_script "$FIRST_EXPECTATIONS" "$SECOND_EXPECTATIONS" "$((TIMEOUT_SECONDS * 1000))")
REPO_LOAD_SMOKE_SCRIPT=$(build_browser_repo_load_smoke_script "$REPO_LOAD_EXPECTATIONS" "$((TIMEOUT_SECONDS * 1000))")

for script in "$SWITCH_SMOKE_SCRIPT" "$REPO_LOAD_SMOKE_SCRIPT"; do
  if printf '%s' "$script" | grep -q '__FIRST_EXPECTATIONS__\|__SECOND_EXPECTATIONS__\|__EXPECTED_REPO__\|__TIMEOUT_MS__'; then
    echo 'Smoke script template placeholders were not fully replaced' >&2
    exit 1
  fi
done

if ! printf '%s' "$SWITCH_SMOKE_SCRIPT" | grep -q "const first ="; then
  echo 'Repo-switch smoke assembly missing expected first repo payload' >&2
  exit 1
fi

if ! printf '%s' "$SWITCH_SMOKE_SCRIPT" | grep -q "const second ="; then
  echo 'Repo-switch smoke assembly missing expected second repo payload' >&2
  exit 1
fi

if ! printf '%s' "$REPO_LOAD_SMOKE_SCRIPT" | grep -q "const expected ="; then
  echo 'Repo-load smoke assembly missing expected repo payload' >&2
  exit 1
fi

node - <<'NODE' "$SWITCH_SMOKE_SCRIPT" "$REPO_LOAD_SMOKE_SCRIPT"
const switchScript = process.argv[2];
const repoLoadScript = process.argv[3];
try {
  new Function(`return ${switchScript}`);
  new Function(`return ${repoLoadScript}`);
  console.log(JSON.stringify({ ok: true, assembled: true, repoSwitchSyntax: 'ok', repoLoadSyntax: 'ok' }));
} catch (error) {
  console.error('Assembled smoke script failed syntax check');
  console.error(error?.stack || String(error));
  process.exit(1);
}
NODE
