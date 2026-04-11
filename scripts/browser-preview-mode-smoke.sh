#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:3335/}"
REPO_PATH="${2:-C:/Code/gitmaps}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"
SCREENSHOT_PATH="${SCREENSHOT_PATH:-}"
SCREENSHOT_ON_SUCCESS="${SCREENSHOT_ON_SUCCESS:-0}"
SCREENSHOT_ON_FAILURE="${SCREENSHOT_ON_FAILURE:-1}"
BROWSER_READY_RETRIES="${BROWSER_READY_RETRIES:-8}"
NAV_RETRIES="${NAV_RETRIES:-4}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# shellcheck source=/dev/null
source "$LIB_DIR/browser-tools-common.sh"
# shellcheck source=/dev/null
source "$LIB_DIR/browser-smoke-assemble.sh"
trap on_error ERR

EXPECTED_REPO=$(read_repo_expectations "$REPO_PATH")
EXPECTED_SLUG=$(EXPECTED_REPO="$EXPECTED_REPO" python - <<'PY'
import json, os
print(json.loads(os.environ['EXPECTED_REPO'])['slug'])
PY
)
SMOKE_SCRIPT=$(build_browser_preview_mode_smoke_script "$EXPECTED_REPO" "$((TIMEOUT_SECONDS * 1000))")

ensure_browser_ready || fail_with_message "Browser tools did not become ready"
navigate_to_app "$URL/$EXPECTED_SLUG" || fail_with_message "Failed to navigate browser to preview-mode smoke route"

result=$(run_browser_eval "$SMOKE_SCRIPT")
echo "$result"

save_success_screenshot_if_requested
