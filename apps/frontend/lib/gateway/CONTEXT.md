# Context: apps/frontend/lib/gateway

## Purpose

- The frontend's only door to the backend. Wraps the generated
  `@repo/services` clients so route code never imports them directly, and so
  every outbound call gets the same auth headers, correlation headers, error
  normalisation, and structured logging.

## Architecture

- `gateway-wrapper.ts` — the core.
  - `gatewayWrapper(call, logContext, { withAuth = true })` — injects the
    session cookie (unless `withAuth: false`) plus correlation headers, runs the
    call, normalises the raw response via `normalizeServiceResponse`, logs, and
    returns a `ServiceResult`.
  - `buildSessionCookieHeader(session)` — for cached inner functions that
    receive the session as a parameter instead of reading cookies.
  - `buildCorrelationHeader()` / `withCorrelation(options)` — forward
    `x-request-id` and `x-session-id`.
  - `readBackendTraceId(response)` — reads the backend's `x-trace-id` so a Next
    log line can point at the matching backend log.
- One module per backend domain, each exporting app-shaped functions:
  - `auth.ts` — `register`, `login` (both `withAuth: false`), `logout`.
  - `users.ts` — `getCurrentUserForSession` (uncached, the auth path) and
    `getCurrentUserCached` (per-user `'use cache'` read for display).
  - `dashboard.ts` — `getDashboard`, deliberately uncached.
- `error-code.ts` — `errorCode(error)` pulls the backend's stable error code out
  of the uniform error envelope. Plain module (no `'server-only'`) so tests and
  client-adjacent code can import it.

## Key Flows

- **Log levels by outcome:** ok → `info` (`gateway.response.successful`); ≥500 →
  `fatal`; 429/400 → `error`; other failures → `warn`. Plus `debug`
  request-entry and `trace` dispatch/complete breadcrumbs.
- **Cached vs uncached:** the auth path (`validateSession` →
  `getCurrentUserForSession`) always uses `cache: 'no-store'`. The display path
  (`getCurrentUserCached`) goes through `withSessionCache` + `'use cache'` with
  a `cacheTags.currentUser(userId)` tag and the `medium` life profile.

## Integrations

- `@repo/services/<domain>` for the generated SDK functions and types;
  `@repo/services/core` for `ServiceResult` / `normalizeServiceResponse`.
- `lib/authentication/session-cookie` for the session value, `lib/logging/*` for
  correlation and the logger, `lib/cache/*` for tags and life profiles.
- The generated clients pick up `BACKEND_INTERNAL_URL` and `BACKEND_API_SECRET`
  themselves via `packages/services/src/core/client-env.ts`.

## Gotchas

- **Backend error payloads can carry PII** (submitted emails, validation
  detail, tokens). `sanitizeGatewayError` logs only `code`/`message` — never the
  raw error object. Keep it that way.
- Header _values_ are never logged; the `trace` line logs header **names** only.
- Correlation headers are omitted inside a `'use cache'` boundary because
  `AsyncLocalStorage` does not cross it — that is intended, not a bug.
- `withAuth: false` still forwards correlation headers; it only skips the
  session cookie.
- Adding a new backend domain means adding it to
  `packages/services/scripts/domain-manifest.ts` and running `pnpm gen:client`
  before a wrapper here can import it.

## Agent Notes

- New endpoint → add a thin wrapper here named for the app's intent, with a
  `[<domain> gateway] <operation>` log context string matching the existing
  style.
- Decide cached vs uncached explicitly and say why in a comment — both existing
  patterns are documented in `users.ts` and `dashboard.ts`.
- Route code, server actions, and pages import from here; never from
  `@repo/services`.
- Covered by `gateway-wrapper.test.ts` and `error-code.test.ts`.
