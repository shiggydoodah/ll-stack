# Context: . (repo root)

## Purpose

- pnpm + Turborepo monorepo for **LL Stack** — a full-stack TypeScript
  boilerplate (NestJS backend, Next.js frontend, Playwright E2E, shared
  packages). It is a foundation to build products on, not a product; ask the
  user when a task needs product intent.
- The root owns workspace wiring, the validation ladder, formatting, git hooks,
  Docker Compose for local backing services, and repo-wide agent rules.

## Architecture

- Workspaces: `apps/*` + `packages/*` (`pnpm-workspace.yaml`). Dependency
  versions are pinned centrally via the pnpm **catalog** in the same file —
  package manifests mostly say `catalog:`, not a version.
- `turbo.json` — task graph. `build`/`typecheck`/`test`/`test:e2e` all
  `dependsOn: ["^build"]`, so workspace packages are built before dependents.
  Turbo runs in **strict env mode**; `VERIFY_SWEEP` is declared as
  `passThroughEnv` so it reaches the vitest configs without entering the cache
  hash.
- `package.json` — the command surface. Read its `//`-prefixed sibling keys
  (`//test`, `//verify`): they are load-bearing explanations of why the
  concurrency and smoke-test ordering are what they are.
- `eslint.config.mjs` — one flat config for the whole repo. Enforces: no
  `[var(--…)]` Tailwind longhand, form controls need an `id`, `const` arrow
  functions in `.tsx`, no `console.*` in the frontend (except `lib/logging/**`),
  no raw `PrismaClient` in backend feature code, no imports from any
  `dist/`/`build/`. Generated client output is ignored.
- `docker-compose.yml` — Postgres 16 on host port **5433** (not 5432) and Seq
  (UI `:8087`, OTLP ingest `:5342`). `scripts/postgres-init/` creates
  `llstack_test` alongside `llstack_dev` on first boot.
- `.husky/` — pre-commit runs `scripts/format-staged.sh`; pre-push blocks direct
  pushes to `main`/`master` unless every changed path is under `docs/`.

## Key Flows

- **Contract flow:** Nest controllers + DTOs → Swagger/OpenAPI →
  `packages/services` generation → typed imports in `apps/frontend/lib/gateway`.
  Never hand-edit generated client output; change the backend contract and run
  `pnpm gen:client`.
- **Validation ladder (`pnpm verify`):** `prisma:lint` → `lint` → `build` →
  `smoke:dist` → `smoke:tsnode` → `check:drift` → `typecheck` → `test`. The two
  smokes prove the built `dist/` and the ts-node dev pipeline can actually load;
  `check:drift` fails when a backend contract change shipped without
  regenerating clients. `verify:backend` / `verify:frontend` / `verify:ui` are
  narrower ladders over the same steps.
- **Local setup:** `pnpm setup` → install, copy both `.env.example` files,
  `docker compose up -d postgres seq`, migrate both databases, `prisma
generate`, `gen:client`, seed.

## Integrations

- **Postgres** — `llstack_dev` and `llstack_test` on `localhost:5433`.
  `pnpm migrate` deploys migrations to both.
- **Seq** — local log sink; both apps can point `LOG_SINK=seq` at it.
- **CI** (`.github/workflows/ci.yml`) — runs the same ladder plus
  `format:check` and `pnpm test:e2e`. It runs no command you cannot run locally.

## Gotchas

- Postgres is on **5433**, and the same container is shared with other local
  projects in this developer's setup — a port collision is a real failure mode.
- Root `postinstall` runs `prisma generate`; `prisma.config.ts` omits the
  datasource URL so that works with no live database.
- `pnpm test` sets `VERIFY_SWEEP=1` and `--concurrency=1` deliberately (see the
  `//test` key). A cold-cache standalone `pnpm test` serializes the `^build`
  fan-in too — run `pnpm build` first if wall time matters.
- Documentation/reference-only changes may skip validation; anything touching
  app, package, tooling, generated, schema, or CI code may not.
- `.temp/` and `docs/features/.backlog/` are do-not-auto-read (see `AGENTS.md`).

## Agent Notes

- Read `AGENTS.md` first for non-negotiables, path shortcuts, and reporting
  rules. `CLAUDE.md` defers to it.
- Use `CONTEXT-MAP.md` to pick the smallest relevant area, then that area's
  `CONTEXT.md`. When the user names a path (or a Path Shortcut), go straight
  there instead.
- Deep standards live in `docs/charters/*.md` (rationale) and
  `docs/agents/*.agents.md` (enforcement runbooks) — read the runbook for the
  area you are touching before writing code.
