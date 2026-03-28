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

normalize_path_for_bash() {
  local raw_path="$1"
  if printf '%s' "$raw_path" | grep -Eq '^[A-Za-z]:/'; then
    local drive_letter
    drive_letter=$(printf '%s' "$raw_path" | cut -c1 | tr 'A-Z' 'a-z')
    printf '/%s/%s' "$drive_letter" "${raw_path:3}"
  else
    printf '%s' "$raw_path"
  fi
}

run_browser_eval() {
  timeout 20 browser-eval "$1"
}

run_browser_nav() {
  timeout 20 browser-nav "$1"
}

capture_screenshot() {
  local target_path="${1:-}"
  local target_path_normalized=""
  local screenshot_tmp
  screenshot_tmp=$(timeout 15 browser-screenshot 2>/dev/null || true)
  if [ -z "$screenshot_tmp" ]; then
    echo "Screenshot capture failed" >&2
    return 1
  fi

  if [ -n "$target_path" ]; then
    target_path_normalized=$(normalize_path_for_bash "$target_path")
    mkdir -p "$(dirname "$target_path_normalized")"
    cp "$screenshot_tmp" "$target_path_normalized"
    echo "$target_path"
  else
    echo "$screenshot_tmp"
  fi
}

emit_failure_screenshot() {
  if [ "$SCREENSHOT_ON_FAILURE" = "1" ]; then
    local fail_path=""
    if [ -n "$SCREENSHOT_PATH" ]; then
      fail_path="${SCREENSHOT_PATH%.png}.failure.png"
    fi
    local captured
    captured=$(capture_screenshot "$fail_path" || true)
    if [ -n "$captured" ]; then
      echo "Failure screenshot: $captured" >&2
    fi
  fi
}

fail_with_message() {
  echo "$1" >&2
  emit_failure_screenshot
  exit 1
}

on_error() {
  local exit_code=$?
  emit_failure_screenshot
  exit "$exit_code"
}
trap on_error ERR

get_debug_pid() {
  netstat -ano 2>/dev/null | awk '/127.0.0.1:9222/ && /LISTENING/ {print $5; exit}'
}

restart_browser_debug_session() {
  local debug_pid
  debug_pid=$(get_debug_pid)
  if [ -n "$debug_pid" ]; then
    taskkill //PID "$debug_pid" //T //F >/dev/null 2>&1 || true
    sleep 2
  fi
  browser-start >/dev/null 2>&1 || true
  sleep 3
}

wait_for_debug_port() {
  local attempt=1
  while [ "$attempt" -le "$BROWSER_READY_RETRIES" ]; do
    if curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  return 1
}

get_current_url() {
  run_browser_eval "location.href" 2>/dev/null || true
}

dismiss_profile_picker_if_needed() {
  local current_url="$1"
  if ! printf '%s' "$current_url" | grep -q '^chrome://profile-picker/'; then
    return 0
  fi

  run_browser_eval "(function() {
    const app = document.querySelector('profile-picker-app');
    const main = app && app.shadowRoot && app.shadowRoot.getElementById('mainView');
    const guest = main && main.shadowRoot && main.shadowRoot.getElementById('browseAsGuestButton');
    if (!guest) throw new Error('Guest mode button not found in profile picker');
    guest.click();
    return 'clicked-guest-mode';
  })()" >/dev/null 2>&1 || true

  local attempt=1
  while [ "$attempt" -le 8 ]; do
    sleep 1
    current_url=$(get_current_url)
    if [ -n "$current_url" ] && ! printf '%s' "$current_url" | grep -q '^chrome://profile-picker/'; then
      return 0
    fi
    attempt=$((attempt + 1))
  done

  return 1
}

ensure_browser_ready() {
  local cycle=1
  local current_url=""

  while [ "$cycle" -le 3 ]; do
    restart_browser_debug_session
    wait_for_debug_port || true
    current_url=$(get_current_url)
    if [ -n "$current_url" ]; then
      dismiss_profile_picker_if_needed "$current_url" || true
      current_url=$(get_current_url)
      if [ -n "$current_url" ]; then
        return 0
      fi
    fi
    cycle=$((cycle + 1))
  done

  return 1
}

navigate_to_app() {
  local attempt=1
  while [ "$attempt" -le "$NAV_RETRIES" ]; do
    ensure_browser_ready || true
    if run_browser_nav "$URL" >/dev/null 2>&1; then
      return 0
    fi
    restart_browser_debug_session
    attempt=$((attempt + 1))
  done
  return 1
}

