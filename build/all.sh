#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

bash "$root/build/linux.sh"
bash "$root/build/windows.sh"

echo "Desktop artifacts:"
ls -lh "$root/out/linux" "$root/out/windows"
