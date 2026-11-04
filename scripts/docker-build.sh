#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-steam-calendar:latest}"

docker build --tag "$IMAGE" .
