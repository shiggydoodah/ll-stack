# Context: apps/backend/src

## Purpose

- The Nest application itself: composition root, cross-cutting infrastructure,
  and the feature modules.
- Start here when you need to know _where_ something lives before opening files.

## Architecture

| Path            | Owns                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `main.ts`       | Boot order: env validate → telemetry → deferred Nest imports → listen                                                   |
| `app.module.ts` | Module graph, global filter/interceptor/guards, middleware binding                                                      |
| `bootstrap/`    | `configureApp`, OpenAPI document + `/docs` mount, boot-failure reporting                                                |
| `config/`       | `env.schema.ts` — the zod contract for every environment variable                                                       |
| `common/`       | Guards, exception filter, trace interceptor, request-id middleware, logging, telemetry, throttling storage, small utils |
| `prisma/`       | The single `PrismaService` and slow-query logging                                                                       |
| `health/`       | `GET /health` — the public probe                                                                                        |
| `auth/`         | Register / login / logout, sessions, `SessionGuard`, named throttlers                                                   |
| `users/`        | `GET /users/me`                                                                                                         |
| `dashboard/`    | `GET /dashboard` — the example authenticated read                                                                       |

Each feature directory has (or should get) its own `CONTEXT.md`; `auth`,
`users`, and `dashboard` already do.

## Key Flows

- Global order is fixed in `app.module.ts`: middleware → `AppThrottlerGuard` →
  `ApiSecretGuard` → route guards → `ValidationPipe` → handler →
  `TraceIdInterceptor`; `HttpExceptionFilter` catches everything.
- A new feature module is: `<feature>.module.ts` (registered in
  `app.module.ts`), a thin controller, a Prisma-owning service, `dto/`, and a
  `CONTEXT.md`. Add its Swagger tag in `bootstrap/configure-app.ts` and its
  operation ids to `operationIdsByControllerMethod`.

## Integrations

- `@repo/logging` (sinks + redaction), `@repo/schema` (shared zod primitives
  used by DTO validation), `@repo/utils`.
- `@prisma/client` via `PrismaService` only.

## Gotchas

- `main.ts` imports almost everything **dynamically** on purpose — a static
  import of `AppModule` would load Express/Prisma before OpenTelemetry could
  patch them. `report-boot-failure` is the one static import, because a handler
  that has to `await import` its own reporter loses the error.
- Feature code must not import `PrismaClient` directly (ESLint enforced).
- Config is read through the typed `ConfigService<Env>`, not `process.env` —
  the few exceptions (`AppThrottlerGuard`, `OPENAPI_EXTRACT`) document why.

## Agent Notes

- Read `docs/agents/backend.agents.md` first. Then the nearest module
  `CONTEXT.md`; only then source files.
- Route/guard classification is pinned by `test/route-inventory.spec.ts` — a new
  route fails that spec until it is registered there deliberately.
