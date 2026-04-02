#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-gitmaps:smoke}"
DOCKERFILE_PATH="${DOCKERFILE_PATH:-$ROOT_DIR/Dockerfile}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[docker-image-smoke] docker is not installed or not on PATH" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[docker-image-smoke] docker daemon is not available. Start Docker Desktop / the Docker engine, then rerun this smoke check." >&2
  exit 1
fi

if [[ ! -f "$DOCKERFILE_PATH" ]]; then
  echo "[docker-image-smoke] Dockerfile not found: $DOCKERFILE_PATH" >&2
  exit 1
fi

echo "[docker-image-smoke] Building image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$DOCKERFILE_PATH" "$ROOT_DIR"

echo "[docker-image-smoke] Verifying runtime tools"
docker run --rm "$IMAGE_NAME" sh -lc '
  set -e
  command -v curl >/dev/null
  command -v pdftoppm >/dev/null
  command -v pdfinfo >/dev/null
  echo "curl=$(command -v curl)"
  echo "pdftoppm=$(command -v pdftoppm)"
  echo "pdfinfo=$(command -v pdfinfo)"
'

echo "[docker-image-smoke] OK"
