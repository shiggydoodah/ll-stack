# Context: scripts

## Purpose

- Repo-level automation invoked from root `package.json` scripts and the Husky
  hooks: first-run setup, cleanup, staged-file formatting, the Jest guard, the
  Node pin check, and the Postgres init hook Docker Compose mounts.

## Architecture

| File                                 | Invoked by                                    | Does                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup.sh`                           | `pnpm setup`                                  | install → copy both `.env.example` → `docker compose up -d postgres seq` → wait for readiness → `pnpm migrate` → `prisma:generate` → `gen:client` → seed |
| `clean.sh`                           | `pnpm clean` / `clean:turbo` / `clean:gen`    | `pnpm -r run clean`, then optionally drop the turbo cache, `node_modules`, or the generated `packages/services` domains                                  |
| `clean-seq.sh`                       | `pnpm clean:seq`                              | Resets the local Seq container's data                                                                                                                    |
| `format-staged.sh`                   | `.husky/pre-commit`                           | Prettier over staged `ts,tsx,js,mjs,cjs,json,md,css` files, then re-stages them                                                                          |
| `jest-open-handle-guard.mjs`         | `pnpm --filter @repo/backend test`            | Wraps Jest; reports leaked handles and recognises the V8 OOM banner instead of an anonymous signal                                                       |
| `check-node-pin.mjs`                 | `pnpm check:node-pin`, first in `pnpm verify` | Fails the run when the six files that state the repo's Node version disagree                                                                             |
| `postgres-init/01-create-test-db.sh` | Postgres container first boot                 | `CREATE DATABASE llstack_test` alongside `llstack_dev`                                                                                                   |

## Key Flows

- A fresh clone is expected to be one `pnpm setup` away from a working stack.
  The seed is idempotent so re-running under `set -e` is safe.
- `.husky/pre-push` (not in this directory) blocks direct pushes to
  `main`/`master` unless every changed path is under `docs/`.

## Gotchas

- `clean.sh` takes **one** positional flag; `--generated` and `--turbo-cache`
  are not combinable as written, and the no-flag path removes `node_modules`
  and `.pnpm-store`.
- `clean:gen` removes `packages/services/src/{health,auth,users}` by name — the
  list has drifted from `DOMAIN_MANIFEST` (which also has `dashboard`). Update
  both together when adding a domain.
- `postgres-init/` only runs on an **empty** data volume; an existing local
  volume needs `CREATE DATABASE llstack_test` by hand (CI does exactly that,
  because a service container cannot mount the script).
- `check-node-pin.mjs` compares **files**, not the Node the process is running
  on. A consistent set of pins says nothing about whether your shell actually
  picked them up — `jest-open-handle-guard.mjs` covers that separately, and
  only as a non-fatal warning.
- `check-node-pin.mjs` treats an `engines.node` range it cannot parse as a
  failure, not a skip. Only the `>=X.Y.Z` form is understood; widening that
  field means updating the script in the same edit.
- `format-staged.sh` includes `.mjs`/`.cjs` deliberately — the repo's own config
  files use them, and omitting them buried real diffs under later reformats.

## Agent Notes

- Changing a script that affects the app or the developer workflow requires
  validation (see the `AGENTS.md` validation matrix).
- Backend-specific tooling lives in `apps/backend/scripts/`, not here.
