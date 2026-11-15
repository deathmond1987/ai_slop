#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

bash scripts/desktop/build-linux-docker.sh
bash scripts/desktop/export-linux-packages.sh
VERIFY_ARCH="${VERIFY_ARCH:-1}" bash scripts/desktop/build-arch-package.sh

echo "Linux desktop artifacts are available in $root/out/linux"
ls -lh out/linux
