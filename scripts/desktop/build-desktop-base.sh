#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-desktop-base:latest}"
DOCKERFILE="${DOCKERFILE:-desktop_version/linux/Dockerfile.base}"

node scripts/version.mjs sync

docker build -f "$DOCKERFILE" -t "$IMAGE" .
