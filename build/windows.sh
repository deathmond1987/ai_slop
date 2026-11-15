#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

bash scripts/desktop/build-windows-docker.sh
bash scripts/desktop/export-windows-packages.sh

echo "Windows desktop artifacts are available in $root/out/windows"
ls -lh out/windows
