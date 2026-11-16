#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-archlinux:latest}"
OUT_DIR="${OUT_DIR:-out/linux}"
DEB_FILE="${DEB_FILE:-}"
ARCH_NAME="${ARCH_NAME:-x86_64}"
PKG_NAME="${PKG_NAME:-steam-calendar}"
VERIFY_ARCH="${VERIFY_ARCH:-0}"
PULL_IMAGE="${PULL_IMAGE:-0}"

if [ "$PULL_IMAGE" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker pull "$IMAGE" >/dev/null
fi

if [ -z "$DEB_FILE" ]; then
  DEB_FILE="$(find "$OUT_DIR" -maxdepth 1 -type f -name 'steam-calendar_*.deb' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
fi

if [ -z "$DEB_FILE" ]; then
  echo "No Debian package found under $OUT_DIR." >&2
  echo "Run desktop/scripts/export-linux.sh first." >&2
  exit 1
fi

if [ ! -f "$DEB_FILE" ]; then
  echo "Debian package not found: $DEB_FILE" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

container_name="steam-calendar-arch-package-$$"
container_id="$(docker create --name "$container_name" "$IMAGE" sleep 3600)"

cleanup() {
  docker rm -f "$container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker cp "$DEB_FILE" "$container_id":/tmp/steam-calendar.deb
docker start "$container_id" >/dev/null

docker exec "$container_id" bash -euo pipefail -c '
  pacman -Sy --noconfirm >/tmp/pacman-sync.log
  pacman -S --noconfirm --needed base-devel binutils fakeroot libarchive >/tmp/pacman-install.log

  mkdir -p /tmp/pkgbuild
  cd /tmp/pkgbuild

  ar x /tmp/steam-calendar.deb

  control_archive="$(find . -maxdepth 1 -type f -name "control.tar.*" -printf "%f\n" | head -1)"
  if [ -z "$control_archive" ]; then
    echo "Could not find control.tar.* inside Debian package" >&2
    exit 1
  fi

  mkdir -p control
  bsdtar -C control -xf "$control_archive"

  pkgver="$(sed -n "s/^Version: //p" control/control | head -1)"
  pkgdesc="$(sed -n "s/^Description: //p" control/control | head -1)"
  if [ -z "$pkgver" ]; then
    echo "Could not read Version from control/control" >&2
    exit 1
  fi
  if [ -z "$pkgdesc" ]; then
    pkgdesc="Linux desktop wrapper for Steam Calendar with a local Next.js sidecar"
  fi

  data_archive="$(find . -maxdepth 1 -type f -name "data.tar.*" -printf "%f\n" | head -1)"
  if [ -z "$data_archive" ]; then
    echo "Could not find data.tar.* inside Debian package" >&2
    exit 1
  fi

  mkdir -p pkgdir
  bsdtar -C pkgdir -xf "$data_archive"

  cat >PKGBUILD <<EOF
# Maintainer: Steam Calendar
pkgname=steam-calendar
pkgver=$pkgver
pkgrel=1
pkgdesc="$pkgdesc"
arch=("'"$ARCH_NAME"'")
url="https://github.com/example/steam-calendar"
license=("MIT")
depends=("gtk3" "webkit2gtk-4.1")
options=(!debug !strip)

package() {
  cp -a /tmp/pkgbuild/pkgdir/. "\$pkgdir/"
}
EOF

  id builder >/dev/null 2>&1 || useradd -m builder
  chown -R builder:builder /tmp/pkgbuild

  su -s /bin/bash builder -c "cd /tmp/pkgbuild && makepkg -p /tmp/pkgbuild/PKGBUILD --noextract --skipchecksums --skippgpcheck --nodeps --noconfirm"

  find /tmp/pkgbuild -maxdepth 1 -type f -name "steam-calendar-*.pkg.tar.zst" -printf "%T@ %p\n" | sort -nr | head -1 | cut -d" " -f2- >/tmp/arch-package-path
'

arch_package_path="$(docker exec "$container_id" bash -lc 'cat /tmp/arch-package-path')"
if [ -z "$arch_package_path" ]; then
  echo "Arch package was not generated." >&2
  docker exec "$container_id" bash -lc 'ls -R /tmp/pkgbuild' || true
  exit 1
fi

arch_package_name="$(basename "$arch_package_path")"
docker cp "$container_id:$arch_package_path" "$OUT_DIR/$arch_package_name"
echo "Exported $arch_package_path -> $OUT_DIR/$arch_package_name"

if [ "$VERIFY_ARCH" = "1" ]; then
  docker exec -e "ARCH_PACKAGE_PATH=$arch_package_path" "$container_id" bash -euo pipefail -c '
    pacman -Sy --noconfirm >/dev/null
    pacman -U --noconfirm --nodeps "$ARCH_PACKAGE_PATH" >/tmp/pacman-install.log
    /usr/bin/steam-calendar-node --version >/dev/null
  '
  echo "Arch package verified with pacman -U --nodeps and sidecar binary check."
fi

ls -lh "$OUT_DIR/$arch_package_name"
