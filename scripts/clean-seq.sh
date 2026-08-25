#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Clearing all Seq logs (resetting the seq-data volume)..."

# Resolve the real named volume mounted at /data before we remove the container,
# so we don't have to guess the compose project prefix.
SEQ_CONTAINER="$(docker compose ps -aq seq)"
SEQ_VOLUME=""
if [[ -n "$SEQ_CONTAINER" ]]; then
  SEQ_VOLUME="$(docker inspect -f '{{ range .Mounts }}{{ if eq .Destination "/data" }}{{ .Name }}{{ end }}{{ end }}' "$SEQ_CONTAINER")"
fi

# No live container (e.g. after `docker compose down`, which removes containers
# but keeps named volumes)? Resolve the volume by its exact Compose labels so we
# still wipe the logs instead of silently no-opping. Labels are exact, so this
# keeps the "don't guess the project prefix" goal.
if [[ -z "$SEQ_VOLUME" ]]; then
  SEQ_VOLUME="$(docker volume ls -q \
    --filter label=com.docker.compose.project="$(basename "$ROOT_DIR")" \
    --filter label=com.docker.compose.volume=seq-data)"
fi

docker compose rm -fs seq

CLEARED=false
if [[ -n "$SEQ_VOLUME" ]]; then
  # Tolerate a failed removal (e.g. volume still referenced) so `up -d` always
  # runs and a clean attempt never leaves Seq stopped.
  if docker volume rm "$SEQ_VOLUME"; then
    CLEARED=true
  else
    echo "Warning: failed to remove volume '$SEQ_VOLUME'; old logs may remain." >&2
  fi
else
  echo "Warning: could not resolve the seq-data volume; old logs were left in place." >&2
fi

docker compose up -d seq

if [[ "$CLEARED" == true ]]; then
  echo "Seq logs cleared. UI: http://localhost:8087"
else
  echo "Seq restarted, but logs were NOT cleared (see warnings above). UI: http://localhost:8087" >&2
fi
