# Context: apps/testing

## Purpose

- The Playwright end-to-end workspace. It boots the **real** backend and
  frontend against the test database and drives them through a browser — the
  only place in the repo where the whole stack runs together.

## Architecture

- `playwright.config.ts` — the harness. Loads the committed `.env.test`, pins
  ports (backend 3100, frontend 4100), and declares two `webServer` entries with
  explicitly injected env (`backendEnv`, `frontendEnv`), so a developer's own
  `.env` cannot desync the suite from the stack it boots.
- `global-setup.ts` / `global-teardown.ts` — database preparation and cleanup
  around the run.
- `src/prisma.ts` — the harness's own Prisma client for fixture setup and
  cleanup.
- `tests/frontend-smoke.spec.ts` — the current suite. `testMatch` is pinned to
  it; auth flows land with their feature.
- `.env.test` / `.env.test.example` — committed, non-secret; the dev secret
  values must stay byte-identical with both apps' `.env.example` files.

## Key Flows

- `pnpm test:e2e` (root) → turbo → `playwright test`. The harness builds the
  backend's workspace dependencies first (`pnpm --filter "@repo/backend^..."
build`) because the backend is CommonJS and resolves `@repo/*` through their
  `require` export condition at runtime.
- Backend readiness is `GET http://localhost:3100/health`; frontend readiness is
  the root URL.
- `RATE_LIMITING_ENABLED=false` is injected into the backend so the suite can
  drive many requests from one localhost IP. The backend env schema refuses that
  value in staging/production, so it cannot leak into a deployment.

## Integrations

- `@repo/backend` and `@repo/frontend` are booted as subprocesses, not imported.
- `llstack_test` on `localhost:5433`; `pnpm migrate` must have run.
- CI runs this as a separate `e2e` job (`.github/workflows/ci.yml`).

## Gotchas

- **Server reuse is opt-in** (`PLAYWRIGHT_REUSE_SERVER`). By default the harness
  always starts its own processes: attaching to whatever already holds the ports
  would silently run the suite against a dev `llstack_dev` backend, bypassing
  every env override — and `assertTestDatabaseUrl` only guards the harness's own
  cleanup client, not a reused server.
- `dotenv` does not override variables already in the environment, so exporting
  vars first is how you point the suite at another stack (e.g. CI).
- `test:e2e` is `cache: false` in `turbo.json` and takes `FRONTEND_BASE_URL` as
  its only declared env input.

## Agent Notes

- New E2E spec → add it to `tests/` and widen `testMatch` deliberately.
- Prefer backend integration specs (`apps/backend/test/`) for API behaviour;
  keep this suite for genuinely cross-tier journeys.
- Not runnable without Postgres up and both apps buildable.
