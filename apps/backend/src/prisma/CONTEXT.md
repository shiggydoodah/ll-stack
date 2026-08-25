# Context: apps/backend/src/prisma

## Purpose

- The one Prisma client for the whole service, its lifecycle, and slow-query
  logging.
- Read/edit here only for client construction, connection lifecycle, or query
  instrumentation — data access itself belongs in feature services.

## Architecture

- `prisma.module.ts` — `@Global()`, provides and exports `PrismaService`, so no
  feature module has to import it.
- `prisma.service.ts` — extends `PrismaClient` with the `'query'` event type,
  built on the `@prisma/adapter-pg` driver adapter from `DATABASE_URL`.
  `onModuleInit` registers the slow-query handler and connects;
  `onModuleDestroy` disconnects.
- `prisma-slow-query-logger.ts` — `createSlowQueryHandler(thresholdMs)` warns
  with the `db.query.slow` event, carrying `durationMs`, `thresholdMs`, and
  `target` (never the query parameters).

## Key Flows

- Feature service injects `PrismaService` → queries → `$transaction` where a
  consistent snapshot matters (e.g. the dashboard read).
- `LOG_SLOW_QUERY_THRESHOLD_MS` (default 500 ms) drives the warning.

## Integrations

- `apps/backend/prisma/schema.prisma` is the schema; `prisma generate` produces
  the client (run by the root `postinstall`).
- `@prisma/instrumentation` is registered by the OpenTelemetry bootstrap in
  `common/telemetry/`.

## Gotchas

- `onModuleInit` **skips connecting** under `NODE_ENV=test` and during OpenAPI
  extraction (`OPENAPI_EXTRACT=true`), so those paths need no live database.
  Integration specs connect through their own app setup.
- A second `PrismaClient` is a second unmanaged connection pool that also skips
  slow-query logging — ESLint blocks the import outside this directory and
  `*.spec.ts`.
- The adapter reads `DATABASE_URL` at construction, so a spec that rewrites
  `process.env.DATABASE_URL` must do it before building the module.

## Agent Notes

- Do not add query middleware here without a reason that applies to every
  feature; per-feature concerns belong in the service.
- Covered by `test/prisma.service.spec.ts` and
  `test/prisma-slow-query-logger.integration.spec.ts`.
