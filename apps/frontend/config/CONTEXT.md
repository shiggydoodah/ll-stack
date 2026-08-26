# Context: apps/frontend/config

## Purpose

- Frontend environment validation and the dev-mode switch. The boundary between
  server-only secrets and anything the browser may see.

## Architecture

- `env.schema.ts` — two zod schemas:
  - `serverEnvSchema` — `NODE_ENV` (required, no default), `PORT`,
    `BACKEND_INTERNAL_URL`, `BACKEND_API_SECRET`, `SESSION_SECRET` (≥32),
    `BINDING_SECRET` (≥32), `AUTH_IDLE_TIMEOUT_SECONDS` (idle timeout, default
    8h — see `lib/auth/CONTEXT.md`), `NEXT_PUBLIC_APP_NAME`, `DEV_MODE`,
    `APPLICATION_NAME`, the `LOG_*`/`SEQ_*` knobs mirroring the backend, and
    `CLIENT_LOG_INGEST_ENABLED` (the `/api/client-logs` kill switch, default
    off) + `CLIENT_LOG_ALLOWED_ORIGIN` (that route's Origin comparand, unset
    unless a proxy rewrites `Host`) + `TRUST_PROXY` + `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` +
    `CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE` +
    `CLIENT_LOG_RECORD_LIMIT_PER_MINUTE` +
    `CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE` + `FRONTEND_INSTANCE_COUNT` (the
    `/api/client-logs` ingest limit and its scale-out guard).
  - `publicEnvSchema` — only `NEXT_PUBLIC_*` values.
- `env.ts` — `getServerEnv()`, memoised parse of `process.env`.
- `dev-mode.ts` — `isDevModeEnabled()`: `NODE_ENV === 'development' && DEV_MODE
=== 'true'`. `'server-only'`.

## Key Flows

- `instrumentation.ts`'s `register()` calls `getServerEnv()` once at server boot
  so a misconfiguration fails the boot loudly. Every other caller sits inside a
  `try` that swallows (the logging modules), so without that boot call a refusal
  would be raised and dropped.
- `superRefine` rules: a non-`stdout` sink must have its endpoint
  (`SEQ_SERVER_URL` / `LOG_HTTP_OTLP_ENDPOINT`), a shared client-log allowance
  below its per-client counterpart is refused (the shared figures are whole-app
  ceilings charged on every request — below per-client is a contradiction, not
  a small allowance), and in staging/production the committed dev defaults for
  `BACKEND_API_SECRET`, `SESSION_SECRET`, and `BINDING_SECRET` are refused.

## Integrations

- `apps/frontend/.env.example` documents every variable; the dev secret values
  must stay byte-identical with `apps/backend/.env.example` and
  `apps/testing/.env.test.example`.
- `packages/services/src/core/client-env.ts` independently requires
  `BACKEND_INTERNAL_URL` and `BACKEND_API_SECRET` at client import time — a
  boot-time backstop, not the validation layer.

## Gotchas

- `AUTH_IDLE_TIMEOUT_SECONDS` is validated here but read from `process.env`
  directly by `lib/auth/constants.ts`, which imports its default back into this
  schema. `proxy.ts` reads it on every request and must not pull this schema in
  behind it. It MUST stay below the backend's `AUTH_SESSION_TTL_SECONDS`;
  nothing can check that at boot, because the two live in different apps.
- `BINDING_SECRET` is a **live signing key** (`lib/auth/binding.ts`); a known
  value means forgeable binding tokens. `SESSION_SECRET` is reserved, not read —
  the backend seals the session cookie — and is guarded on the same terms so it
  cannot later become a live key still holding a published value.
- `TRUST_PROXY` is parsed to a **number of hops** here (0 = trust nobody),
  unlike the backend's, which is handed to Express verbatim. `true` and Express'
  named forms (`loopback`, a subnet) need a socket address a Next route handler
  does not have, so they resolve to **zero hops** — the safe reading — and
  `instrumentation.ts` logs `server.trust_proxy.degraded` at boot. Refusing them
  was the earlier design and it was a trap: `TRUST_PROXY` is routinely one
  stack-wide value, so `TRUST_PROXY=true` booted the backend and crashed this app.
  `resolveTrustedProxyHops` is exported for that report — the schema yields only
  the number, and boot needs the raw value's verdict.
- A hop count is spoof-resistant only while every request really traverses the
  declared chain; a directly reachable port means the caller writes the entry the
  limit keys on. That requirement is network-level and lives in SECURITY.md.
