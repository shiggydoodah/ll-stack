#!/usr/bin/env sh
set -eu

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

staged_files="$(mktemp "${TMPDIR:-/tmp}/llstack-staged-files.XXXXXX")"
prettier_files="$(mktemp "${TMPDIR:-/tmp}/llstack-prettier-files.XXXXXX")"
trap 'rm -f "$staged_files" "$prettier_files"' EXIT HUP INT TERM

git diff --cached --name-only --diff-filter=ACMR -z >"$staged_files"

if [ ! -s "$staged_files" ]; then
  exit 0
fi

# `.mjs`/`.cjs` are the same language as `.js` under a different extension, and
# the repo's own config files use them (`eslint.config.mjs`,
# `apps/backend/scripts/ts-node-resolve-js-ext.cjs`). Omitting them meant a commit
# touching one landed unformatted and the next `pnpm format` reformatted the whole
# file, so the real diff arrived buried in a quote-style change.
xargs -0 sh -c '
  for file do
    case "$file" in
      *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.md|*.css) printf "%s\0" "$file" ;;
    esac
  done
' sh <"$staged_files" >"$prettier_files"

if [ ! -s "$prettier_files" ]; then
  exit 0
fi

echo "Formatting staged files with Prettier..."
xargs -0 pnpm exec prettier --write --ignore-unknown -- <"$prettier_files"
xargs -0 git add -- <"$prettier_files"
