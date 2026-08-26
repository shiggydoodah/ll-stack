#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOVE_GENERATED=false
if [[ "${1:-}" == "--generated" ]]; then
  REMOVE_GENERATED=true
fi

REMOVE_TURBO_CACHE=false
if [[ "${1:-}" == "--turbo-cache" ]]; then
  REMOVE_TURBO_CACHE=true
fi

echo "Cleaning workspace artifacts & removing dependencies..."
pnpm -r --if-present run clean
# Optionally remove Turbo cache if --turbo-cache is passed
if [[ "$REMOVE_TURBO_CACHE" == "true" ]]; then
  rm -rf .turbo
else
  echo "Skipping Turbo cache removal. Pass --turbo-cache to remove it."
  rm -rf node_modules
  rm -rf .pnpm-store
  rm -rf .turbo
fi

# Optionally remove generated files and services if --generated is passed
if [[ "$REMOVE_GENERATED" == "true" ]]; then
  rm -rf packages/services/src/health
  rm -rf packages/services/src/auth
  rm -rf packages/services/src/users
  rm -f packages/services/.source-hash
fi

echo "Clean complete."
