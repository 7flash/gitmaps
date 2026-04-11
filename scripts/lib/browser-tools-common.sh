#!/usr/bin/env bash

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
  local eval_timeout="${BROWSER_EVAL_TIMEOUT:-60}"
  timeout "$eval_timeout" browser-eval "$1"
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
  if [ "${SCREENSHOT_ON_FAILURE:-1}" = "1" ]; then
    local fail_path=""
    if [ -n "${SCREENSHOT_PATH:-}" ]; then
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
  local retries="${BROWSER_READY_RETRIES:-8}"
  while [ "$attempt" -le "$retries" ]; do
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
  local url="$1"
  local attempt=1
  local retries="${NAV_RETRIES:-4}"
  while [ "$attempt" -le "$retries" ]; do
    ensure_browser_ready || true
    if run_browser_nav "$url" >/dev/null 2>&1; then
      return 0
    fi
    restart_browser_debug_session
    attempt=$((attempt + 1))
  done
  return 1
}

save_success_screenshot_if_requested() {
  if [ "${SCREENSHOT_ON_SUCCESS:-0}" = "1" ]; then
    local captured
    captured=$(capture_screenshot "${SCREENSHOT_PATH:-}" || true)
    if [ -n "$captured" ]; then
      echo "Success screenshot: $captured"
    fi
  fi
}
