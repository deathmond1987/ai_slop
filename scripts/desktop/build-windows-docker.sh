#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-windows-build:latest}"
DOCKERFILE="${DOCKERFILE:-desktop_version/linux/Dockerfile.build.windows}"

node scripts/version.mjs sync

docker build -f "$DOCKERFILE" -t "$IMAGE" .