read_repo_expectations() {
  python - "$1" <<'PY'
import json, sys, urllib.request
path = sys.argv[1]
headers = {'Content-Type': 'application/json'}
load_req = urllib.request.Request('http://localhost:3335/api/repo/load', data=json.dumps({'path': path}).encode(), headers=headers)
tree_req = urllib.request.Request('http://localhost:3335/api/repo/tree', data=json.dumps({'path': path}).encode(), headers=headers)
with urllib.request.urlopen(load_req, timeout=180) as r:
    load_data = json.loads(r.read().decode())
with urllib.request.urlopen(tree_req, timeout=300) as r:
    tree_data = json.loads(r.read().decode())
slug = load_data.get('canonicalSlug') or path.replace('\\', '/').rstrip('/').split('/')[-1]
print(json.dumps({
    'path': path,
    'slug': slug,
    'commitCount': len(load_data.get('commits', [])),
    'fileCount': len(tree_data.get('files', [])),
}))
PY
}

FIRST_EXPECTATIONS=$(read_repo_expectations "$REPO_PATH")
SECOND_EXPECTATIONS=$(read_repo_expectations "$SECOND_REPO_PATH")

ensure_browser_ready || fail_with_message "Browser tools did not become ready"
navigate_to_app || fail_with_message "Failed to navigate browser to $URL"

result=$(run_browser_eval "(async function() {
  const first = ${FIRST_EXPECTATIONS};
  const second = ${SECOND_EXPECTATIONS};

  const waitFor = async (predicate, timeoutMs = 30000, intervalMs = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
  };

  const snapshot = () => ({
    repoValue: document.getElementById('repoSelect')?.value || '',
    fileCount: document.getElementById('fileCount')?.textContent || '',
    commitCount: document.getElementById('commitCount')?.textContent || '',
    commitInfo: document.getElementById('currentCommitInfo')?.textContent || '',
    timelineHasContent: ((document.getElementById('timelineContainer')?.textContent) || '').trim().length > 0,
    pathname: window.location.pathname,
    runtimeRepoPath: window.__GITCANVAS_REPO_PATH__ || '',
  });

  const waitForRepoLoad = async (expected, previousPathname = '') => {
    await waitFor(() => {
      const loading = document.getElementById('loadingOverlay');
      return !loading || loading.style.display === 'none';
    }, ${TIMEOUT_SECONDS} * 1000, 250);

    await waitFor(() => {
      const landing = document.getElementById('landingOverlay');
      const repoSelect = document.getElementById('repoSelect');
      const fileCount = Number(document.getElementById('fileCount')?.textContent || '0');
      const commitCount = Number(document.getElementById('commitCount')?.textContent || '0');
      const runtimeRepoPath = window.__GITCANVAS_REPO_PATH__ || '';
      const pathnameChanged = !previousPathname || window.location.pathname !== previousPathname;
      return landing
        && landing.style.display === 'none'
        && repoSelect
        && repoSelect.value === expected.path
        && runtimeRepoPath === expected.path
        && fileCount === expected.fileCount
        && commitCount === expected.commitCount
        && window.location.pathname === '/' + expected.slug
        && pathnameChanged;
    }, ${TIMEOUT_SECONDS} * 1000, 250);
  };

  const loadRepoViaPrompt = async (expected) => {
    const repoSelect = await waitFor(() => document.getElementById('repoSelect'));
    const previousPathname = window.location.pathname;
    await waitFor(() => Array.from(repoSelect.options).some(opt => opt.value === '__new__'));
    window.prompt = () => expected.path;
    repoSelect.value = '__new__';
    repoSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForRepoLoad(expected, previousPathname);
    return snapshot();
  };

  const firstSnapshot = await loadRepoViaPrompt(first);
  const secondSnapshot = await loadRepoViaPrompt(second);

  if (secondSnapshot.repoValue !== second.path) {
    throw new Error('Second repo did not win the switch: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }
  if (firstSnapshot.repoValue === secondSnapshot.repoValue) {
    throw new Error('Repo switch did not change repo value: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }
  if (firstSnapshot.pathname === secondSnapshot.pathname) {
    throw new Error('Repo switch did not change pathname: ' + JSON.stringify({ firstSnapshot, secondSnapshot, first, second }));
  }

  return JSON.stringify({
    ok: true,
    first: firstSnapshot,
    second: secondSnapshot,
    expectedFirst: first,
    expectedSecond: second,
  });
})()")

echo "$result"

if [ "$SCREENSHOT_ON_SUCCESS" = "1" ]; then
  captured=$(capture_screenshot "$SCREENSHOT_PATH" || true)
  if [ -n "$captured" ]; then
    echo "Success screenshot: $captured"
  fi
fi
