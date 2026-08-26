#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

copy_env_if_missing() {
  local example_file="$1"
  local env_file="$2"

  if [[ -f "$env_file" ]]; then
    return
  fi

  cp "$example_file" "$env_file"
  echo "Created $env_file from $example_file"
}

wait_for_postgres() {
  local attempts=30
  local sleep_seconds=2

  for _ in $(seq 1 "$attempts"); do
    if docker compose exec -T postgres pg_isready -U postgres -d llstack_dev >/dev/null 2>&1; then
      echo "Postgres is ready."
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Postgres did not become ready in time." >&2
  return 1
}

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install pnpm 11 and rerun." >&2
  exit 1
fi

echo "Installing dependencies..."
pnpm install

copy_env_if_missing "apps/backend/.env.example" "apps/backend/.env"
copy_env_if_missing "apps/frontend/.env.example" "apps/frontend/.env"

if docker compose version >/dev/null 2>&1; then
  echo "Starting postgres and seq via docker compose..."
  if docker compose up -d postgres seq; then
    wait_for_postgres
  else
    echo "Could not start backing services with docker compose. Expecting local Postgres at apps/backend/.env DATABASE_URL."
  fi
else
  echo "docker compose not found. Expecting local Postgres at apps/backend/.env DATABASE_URL."
fi

echo "Applying Prisma migrations..."
pnpm migrate

echo "Generating Prisma Client..."
pnpm --filter @repo/backend prisma:generate

echo "Generating services client..."
pnpm gen:client

# A fresh clone comes up with the dev users in place. The seed is idempotent
# (find-or-create), so a re-run of `pnpm setup` is safe under `set -e`.
echo "Seeding development data..."
pnpm --filter @repo/backend seed

echo "Setup complete."
