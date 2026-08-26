# Context: .github

## Purpose

- CI, dependency automation, the PR template, and the Copilot/agent review
  instruction set. CI is a **backstop** for the local `pnpm verify` ladder, not
  a different pipeline.

## Architecture

- `workflows/ci.yml` — one active job on push-to-`main`, PRs, and manual
  dispatch:
  - `verify` — Postgres 16 service on host port **5433** (mirroring
    `docker-compose.yml`), copies both `.env.example` files, creates
    `llstack_test`, `pnpm migrate`, `pnpm format:check`, then `pnpm verify`.
  - `e2e` — **commented out**, deliberately. Playwright does not run on GitHub;
    it stays a local-only gate via `pnpm test:e2e`. The job body is preserved
    in full at the bottom of the workflow and uncomments back verbatim.
  - Concurrency: superseded PR runs are cancelled; `main` runs always complete.
    `permissions: contents: read`.
- `instructions/` — path-scoped review rule files
  (`pr-review.instructions.md` plus `.backend`, `.frontend`, `.e2e`,
  `.packages`, `.services`, `.ui`, `.github-actions` variants).
- `copilot-instructions.md` — the Copilot mirror of `AGENTS.md`/`CLAUDE.md`.
- `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml`.

## Key Flows

- Env files are created from the committed examples in CI on purpose: `next
build` reads env at import time, **and** it means CI fails if an example drifts
  out of the shape its zod schema accepts.
- A red CI build means the local `pnpm verify` was skipped, not that CI runs
  something different.

## Gotchas

- The Postgres service is published on 5433 so the committed `DATABASE_URL`
  defaults work unchanged; do not "fix" it to 5432.
- A GitHub service container cannot mount `scripts/postgres-init`, so
  `llstack_test` is created with an explicit `psql` step in both jobs.
- Node version comes from `.nvmrc`; pnpm from `packageManager` via
  `pnpm/action-setup`, which must stay at **v6 or newer** — v6 is the release
  that added pnpm 11 support and the repo pins pnpm 11.
- `.nvmrc` must stay at **22.13 or newer** and in step with `.tool-versions`.
  pnpm 11 declares `engines.node: >=22.13`, so a lower `.nvmrc` fails CI inside
  `setup-node` — before a single repo command runs — while local dev keeps
  working off the higher `.tool-versions` value. `pnpm check:node-pin`
  (`scripts/check-node-pin.mjs`, first in `pnpm verify`) now catches that drift
  locally, along with the rest of the set: bump `.nvmrc`, `.tool-versions`, the
  root `engines.node`, both Dockerfiles, and the catalog + overrides
  `@types/node` entries together. The check cannot save the CI job it protects —
  by the time it runs there, `setup-node` has already used `.nvmrc` — so a red
  `setup-node` step still means the local `pnpm verify` was skipped.
- Keep `AGENTS.md`, `CLAUDE.md`, and `copilot-instructions.md` in sync when
  changing agent rules.

## Agent Notes

- CI must never run a command a developer cannot run locally — add the step to
  the root `package.json` ladder first, then reference it here.
- Review-scope exclusions (`apps/frontend/app/dev/**`, `docs/**`, generated
  client contents) are defined in `AGENTS.md` and echoed in `instructions/`.
