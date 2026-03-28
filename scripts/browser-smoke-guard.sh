#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

required_files=(
  "$SCRIPT_DIR/browser-smoke-local.sh"
  "$SCRIPT_DIR/browser-smoke-self-check.sh"
  "$LIB_DIR/browser-tools-common.sh"
  "$LIB_DIR/browser-smoke-assemble.sh"
  "$LIB_DIR/browser-smoke-expectations.py"
  "$LIB_DIR/browser-smoke-flow.js"
)

for file in "${required_files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Missing required browser smoke helper: $file" >&2
    exit 1
  fi
done

bash -n "$SCRIPT_DIR/browser-smoke-local.sh"
bash -n "$SCRIPT_DIR/browser-smoke-self-check.sh"
bash -n "$LIB_DIR/browser-tools-common.sh"
bash -n "$LIB_DIR/browser-smoke-assemble.sh"

python -m py_compile "$LIB_DIR/browser-smoke-expectations.py"
node --check "$LIB_DIR/browser-smoke-flow.js" >/dev/null

printf '%s\n' '{"ok":true,"guarded":true,"shellSyntax":"ok","pythonSyntax":"ok","jsSyntax":"ok"}'
