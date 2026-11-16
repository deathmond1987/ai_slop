#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-windows-build:latest}"
OUT_DIR="${OUT_DIR:-out/windows}"
PULL_IMAGE="${PULL_IMAGE:-0}"
node scripts/release/version.mjs sync
VERSION="${VERSION:-$(node scripts/release/version.mjs get)}"
ARCH="${ARCH:-x64}"
TARGET_TRIPLE="${TARGET_TRIPLE:-x86_64-pc-windows-msvc}"
BUNDLE_BASE="${BUNDLE_BASE:-/workspace/desktop/src-tauri/target/${TARGET_TRIPLE}/release/bundle}"

if [ "$PULL_IMAGE" = "1" ]; then
  docker pull "$IMAGE" >/dev/null
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Missing Windows builder image: $IMAGE" >&2
  echo "Run desktop/scripts/build-windows.sh first, or set PULL_IMAGE=1 after logging in to the image registry." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -rf "${OUT_DIR:?}/steam-calendar_"*
rm -f "$OUT_DIR"/*.exe

container_name="steam-calendar-export-windows-$$"
container_id="$(docker create --name "$container_name" "$IMAGE" sleep 3600)"

cleanup() {
  docker rm -f "$container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker start "$container_id" >/dev/null

find_latest_container_file() {
  local dir="$1"
  local pattern="$2"

  docker exec "$container_id" bash -lc "find '$dir' -maxdepth 1 -type f -name '$pattern' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-"
}

copy_latest_bundle() {
  local bundle_dir="$1"
  local pattern="$2"
  local output_name="$3"
  local artifact_path

  artifact_path="$(find_latest_container_file "$bundle_dir" "$pattern")"
  if [ -z "$artifact_path" ]; then
    echo "Missing Windows bundle artifact: $bundle_dir/$pattern" >&2
    echo "Run desktop/scripts/build-windows.sh first." >&2
    exit 1
  fi

  docker cp "$container_id:$artifact_path" "$OUT_DIR/$output_name"
  echo "Exported $artifact_path -> $OUT_DIR/$output_name"
}

copy_latest_bundle "$BUNDLE_BASE/nsis" "*.exe" "steam-calendar_${VERSION}_${ARCH}-setup.exe"

ls -lh "$OUT_DIR"/*.exe
