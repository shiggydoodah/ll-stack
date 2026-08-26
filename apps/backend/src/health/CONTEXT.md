# Context: apps/backend/src/health

## Purpose

- The public liveness/readiness probe: `GET /health`. The only route carrying
  `@SkipApiSecret()` — infrastructure probes cannot hold the internal shared
  secret.

## Architecture

- `health.controller.ts` — thin; supplies the version from
  `npm_package_version`.
- `health.service.ts` — `SELECT 1` against Prisma, mapped to `up`/`down`.
- `dto/health-response.dto.ts` — `{ status, version, timestamp, uptimeSeconds,
database: { status } }`.

## Key Flows

- A database outage answers **HTTP 200** with `status: "degraded"` and
  `database.status: "down"`, deliberately: pulling the process out of rotation
  for a dependency outage takes the platform down with the database.
- A 500 here means the process itself failed (an unhandled failure in the
  enhancers), not its dependency — and it is documented via
  `@ApiInternalErrorResponse` precisely so probe authors can tell the two apart.

## Integrations

- `PrismaService` for the liveness query.
- `bootstrap/configure-app.ts` clears the document-wide `x-api-secret`
  requirement on this operation so the published contract is not factually
  wrong.
- Excluded from the access log (`common/logging/logger.config.ts`).
- Used as the readiness URL by `apps/testing/playwright.config.ts`.

## Gotchas

- A probe that treats any non-200 as dead must read the body on this route.
- Keep it dependency-light; it runs constantly and is unauthenticated.

## Agent Notes

- Adding a dependency check means deciding, explicitly, whether its failure is
  `degraded` (200) or fatal — the current answer for the database is `degraded`.
- Covered by `test/health.service.spec.ts` and `test/app.e2e-spec.ts`.
