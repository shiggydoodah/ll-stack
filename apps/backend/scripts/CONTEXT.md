# Context: apps/backend/scripts

## Purpose

- Build/boot/verification tooling that runs _outside_ the Nest request path:
  OpenAPI extraction, the two boot guards `pnpm verify` depends on, the
  development seed, and the ts-node resolver shim every ts-node entry point
  loads.

## Architecture

- `extract-openapi.ts` — boots `AppModule` with `OPENAPI_EXTRACT=true` and
  placeholder env (no database), calls `buildOpenApiDocument`, writes JSON to
  `argv[2]` (default `/tmp/openapi.json`). Backs `pnpm openapi:extract`.
- `dist-boot-guard.mjs` — `pnpm smoke:dist`. Two checks over the built output:
  every `@repo/*` the `dist/` requires must resolve to real JavaScript under
  Node's `require` conditions, and `dist/app.module.js` must genuinely load.
  Does not boot Nest or connect to Postgres.
- `tsnode-boot-guard.cjs` — `pnpm smoke:tsnode`. Mirror image: proves the
  ts-node dev/seed/openapi pipeline (node10 resolver) can still compile and load
  the `AppModule` graph. Env-validation errors are a _pass_ here.
- `ts-node-resolve-js-ext.cjs` — required as a second `-r` flag on every ts-node
  entry point. Strips the `.js` extension `module: node20` forces onto relative
  dynamic imports so ts-node's CommonJS resolver finds the `.ts` source. Scoped
  to this repo's own sources on purpose.
- `seed.ts` + `lib/` — development seed. `assert-local-seed-target.ts` fails
  closed against any non-local database _before_ a client is constructed;
  `load-local-env-file.ts` mirrors ConfigModule's `.env` load.

## Key Flows

- `pnpm gen:client` (in `packages/services`) falls back to
  `pnpm --filter @repo/backend openapi:extract` when no running backend or
  `OPENAPI_SPEC_PATH` is available.
- `pnpm verify` / `verify:backend` run `smoke:dist` immediately after `build`
  and `smoke:tsnode` immediately after that, then `check:drift` (which exercises
  the same ts-node extraction entry point).

## Gotchas

- The two guards exist because nothing else in the verify ladder executes
  `dist/` or the node10 resolver: `build` only proves `tsc` emitted files, and
  ts-node/ts-jest/Next each compile TypeScript themselves. They catch
  ESM-only-dependency and workspace-packaging breakage that otherwise ships
  green and dies at `pnpm dev` or in the container.
- `ts-node-resolve-js-ext.cjs` must load **after** `-r ts-node/register`.
  ts-node's own `experimentalResolver` is broken and is not an alternative.
- The seed is intentionally near-empty (connectivity check only) — it exists so
  the fail-closed posture is already in place when real fixtures arrive.
- `prisma migrate reset` does not run the seed in Prisma 7; `db:reset` chains
  `prisma db seed` explicitly.

## Agent Notes

- Adding a new ts-node entry point means adding both `-r` flags, matching the
  existing scripts in `package.json`.
- Anything here that boots the app must run from `apps/backend` (ts-node reads
  `tsconfig.json` from cwd).
