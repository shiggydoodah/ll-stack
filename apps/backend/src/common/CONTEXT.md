# Context: apps/backend/src/common

## Purpose

- Cross-cutting infrastructure every feature module inherits: guards, the
  exception filter, the trace interceptor, request-id middleware, logging
  config, telemetry, the throttler store, and small shared utilities.
- Read/edit here when changing what happens _around_ a handler rather than
  inside one.

## Architecture

| Path                                                                             | Owns                                                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guards/api-secret.guard.ts`                                                     | Global `x-api-secret` trust boundary; opt out with `@SkipApiSecret()`                                                                             |
| `guards/app-throttler.guard.ts`                                                  | Base for every throttler; the single `handleRequest` chokepoint and the shared `Retry-After` arithmetic                                           |
| `guards/admin-api-key.guard.ts`                                                  | `x-admin-key` for admin-only routes                                                                                                               |
| `throttling/bounded-throttler.storage.ts`                                        | Bounded in-process `ThrottlerStorage` with background prune                                                                                       |
| `filters/http-exception.filter.ts`                                               | The uniform error envelope + error logging                                                                                                        |
| `filters/api-error-response.dto.ts` / `api-internal-error-response.decorator.ts` | The documented error shape for OpenAPI                                                                                                            |
| `interceptors/trace-id.interceptor.ts`                                           | `x-trace-id` header + additive `traceId` on success bodies                                                                                        |
| `middleware/request-id.middleware.ts`                                            | Validates/mints `x-request-id`, stashes `x-correlation-id`                                                                                        |
| `logging/`                                                                       | `logger.config.ts` (nestjs-pino params, redaction, access-log rules), `log-events.ts` (the event catalog), `error-log-mapper.ts`                  |
| `telemetry/`                                                                     | `backend-telemetry.ts` (NodeSDK bootstrap), `metrics.ts` (typed lazy instruments)                                                                 |
| `constants/`, `decorators/`, `utils/`                                            | `SKIP_API_SECRET_KEY`, `@SkipApiSecret()`, `secretsMatch`, `mask-email`, `request-id`, `trace-context`, `short-hash`, `uuid`, `unique-constraint` |

## Key Flows

- **Correlation:** `RequestIdMiddleware` decides the request id (validated
  inbound header or fresh), echoes it on the response, and stashes
  `correlationId` (falling back to `requestId`). `buildLogCorrelationProps`
  stamps `requestId`/`correlationId`/`sessionId`/`traceId`/`spanId` onto every
  log line, merged **last** so caller context cannot overwrite them.
- **Redaction is two-layered:** pino `redact` paths cover the request/response
  envelope at fixed positions; `sanitizeLogRecord` from `@repo/logging` walks
  the whole record by field _name_. New sensitive field names go in
  `packages/logging/src/log-redaction.ts`'s `SENSITIVE_KEYWORDS`, not in the
  path list.
- **Access log exclusions:** `GET/HEAD` on `/docs`, `/docs-json` (and subpaths)
  and `/health` are not access-logged.
- **Errors:** ≥500 responses are flattened to `Internal server error` in the
  body and logged at `error`; 4xx keep their message and log at `warn`. Both
  carry the same resolved `path` and `traceId` as the response.

## Integrations

- `@repo/logging` — sinks, redaction, `resolveRequestPath`, per-env level
  defaults.
- `@opentelemetry/*` + `@prisma/instrumentation` — started from `main.ts`
  before Nest loads.

## Gotchas

- `ApiSecretGuard` is registered **after** `AppThrottlerGuard` in
  `app.module.ts` deliberately; reordering makes the shared secret guessable at
  line rate.
- `BoundedThrottlerStorage` replaces the package default (which never deletes a
  key) and is constructed per container via `forRootAsync` — a shared instance
  would be cleared by the first `app.close()` in a multi-app spec.
- At the store's key ceiling it **fails closed** (429s new keys) rather than
  evicting a blocked caller, and logs `system.throttle_store.saturated` with a
  reason only — throttle keys embed IPs and hashed identifiers.
- `retryAfterSecondsFor` does **not** divide by 1000: the storage contract
  already returns seconds. It uses `timeToBlockExpire`, not `timeToExpire`.
- `TraceIdInterceptor` merges `traceId` into plain object bodies only — arrays,
  primitives, Buffers, and streams pass through untouched. It is not an
  envelope.
- `metrics.ts` labels must stay coarse enums / opaque ids; new instruments are
  declared in that file, never inline at a call site.
- Telemetry must start before Express/Prisma are imported, otherwise the
  instrumentations never patch.

## Agent Notes

- New log line → add its name to `log-events.ts` first (three dot-separated
  segments, enforced by `BACKEND_LOG_EVENT_NAME_PATTERN`), and log reasons and
  ids, never emails, tokens, or raw payloads.
- Public endpoints get `@SkipApiSecret()` and must be justified — `/health` is
  the only current one.
- Covered by `test/request-id-middleware.spec.ts`,
  `test/log-correlation-props.spec.ts`, `test/bounded-throttler-storage.spec.ts`,
  `test/throttle-store-wiring.spec.ts`,
  `test/trace-id-interceptor.integration.spec.ts`,
  `test/backend-telemetry.spec.ts`.
