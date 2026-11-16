#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash desktop/build.sh [linux] [windows]
       bash desktop/build.sh all

Builds desktop application packages from the repository root.
Without arguments builds all supported desktop platforms: linux and windows.
Desktop artifacts are written to out/linux and out/windows.

Environment variables:
  STEAM_CALENDAR_VERSION  optional explicit release/desktop version
  EXPORT_KIND             Linux export kind: all, deb, rpm, appimage, arch (default: all)
  VERIFY_ARCH             1 to verify Arch package, 0 to skip (default: 1)
USAGE
}

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

platforms=()
for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    all)
      platforms=(linux windows)
      break
      ;;
    linux|windows)
      platforms+=("$arg")
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
done

if [ "${#platforms[@]}" -eq 0 ]; then
  platforms=(linux windows)
fi

export STEAM_CALENDAR_VERSION="${STEAM_CALENDAR_VERSION:-}"
export EXPORT_KIND="${EXPORT_KIND:-all}"
export VERIFY_ARCH="${VERIFY_ARCH:-1}"

for platform in "${platforms[@]}"; do
  case "$platform" in
    linux)
      bash desktop/scripts/build-linux.sh
      bash desktop/scripts/export-linux.sh
      printf 'Linux desktop artifacts are available in %s/out/linux\n' "$root"
      ls -lh out/linux
      ;;
    windows)
      bash desktop/scripts/build-windows.sh
      bash desktop/scripts/export-windows.sh
      printf 'Windows desktop artifacts are available in %s/out/windows\n' "$root"
      ls -lh out/windows
      ;;
  esac
done
