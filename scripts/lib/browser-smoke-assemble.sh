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
