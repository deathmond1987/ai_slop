#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"

npm run dev -- --hostname "$HOSTNAME" --port "$PORT"
