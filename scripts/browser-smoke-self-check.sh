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
SMOKE_SCRIPT=$(build_browser_smoke_script "$FIRST_EXPECTATIONS" "$SECOND_EXPECTATIONS" "$((TIMEOUT_SECONDS * 1000))")

if printf '%s' "$SMOKE_SCRIPT" | grep -q '__FIRST_EXPECTATIONS__\|__SECOND_EXPECTATIONS__\|__TIMEOUT_MS__'; then
  echo 'Smoke script template placeholders were not fully replaced' >&2
  exit 1
fi

if ! printf '%s' "$SMOKE_SCRIPT" | grep -q "const first ="; then
  echo 'Smoke script assembly missing expected first repo payload' >&2
  exit 1
fi

if ! printf '%s' "$SMOKE_SCRIPT" | grep -q "const second ="; then
  echo 'Smoke script assembly missing expected second repo payload' >&2
  exit 1
fi

node - <<'NODE' "$SMOKE_SCRIPT"
const script = process.argv[2];
try {
  new Function(`return ${script}`);
  console.log(JSON.stringify({ ok: true, assembled: true, syntax: 'ok' }));
} catch (error) {
  console.error('Assembled smoke script failed syntax check');
  console.error(error?.stack || String(error));
  process.exit(1);
}
NODE
