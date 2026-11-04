#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ ! -f .env.local ] && [ -f .env.example ]; then
  cp .env.example .env.local
  chmod 600 .env.local
fi

mkdir -p data
