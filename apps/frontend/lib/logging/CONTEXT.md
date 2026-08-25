# Context: apps/frontend/lib/logging

## Purpose

- Structured logging for both frontend runtimes (Next server and browser), and
  the correlation ids that join a browser event → a Next request → a backend log
  line.

## Architecture

| File                 | Role                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log-events.ts`      | `FRONTEND_LOG_EVENTS` — the closed catalog. Three dot-separated segments, enforced by `FRONTEND_LOG_EVENT_NAME_PATTERN`. Mirrors the backend catalog. |
| `server-logger.ts`   | `serverLogger.{trace…fatal}` for the Next server. `'server-only'`.                                                                                    |
| `client-logger.ts`   | `clientLogger` + `installClientLoggerLifecycle()` for the browser.                                                                                    |
| `log-emitter.ts`     | `writeServerLogRecord` — the shared sink write.                                                                                                       |
| `correlation.ts`     | Header/cookie names, id shape, `generateCorrelationId`, `isValidCorrelationId`, `normalizeCorrelationId`.                                             |
| `request-context.ts` | `AsyncLocalStorage` holding `{ correlationId, sessionId }`.                                                                                           |
| `levels.ts`          | Numeric level map and threshold check.                                                                                                                |
| `request-error.ts`   | Formats what `instrumentation.ts`'s `onRequestError` records.                                                                                         |
| `user-env.ts`        | Non-identifying browser environment captured once per session.                                                                                        |

## Key Flows

- **Ids:** `proxy.ts` mints/normalises `x-correlation-id` per request and keeps a
  stable `llstack_sid` visitor cookie (rotated on login, cleared on logout). Both
  are forwarded into the request headers; server boundaries load them into
  `AsyncLocalStorage`; the gateway forwards them to the backend as
  `x-request-id`/`x-session-id`, which the backend validates against the same
  shape and stamps on its own lines.
- **Server records** carry `level`, `timestamp`, `message`/`event`, `source:
'frontend-server'`, and the correlation fields — written **last** so caller
  context cannot overwrite them.
- **Browser records** batch to `POST /api/client-logs`, which re-runs
  `sanitizeLogRecord` server-side and overrides `source`, `ingestedAt`, and the
  correlation ids.
- Errors surfaced by Next server-side land as `server.error.unhandled` via
  `instrumentation.ts`; the paired client boundary record joins on `digest`. The
  double record is intentional — do not deduplicate.

## Integrations

- `@repo/logging/shared` — `sanitizeLogValue`/`sanitizeLogRecord`,
  `DEFAULT_LOG_LEVEL_BY_ENV`. The browser-safe entrypoint; the Node-only sink
  barrel is `@repo/logging`.
- Env: `LOG_SINK`, `LOG_LEVEL`, `LOG_REMOTE`, `SEQ_*`, `LOG_HTTP_OTLP_ENDPOINT`,
  `NEXT_PUBLIC_LOG_LEVEL`, `NEXT_PUBLIC_LOG_REMOTE`.

## Gotchas

- **Logging must never throw into the caller** — `serverLogger.emit` wraps
  everything in a `try` that swallows. That is also why
  `instrumentation.ts` parses env at boot: otherwise a config refusal would be
  raised here and silently dropped.
- This directory is the one place `no-console` is switched off; everywhere else
  in the app it is an ESLint error.
- Correlation context does not cross a `'use cache'` boundary.
- `correlation.ts`'s id regex must stay in lockstep with the backend's
  `acceptId` (`apps/backend/src/common/utils/request-id.ts`), or forwarded ids
  get discarded and the join key breaks.
- `llstack_sid` is deliberately **not** `httpOnly` — the browser has to read it.

## Agent Notes

- A new log line means a new entry in `log-events.ts` **in the same change**.
- Log reasons, booleans, enums, and ids. Never emails, tokens, cookie values, or
  raw request/response bodies.
- Covered by `correlation.test.ts`, `request-error.test.ts`, and
  `app/api/client-logs/route.test.ts`.
