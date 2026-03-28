#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3335/}"
REPO_PATH="${2:-C:/Code/gitmaps}"
SECOND_REPO_PATH="${3:-C:/Code/jsx-ai}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"
SCREENSHOT_PATH="${SCREENSHOT_PATH:-}"
SCREENSHOT_ON_SUCCESS="${SCREENSHOT_ON_SUCCESS:-0}"
SCREENSHOT_ON_FAILURE="${SCREENSHOT_ON_FAILURE:-1}"
BROWSER_READY_RETRIES="${BROWSER_READY_RETRIES:-8}"
NAV_RETRIES="${NAV_RETRIES:-4}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# shellcheck source=/dev/null
source "$LIB_DIR/browser-tools-common.sh"
trap on_error ERR

read_repo_expectations() {
  python "$LIB_DIR/browser-smoke-expectations.py" "$1"
}

build_browser_smoke_script() {
  local js_template
  js_template=$(<"$LIB_DIR/browser-smoke-flow.js")
  js_template=${js_template//__FIRST_EXPECTATIONS__/$FIRST_EXPECTATIONS}
  js_template=${js_template//__SECOND_EXPECTATIONS__/$SECOND_EXPECTATIONS}
  js_template=${js_template//__TIMEOUT_MS__/$((TIMEOUT_SECONDS * 1000))}
  printf '%s' "$js_template"
}

FIRST_EXPECTATIONS=$(read_repo_expectations "$REPO_PATH")
SECOND_EXPECTATIONS=$(read_repo_expectations "$SECOND_REPO_PATH")
SMOKE_SCRIPT=$(build_browser_smoke_script)

ensure_browser_ready || fail_with_message "Browser tools did not become ready"
navigate_to_app "$URL" || fail_with_message "Failed to navigate browser to $URL"

result=$(run_browser_eval "$SMOKE_SCRIPT")
echo "$result"

save_success_screenshot_if_requested
