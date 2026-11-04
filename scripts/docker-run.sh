#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-steam-calendar:latest}"
PORT="${PORT:-3000}"
VOLUME="${VOLUME:-steam-calendar-data}"

docker_env=(
  --env "AUTH_BASE_URL=${AUTH_BASE_URL:-http://localhost:$PORT}"
  --env "DB_SQLITE_PATH=/app/data/steam-calendar.sqlite"
)

if [ -n "${SESSION_PASSWORD:-}" ]; then
  docker_env+=(--env "SESSION_PASSWORD=$SESSION_PASSWORD")
else
  echo "SESSION_PASSWORD is not set. The container entrypoint will generate/persist the session secret and derived encryption key in SQLite volume $VOLUME:/app/data."
fi

if [ -n "${DB_ENCRYPTION_KEY:-}" ]; then
  docker_env+=(--env "DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY")
fi

if [ -n "${RAWG_API_KEY:-}" ]; then
  docker_env+=(--env "RAWG_API_KEY=$RAWG_API_KEY")
fi

if [ -n "${STEAM_API_KEY:-}" ]; then
  docker_env+=(--env "STEAM_API_KEY=$STEAM_API_KEY")
fi

docker run --rm \
  --publish "$PORT:3000" \
  --volume "$VOLUME:/app/data" \
  "${docker_env[@]}" \
  "$IMAGE"
