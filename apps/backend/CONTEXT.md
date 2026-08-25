# Context: apps/backend

## Purpose

- The private NestJS REST API — the only backend service in the repo. Not
  browser-facing: every route sits behind the `x-api-secret` trust boundary and
  is called by the Next.js BFF, never by a browser directly.
- Read/edit here for: routes, guards, DTOs, services, Prisma access, env
  config, auth/sessions, throttling, logging, OpenTelemetry, OpenAPI contract.

## Architecture

- `src/main.ts` — bootstrap. Loads `.env` with `process.loadEnvFile()`,
  validates env, and starts OpenTelemetry **before** dynamically importing
  `NestFactory`/`helmet`/`Logger`/`AppModule`/`configureApp`, so the
  HTTP/Express/Prisma instrumentations patch those modules first. Boot failures
  go through `bootstrap/report-boot-failure.ts` and `process.exit(1)`.
- `src/app.module.ts` — root wiring: `ConfigModule` (zod validate),
  `ThrottlerModule` (60 req/60 s, `forRootAsync` so each container gets its own
  `BoundedThrottlerStorage`), `ScheduleModule`, `LoggerModule` (nestjs-pino),
  `PrismaModule`, and the feature modules. Registers `TraceIdInterceptor`,
  `HttpExceptionFilter`, then `AppThrottlerGuard` **before** `ApiSecretGuard`.
- `src/bootstrap/` — `configureApp` (cookie-parser, trust proxy, global
  `ValidationPipe`, `/docs` mount) and `buildOpenApiDocument`.
- Feature modules under `src/`: `health`, `auth`, `users`, `dashboard`. Each has
  its own `CONTEXT.md` where one exists.
- Infrastructure: `src/common/` (guards, filter, interceptor, middleware,
  logging, telemetry, throttling, utils), `src/config/env.schema.ts`,
  `src/prisma/`.
- `prisma/schema.prisma` — the data model (`User`, `Session`). See
  `prisma/CONTEXT.md`.

## Key Flows

**Request lifecycle:** `RequestIdMiddleware` (validated `x-request-id` /
`x-correlation-id`) → `AppThrottlerGuard` (global 60/min per IP) →
`ApiSecretGuard` (`x-api-secret`, opt out with `@SkipApiSecret()`) → route guard
(`SessionGuard`, named throttlers) → `ValidationPipe` (transform + whitelist +
forbidNonWhitelisted) → handler → `TraceIdInterceptor` (adds `x-trace-id` header
and an additive `traceId` field on object bodies). Errors land in
`HttpExceptionFilter`, which emits the uniform
`{ statusCode, error, message, path, timestamp, traceId }` envelope.

**Auth:** `POST /auth/register` → argon2id hash + consent + session issue;
`POST /auth/login` → timing-equalized verify; `POST /auth/logout` → revoke.
Session tokens are 32 random bytes surfaced once; only the SHA-256 hash is
stored. Cookie `llstack_session`. See `src/auth/CONTEXT.md`.

**OpenAPI:** `scripts/extract-openapi.ts` boots the app in extraction mode (no
DB) and calls `buildOpenApiDocument` directly. `packages/services` consumes the
output; `pnpm --filter @repo/services check:drift` fails when a contract change
shipped without `pnpm gen:client`.

## Integrations

- **Prisma / PostgreSQL** — `PrismaModule` is `@Global()`; inject
  `PrismaService`. `DATABASE_URL` required. `@prisma/adapter-pg` driver adapter.
- **Logging** — nestjs-pino over `@repo/logging` sinks (`LOG_SINK`:
  `stdout | seq | http_otlp`). Every line carries
  `requestId`/`correlationId`/`sessionId`/`traceId`/`spanId`. Event names come
  from `src/common/logging/log-events.ts`.
- **OpenTelemetry** — traces + metrics via one `NodeSDK`, off by default
  (`OTEL_TRACES_ENABLED` / `OTEL_METRICS_ENABLED`). Separate OTLP endpoints from
  the logs sink.
- **`packages/services`** — downstream consumer of the OpenAPI document; it
  must stay in sync with controllers and DTOs.

## Gotchas

- `NODE_ENV` is **required with no default** — every fail-closed rule in
  `env.schema.ts` branches on it, so an omitted value would disarm all of them.
- Guard order in `app.module.ts` is a security control, not style: the throttler
  must be registered before `ApiSecretGuard` so secret-guessing is rate limited.
- `@ApiCookieAuth` overrides document-level security in OpenAPI;
  `configure-app.ts` re-applies both schemes so generated clients keep sending
  `x-api-secret` on session-guarded routes. Removing that breaks every client.
- Committed dev secrets (`dev-backend-api-secret`, `dev-admin-api-key`) are
  refused at boot in staging/production, as is anything under 32 chars.
- Argon2 cost knobs exist for the test suite; staging/production refuse
  weakened values at boot.
- Throttling is in-process, so staging/production refuse to boot with
  `BACKEND_INSTANCE_COUNT > 1` until a shared store exists.
- `/docs*` defaults to development-only; enabling it in a deployed environment
  puts it behind `ADMIN_API_KEY`.
- ESLint forbids constructing a raw `PrismaClient` outside `src/prisma/**` and
  `*.spec.ts` — take the injected `PrismaService`.

## Agent Notes

- **Read `docs/agents/backend.agents.md` before any backend change.** Every
  endpoint needs an explicit guard decision, an explicit throttle decision, and
  typed OpenAPI error responses.
- Keep controllers thin; services own Prisma. Never return Prisma models
  directly — use DTOs.
- A new endpoint usually means: controller + service + DTOs, an
  `operationIdsByControllerMethod` entry and possibly an `.addTag(...)` in
  `bootstrap/configure-app.ts`, a `DOMAIN_MANIFEST` entry in
  `packages/services/scripts/domain-manifest.ts`, `pnpm gen:client`, and a row
  in `test/route-inventory.spec.ts`.
- Not complete until `pnpm verify:backend` passes.
