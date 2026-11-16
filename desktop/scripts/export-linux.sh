#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-linux-build:latest}"
OUT_DIR="${OUT_DIR:-out/linux}"
EXPORT_KIND="${EXPORT_KIND:-all}"
PULL_IMAGE="${PULL_IMAGE:-0}"
node scripts/release/version.mjs sync
VERSION="${VERSION:-$(node scripts/release/version.mjs get)}"
ARCH="${ARCH:-amd64}"
BUNDLE_BASE="${BUNDLE_BASE:-/workspace/desktop/src-tauri/target/release/bundle}"

if [ "$PULL_IMAGE" = "1" ]; then
  docker pull "$IMAGE" >/dev/null
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Missing Linux builder image: $IMAGE" >&2
  echo "Run desktop/scripts/build-linux.sh first, or set PULL_IMAGE=1 after logging in to the image registry." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

case "$EXPORT_KIND" in
  all)
    rm -rf "${OUT_DIR:?}/steam-calendar_"*
    rm -f "$OUT_DIR"/*.rpm
    rm -f "$OUT_DIR"/*.AppImage
    rm -f "$OUT_DIR"/*.pkg.tar.zst
    ;;
  deb)
    rm -f "$OUT_DIR"/*.deb
    ;;
  rpm)
    rm -f "$OUT_DIR"/*.rpm
    ;;
  appimage)
    rm -f "$OUT_DIR"/*.AppImage
    ;;
  arch)
    rm -f "$OUT_DIR"/*.pkg.tar.zst
    ;;
  *)
    echo "Unsupported EXPORT_KIND: $EXPORT_KIND" >&2
    echo "Expected one of: all, deb, rpm, appimage, arch" >&2
    exit 1
    ;;
esac

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
    echo "Run desktop/scripts/build-linux.sh first." >&2
    exit 1
  fi

  docker cp "$container_id:$artifact_path" "$OUT_DIR/$output_name"
  echo "Exported $artifact_path -> $OUT_DIR/$output_name"
}

copy_bundle_if_kind() {
  local kind="$1"
  local bundle_dir="$2"
  local pattern="$3"
  local output_name="$4"

  if [ "$EXPORT_KIND" = "all" ] || [ "$EXPORT_KIND" = "$kind" ]; then
    copy_latest_bundle "$bundle_dir" "$pattern" "$output_name"
  fi
}

copy_bundle_if_kind deb "$BUNDLE_BASE/deb" "*.deb" "steam-calendar_${VERSION}_${ARCH}.deb"
copy_bundle_if_kind rpm "$BUNDLE_BASE/rpm" "*.rpm" "steam-calendar-${VERSION}-1.x86_64.rpm"
copy_bundle_if_kind appimage "$BUNDLE_BASE/appimage" "*.AppImage" "steam-calendar_${VERSION}_${ARCH}.AppImage"

if [ "$EXPORT_KIND" = "all" ] || [ "$EXPORT_KIND" = "arch" ]; then
  deb_file="$(find "$OUT_DIR" -maxdepth 1 -type f -name 'steam-calendar_*.deb' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
  if [ -z "$deb_file" ]; then
    echo "A Debian package is required before exporting an Arch package." >&2
    echo "Run desktop/scripts/export-linux.sh with EXPORT_KIND=all or EXPORT_KIND=deb first." >&2
    exit 1
  fi
IMAGE="archlinux:latest" VERIFY_ARCH="${VERIFY_ARCH:-0}" DEB_FILE="$deb_file" bash desktop/scripts/package-arch.sh
fi

case "$EXPORT_KIND" in
  all)
    ls -lh "$OUT_DIR"/*.deb "$OUT_DIR"/*.rpm "$OUT_DIR"/*.AppImage "$OUT_DIR"/*.pkg.tar.zst
    ;;
  deb)
    ls -lh "$OUT_DIR"/*.deb
    ;;
  rpm)
    ls -lh "$OUT_DIR"/*.rpm
    ;;
  appimage)
    ls -lh "$OUT_DIR"/*.AppImage
    ;;
  arch)
    ls -lh "$OUT_DIR"/*.pkg.tar.zst
    ;;
esac
