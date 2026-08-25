# Context: apps/frontend/lib

## Purpose

- Every non-route module in the frontend. Route files stay thin; the rules,
  boundaries, and infrastructure live here.

## Architecture

| Directory         | Owns                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gateway/`        | The **only** sanctioned way to call the backend. Wraps `@repo/services`. → `gateway/CONTEXT.md`                                                                                                        |
| `actions/`        | `actionWrapper` (auth gate + logging + control-flow rethrow) and `withRequestContext`. → `actions/CONTEXT.md`                                                                                          |
| `authentication/` | Session-cookie read/write/clear and the validated `validateSession()`. → `authentication/CONTEXT.md`                                                                                                   |
| `auth/`           | The session **binding** token: HMAC over the session token, `__Host-bind` cookie name and TTL. Separate from `authentication/` on purpose — this is the CSRF/fixation defence, not the session itself. |
| `logging/`        | Server logger, client logger, correlation ids, request context, event catalog. → `logging/CONTEXT.md`                                                                                                  |
| `errors/`         | `ExpectedError`, the registered error-code catalog, boundary parsing, noise filters. → `errors/CONTEXT.md`                                                                                             |
| `cache/`          | `cacheTags`, `cacheLifeProfiles`, `withSessionCache`. → `cache/CONTEXT.md`                                                                                                                             |
| `routes.ts`       | The route registry — every navigable path, imported never inlined                                                                                                                                      |
| `constants/`      | User-facing copy (`ERROR_MESSAGES`)                                                                                                                                                                    |

## Key Flows

- A server action composes: `actionWrapper` → (auth gate) → strict zod re-parse
  → `lib/gateway/*` → `redirect()` or a `FormSubmitResult`.
- A page composes: `validateSession()` (from `authentication/`) → `lib/gateway/*`
  → render.
- Correlation ids ride `AsyncLocalStorage` (`logging/request-context.ts`),
  populated by `withRequestContext` at server boundaries and read ambiently by
  the gateway and the server logger.

## Integrations

- `@repo/services` (gateway only), `@repo/logging/shared` (redaction, level
  defaults), `@repo/schema` (zod primitives), `next/headers` + `next/navigation`.

## Gotchas

- Modules that touch cookies, secrets, or sinks start with `import 'server-only'`
  — keep that line when editing.
- `lib/auth/` and `lib/authentication/` are two different things: binding token
  vs session cookie. Read the directory name before assuming.
- `errors/expected-error.ts` must stay importable from **both** server and
  client components: no `'server-only'`, no `'use client'`, no React, no logging
  imports.
- `AsyncLocalStorage` context does not cross a `'use cache'` boundary; cached
  reads are deliberately correlation-blind.

## Agent Notes

- Never import `@repo/services` outside `gateway/`.
- Add a navigable path to `routes.ts` rather than writing the string at the call
  site.
- Most modules here have a colocated `*.test.ts` — extend it in the same change.
