#!/usr/bin/env bash

read_repo_expectations() {
  python "$LIB_DIR/browser-smoke-expectations.py" "$1"
}

build_browser_smoke_script() {
  local first_expectations="$1"
  local second_expectations="$2"
  local timeout_ms="$3"
  local js_template
  js_template=$(<"$LIB_DIR/browser-smoke-flow.js")
  js_template=${js_template//__FIRST_EXPECTATIONS__/$first_expectations}
  js_template=${js_template//__SECOND_EXPECTATIONS__/$second_expectations}
  js_template=${js_template//__TIMEOUT_MS__/$timeout_ms}
  printf '%s' "$js_template"
}

build_browser_repo_load_smoke_script() {
  local expected_repo="$1"
  local timeout_ms="$2"
  local js_template
  js_template=$(<"$LIB_DIR/browser-repo-load-smoke-flow.js")
  js_template=${js_template//__EXPECTED_REPO__/$expected_repo}
  js_template=${js_template//__TIMEOUT_MS__/$timeout_ms}
  printf '%s' "$js_template"
}

build_browser_low_zoom_perf_smoke_script() {
  local expected_repo="$1"
  local timeout_ms="$2"
  local js_template
  js_template=$(<"$LIB_DIR/browser-low-zoom-perf-flow.js")
  js_template=${js_template//__EXPECTED_REPO__/$expected_repo}
  js_template=${js_template//__TIMEOUT_MS__/$timeout_ms}
  printf '%s' "$js_template"
}

build_browser_settings_layout_smoke_script() {
  local expected_repo="$1"
  local timeout_ms="$2"
  local target_card_width="$3"
  local js_template
  js_template=$(<"$LIB_DIR/browser-settings-layout-flow.js")
  js_template=${js_template//__EXPECTED_REPO__/$expected_repo}
  js_template=${js_template//__TIMEOUT_MS__/$timeout_ms}
  js_template=${js_template//__TARGET_CARD_WIDTH__/$target_card_width}
  printf '%s' "$js_template"
}

build_browser_preview_mode_smoke_script() {
  local expected_repo="$1"
  local timeout_ms="$2"
  local js_template
  js_template=$(<"$LIB_DIR/browser-preview-mode-flow.js")
  js_template=${js_template//__EXPECTED_REPO__/$expected_repo}
  js_template=${js_template//__TIMEOUT_MS__/$timeout_ms}
  printf '%s' "$js_template"
}
