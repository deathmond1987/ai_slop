#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm test
npm run lint
npx tsc --noEmit
npm run build
