# Context: apps/frontend/config

## Purpose

- Frontend environment validation and the dev-mode switch. The boundary between
  server-only secrets and anything the browser may see.

## Architecture

- `env.schema.ts` — two zod schemas:
  - `serverEnvSchema` — `NODE_ENV` (required, no default), `PORT`,
    `BACKEND_INTERNAL_URL`, `BACKEND_API_SECRET`, `SESSION_SECRET` (≥32),
    `BINDING_SECRET` (≥32), `NEXT_PUBLIC_APP_NAME`, `DEV_MODE`,
    `APPLICATION_NAME`, and the `LOG_*`/`SEQ_*` knobs mirroring the backend.
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
  (`SEQ_SERVER_URL` / `LOG_HTTP_OTLP_ENDPOINT`), and in staging/production the
  committed dev defaults for `BACKEND_API_SECRET`, `SESSION_SECRET`, and
  `BINDING_SECRET` are refused.

## Integrations

- `apps/frontend/.env.example` documents every variable; the dev secret values
  must stay byte-identical with `apps/backend/.env.example` and
  `apps/testing/.env.test.example`.
- `packages/services/src/core/client-env.ts` independently requires
  `BACKEND_INTERNAL_URL` and `BACKEND_API_SECRET` at client import time — a
  boot-time backstop, not the validation layer.

## Gotchas

- `BINDING_SECRET` is a **live signing key** (`lib/auth/binding.ts`); a known
  value means forgeable binding tokens. `SESSION_SECRET` is reserved, not read —
  the backend seals the session cookie — and is guarded on the same terms so it
  cannot later become a live key still holding a published value.
- `NODE_ENV` has no default deliberately; the `superRefine`,
  `lib/logging/log-emitter.ts`, and the `__Host-` cookie prefix in
  `lib/auth/constants.ts` all branch on it.
- Only `NEXT_PUBLIC_*` values may reach the browser. Never import
  `getServerEnv()` from a client component.

## Agent Notes

- A new variable means: schema entry, `.env.example` line, and — if the E2E
  harness boots the app — an entry in `apps/testing/playwright.config.ts`'s
  `frontendEnv`.
- Covered by `config/env.schema.test.ts`, `config/dev-mode.test.ts`, and
  `instrumentation.test.ts`.
