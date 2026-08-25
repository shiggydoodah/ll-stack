# Context: apps/backend/test

## Purpose

- The backend's Jest suite: unit specs, integration specs that boot the real
  `AppModule` against Postgres, and the shared helpers/guards that make a
  parallel, destructive suite safe.

## Architecture

- `jest.config.cjs` (in `apps/backend/`) is the operating manual — read its
  comments before changing anything here.
- `global-setup.ts` — clones the base test database once per run
  (`CREATE DATABASE … TEMPLATE`) so worker N > 1 gets `<base>_wN`. Postgres
  unreachable or base database missing → warn and continue (unit-only runs still
  work); cloning failure → throw.
- `helpers/test-database-url.ts` — `getTestDatabaseUrl()` (worker-scoped,
  idempotent) and `assertTestDatabaseUrl()` (the destructive-cleanup guard;
  refuses anything that is not a `*_test` database).
- `helpers/app-module-test-env.ts` — the minimum env `AppModule` needs to be
  _constructed_, in one place. Deliberately not exhaustive: only variables the
  schema requires, plus the argon2 cost dial-down.
- `helpers/listen-test-server.ts`, `helpers/rate-limiting.ts` — supertest server
  lifecycle and throttle-window helpers.
- `silence-nest-logger.ts` — `setupFilesAfterEach` shim that quiets the static
  `@nestjs/common` Logger.
- `route-inventory.spec.ts` — pins every route's guard/throttle classification.
  A new endpoint fails here until it is registered deliberately.

## Key Flows

- `pnpm --filter @repo/backend test` runs through
  `scripts/jest-open-handle-guard.mjs` (repo root), which reports leaked handles
  and recognises the V8 OOM banner.
- Integration specs reset shared tables with `deleteMany()` in `beforeEach`,
  which is why each worker needs its own database.
- `pnpm migrate` must have been run (it migrates both `llstack_dev` and
  `llstack_test`) before integration specs will pass.

## Gotchas

- `maxWorkers: 2` and `workerIdleMemoryLimit: '1500MB'` are pinned to a
  low-spec machine on purpose, not derived from the host — every developer and
  CI runner resolves to the same worker count. The memory bound turns a future
  footprint regression into a worker recycle instead of a SIGABRT.
- `testTimeout: 30000` — ~26 suites build the full `AppModule` in `beforeAll`.
- ts-jest is pinned back to CommonJS (`module: CommonJS`,
  `moduleResolution: node`, `ignoreDeprecations`) because `module: node20`
  preserves real dynamic `import()`, which escapes Jest's module registry. The
  `'^(\.{1,2}/.*)\.js$'` mapper strips the `.js` extension those imports carry.
- `uuid@14` and `cookie@2` are ESM-only and ride an anchor-based
  `transformIgnorePatterns` exception; do not "simplify" that regex.
- `CREATE DATABASE … TEMPLATE` needs zero live connections on the template —
  close psql/Prisma Studio/a dev server pointed at `llstack_test` before running.
- `AUTH_SESSION_PRUNE_ENABLED` defaults off under test so a background sweep
  cannot race a spec's own cleanup; the prune spec turns it back on explicitly.

## Agent Notes

- New integration spec → use `applyAppModuleTestEnv` and
  `assertTestDatabaseUrl`; never point a spec at a non-`*_test` database.
- Prefer extending an existing spec file over adding another full-app bootstrap.
- See `docs/charters/testing.md` (currently a stub) and the testing sections of
  `docs/agents/backend.agents.md`.
