#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-linux-build:latest}"
OUT_DIR="${OUT_DIR:-out/linux}"
node scripts/version.mjs sync
VERSION="${VERSION:-$(node scripts/version.mjs get)}"
ARCH="${ARCH:-amd64}"
BUNDLE_BASE="${BUNDLE_BASE:-/workspace/desktop_version/linux/src-tauri/target/release/bundle}"

mkdir -p "$OUT_DIR"
rm -rf "${OUT_DIR:?}/steam-calendar_"*
rm -f "$OUT_DIR"/*.rpm
rm -f "$OUT_DIR"/*.AppImage

container_name="steam-calendar-export-linux-$$"
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
    echo "Missing Linux bundle artifact: $bundle_dir/$pattern" >&2
    echo "Run scripts/desktop/build-linux-docker.sh first." >&2
    exit 1
  fi

  docker cp "$container_id:$artifact_path" "$OUT_DIR/$output_name"
  echo "Exported $artifact_path -> $OUT_DIR/$output_name"
}

copy_latest_bundle "$BUNDLE_BASE/deb" "*.deb" "steam-calendar_${VERSION}_${ARCH}.deb"
copy_latest_bundle "$BUNDLE_BASE/rpm" "*.rpm" "steam-calendar-${VERSION}-1.x86_64.rpm"
copy_latest_bundle "$BUNDLE_BASE/appimage" "*.AppImage" "steam-calendar_${VERSION}_${ARCH}.AppImage"

ls -lh "$OUT_DIR"/*.deb "$OUT_DIR"/*.rpm "$OUT_DIR"/*.AppImage
