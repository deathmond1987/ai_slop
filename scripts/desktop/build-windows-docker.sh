#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

IMAGE="${IMAGE:-steam-calendar-windows-build:latest}"
BASE_IMAGE="${BASE_IMAGE:-steam-calendar-desktop-base:latest}"
DOCKERFILE="${DOCKERFILE:-desktop_version/linux/Dockerfile.build.windows}"

node scripts/version.mjs sync

if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  IMAGE="$BASE_IMAGE" bash scripts/desktop/build-desktop-base.sh
fi

docker build \
  -f "$DOCKERFILE" \
  --build-arg "BASE_IMAGE=$BASE_IMAGE" \
  -t "$IMAGE" \
  .
