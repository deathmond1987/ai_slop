#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export NODE_ENV="${NODE_ENV:-production}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export DB_SQLITE_PATH="${DB_SQLITE_PATH:-$PWD/data/steam-calendar.sqlite}"

npm run build

rm -rf .next/standalone/public .next/standalone/.next/static
cp -R public .next/standalone/
cp -R .next/static .next/standalone/.next/

node .next/standalone/server.js