- **Over-declaring** the hop count is its own failure and boot cannot see it:
  entries are read from the right, so a chain shorter than the declared depth
  falls back to the shared bucket for every request. Values above
  `TRUSTED_PROXY_HOPS_MAX` (16) are treated as typos and degrade like `true`;
  a plausible-but-wrong count is reported at request time instead, by
  `lib/logging/client-log-rate-limit.ts`, as `server.trust_proxy.chain_too_short`.
- `CLIENT_LOG_INGEST_ENABLED` defaults **off**: `/api/client-logs` answers 404
  until it is set, before its rate limit runs, and `instrumentation.ts` names
  the variable at boot (`server.client_logs.ingest_disabled` — `info` when the
  browser half is off too, `warn` when `NEXT_PUBLIC_LOG_REMOTE=true` is posting
  into that 404). It is authoritative over `NEXT_PUBLIC_LOG_REMOTE` (also
  default off), which only decides whether our own bundle posts; with it off the
  browser logger writes `warn` and above to the BROWSER console instead of
  dropping those records (bar the two the browser prints itself; a server render
  takes none of it, so nothing lands in the Next server's stdout). `NEXT_PUBLIC_*` is
  inlined at BUILD time — into the server compilation too, not the client one
  alone — so that half must be set when the bundle is built, and the boot notice
  reports the value the app was BUILT with, over-reporting only where the
  variable was absent at build and set in the runtime environment alone.
- `CLIENT_LOG_ALLOWED_ORIGIN` is **unset** unless a proxy in front of Next
  rewrites `Host`. `/api/client-logs` compares a request's `Origin` against the
  `Host` header it received; a proxy that rewrites `Host` fails every real
  browser request. Setting this (a bare `scheme://host[:port]`, refused at boot
  otherwise) replaces that comparison. Operator-set, which is why it is safe
  where the caller-written `X-Forwarded-Host` is not.
- The ingest limit meters **two dimensions**, each with **two** allowances —
  and every request is charged on **both** buckets, not one or the other.
  Requests: `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` (per client, once `TRUST_PROXY`
  makes addresses trustworthy; 300 — a bucket is an address, or a /56 network
  for IPv6, so NAT and a bursting tab both need headroom) and
  `..._SHARED_PER_MINUTE` (6000 — the whole-app ceiling every request spends:
  the only allowance when no address can be vouched for, and the global cap a
  distributed caller meets otherwise). Records:
  `CLIENT_LOG_RECORD_LIMIT_PER_MINUTE` (12000) and its `..._SHARED_`
  counterpart (240000) — the ingest ceiling proper, since one request may carry
  100 records and a request cap alone let a caller who packs batches buy ~100x
  the ingest. The per-client REQUEST figure is capped at 600 because the
  limiter's memory is `keys x request allowance`; the record figures do not
  affect memory — see `lib/logging/client-log-rate-limit.ts`.
- `FRONTEND_INSTANCE_COUNT > 1` is refused in staging/production (in-process
  rate-limit store), mirroring the backend's `BACKEND_INSTANCE_COUNT` guard. It
  is a declaration, not an observation: on a serverless or auto-scaling host the
  platform sets the replica count and the guard proves nothing.
- Numeric knobs are parsed from the string, not `z.coerce.number()`: coercion
  reads `FOO=` as `0`, so a blank line in an env file would fail the boot with a
  message about positivity instead of taking the default. The parser is
  `positiveIntEnvSchema` from `@repo/schema`, shared with the backend schema so
  one stack-wide env file reads the same on both sides.
- `CLIENT_LOG_RATE_LIMIT_DEFAULT` / `_MAX`, `CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT`
  / `_MAX`, and the matching `CLIENT_LOG_RECORD_*` set are **exported from here** and imported by
  `lib/logging/client-log-rate-limit.ts`, whose unreadable-env fallback and memory
  reserve ARE those values. This module owns them rather than the limiter because
  the limiter is `'server-only'` and `instrumentation.ts` loads this one on the edge
  runtime too. Change a figure here and the limiter follows; do not restate them.
- `NODE_ENV` has no default deliberately; the `superRefine`,
  `lib/logging/log-emitter.ts`, and the `__Host-` cookie prefix in
  `lib/auth/constants.ts` all branch on it.
- Only `NEXT_PUBLIC_*` values may reach the browser. Never import
  `getServerEnv()` from a client component.
- `isDevModeEnabled()` has no caller yet — the `app/dev/**` route tree it gates is
  reserved but not built. The switch and its tests ship ahead of it deliberately;
  an unused export here is not dead code to remove.

## Agent Notes

- A new variable means: schema entry, `.env.example` line, and — if the E2E
  harness boots the app — an entry in `apps/testing/playwright.config.ts`'s
  `frontendEnv`.
- Covered by `config/env.schema.test.ts`, `config/dev-mode.test.ts`, and
  `instrumentation.test.ts`.
