# Context: apps/backend/src/config

## Purpose

- `env.schema.ts` — the single zod contract for every backend environment
  variable, validated at boot by `ConfigModule.forRoot({ validate })` and again
  (earlier) in `main.ts` before telemetry starts.
- Read/edit here when adding a variable, changing a default, or changing what a
  deployed environment is allowed to do.

## Architecture

- `envSchema` = object schema → `superRefine` (cross-field, fail-closed rules)
  → `transform` (env-dependent defaults zod's `.default()` cannot express).
  `Env` is its inferred output type; `ConfigService<Env>` is how the app reads
  it.
- `operatorScriptEnvSchema` — the narrow schema for scripts that boot only
  `ConfigModule` + `PrismaModule` (`NODE_ENV`, `DATABASE_URL`,
  `LOG_SLOW_QUERY_THRESHOLD_MS`). Field schemas are **shared** with `envSchema`,
  not restated.

Variable groups: runtime (`NODE_ENV`, `PORT`, `DATABASE_URL`), secrets
(`BACKEND_API_SECRET`, `ADMIN_API_KEY`), sessions (`AUTH_SESSION_TTL_SECONDS`,
`AUTH_SESSION_PRUNE_*`), argon2 cost (`AUTH_ARGON2_*`), docs
(`OPENAPI_DOCS_ENABLED`), rate limiting/topology (`TRUST_PROXY`,
`BACKEND_INSTANCE_COUNT`, `RATE_LIMITING_ENABLED`), logging (`LOG_*`, `SEQ_*`,
`APPLICATION_NAME`), OpenTelemetry (`OTEL_*`), and browser-facing URLs
(`FRONTEND_PUBLIC_URL`, `FRONTEND_ORIGIN`).

## Key Flows

**Fail-closed rules in `superRefine`** (all keyed on
`NODE_ENV === 'staging' | 'production'` unless noted):

- Argon2 memory must be ≥ 8 × parallelism (any environment).
- Argon2 cost may not fall below the pinned production parameters.
- `BACKEND_INSTANCE_COUNT > 1` is refused (in-process throttler store).
- `RATE_LIMITING_ENABLED=false` is refused.
- Enabled traces/metrics must have a resolvable OTLP endpoint.
- `FRONTEND_ORIGIN` is required, and each entry must be an exact http(s) web
  origin (no trailing slash, no path).
- The committed dev secrets are refused, and replacements must be ≥ 32 chars.

**Env-dependent defaults in `transform`:** `FRONTEND_PUBLIC_URL`/`FRONTEND_ORIGIN`
fall back to the local frontend; `OPENAPI_DOCS_ENABLED` → development only;
`AUTH_SESSION_PRUNE_ENABLED` → on everywhere but test; `OTEL_TRACES_SAMPLE_RATE`
→ 1 in dev/test, 0.1 deployed; `OTEL_SERVICE_NAME` → `APPLICATION_NAME`;
`OTEL_METRICS_ENABLED` mirrors traces; the metrics endpoint is derived from the
traces endpoint by swapping `/v1/traces` → `/v1/metrics`.

## Integrations

- `apps/backend/.env.example` documents every variable and must stay in step —
  including the byte-identical committed dev secrets shared with
  `apps/frontend/.env.example` and `apps/testing/.env.test.example`.
- `test/helpers/app-module-test-env.ts` supplies the minimum required set for
  specs and deliberately leaves defaulted variables unset.

## Gotchas

- **`NODE_ENV` has no default and never should.** It is the switch every rule
  above reads; an omitted value used to disarm all of them silently.
- `min(1)` on the secrets is what lets a fresh clone boot — it is not a
  credential policy. The real floor is the 32-char check in `superRefine`.
- The argon2 knobs are a test-suite affordance, not a production tuning surface.
- `TRUST_PROXY` must be set deliberately: over-trusting lets a client spoof
  `X-Forwarded-For` and mint a fresh throttle bucket per request.

## Agent Notes

- A new variable means: schema entry (with a comment saying why), any
  `superRefine`/`transform` rule, an `.env.example` line, and — if a spec needs
  it — `test/helpers/app-module-test-env.ts`.
- Covered by `test/env-schema.spec.ts`.
