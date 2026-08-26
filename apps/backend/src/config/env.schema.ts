import { z } from 'zod';
import { positiveIntEnvSchema } from '@repo/schema';

const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;

/**
 * NODE_ENV IS REQUIRED, WITH NO DEFAULT, AND THAT IS THE WHOLE POINT.
 *
 * Every fail-closed rule in this file — the committed-dev-credential refusal,
 * the secret-length floor, the argon2 cost floors, the single-instance
 * throttler rule, `RATE_LIMITING_ENABLED`, the `FRONTEND_ORIGIN` requirement —
 * is written as `if (NODE_ENV === 'staging' || NODE_ENV === 'production')`.
 * While this defaulted to `'development'`, OMITTING the variable disarmed all
 * of them at once, and the resulting process gave no sign of it: it booted, it
 * served traffic, and it accepted the API secret that is published in this
 * repository. A deployment is far likelier to forget a variable than to set it
 * to the wrong value, so the omission has to be the loud case — and the only
 * way to make it loud is to refuse to boot without it.
 *
 * The cost is one line per environment, and every environment this repo ships
 * already pays it: both Dockerfiles (`ENV NODE_ENV=production`), both
 * `.env.example` files, `apps/testing/.env.test.example`,
 * `test/helpers/app-module-test-env.ts`, and `scripts/extract-openapi.ts`.
 */
const nodeEnvSchema = z.enum(NODE_ENVS, {
  error: (issue) =>
    issue.input === undefined
      ? `NODE_ENV must be set explicitly to one of: ${NODE_ENVS.join(' | ')}. ` +
        'It is the switch every fail-closed check in this schema reads, so there is ' +
        'deliberately no default — an omitted value must not silently mean "development".'
      : undefined,
});
type NodeEnv = z.infer<typeof nodeEnvSchema>;

const developmentDefaults = {
  FRONTEND_PUBLIC_URL: 'http://localhost:4100',
} as const;

// The shared local dev credentials committed to every `.env.example` and to
// docker-compose.yml, so `pnpm setup` yields a stack that boots unattended.
// They are public in the repository, so the superRefine below refuses them in
// staging/production — the boot failure an empty default used to give is what
// forces an operator to choose a real secret, and committing a value would
// otherwise remove it. Keep byte-identical to apps/backend/.env.example.
const LOCAL_DEV_SECRET_DEFAULTS = {
  BACKEND_API_SECRET: 'dev-backend-api-secret',
  ADMIN_API_KEY: 'dev-admin-api-key',
} as const;

// Length floor for those same shared secrets once deployed. The field-level
// `min(1)` is what lets a fresh clone boot on a readable placeholder; it is not
// a credential policy, and on its own it accepted a ONE-CHARACTER
// BACKEND_API_SECRET in production — a keyspace an attacker exhausts by hand,
// behind a header that is the entire trust boundary between the internet and
// every internal route. 32 characters is what `openssl rand -base64 24` emits,
// which is what the `.env.example` files tell operators to generate.
const MIN_DEPLOYED_SECRET_LENGTH = 32;

// Trace sampling defaults by environment. Zod `.default()` can't read NODE_ENV,
// so an omitted OTEL_TRACES_SAMPLE_RATE is resolved in the `.transform()` below:
// sample everything in dev/test, sample 10% in staging/production.
const resolveDefaultTracesSampleRate = (nodeEnv: NodeEnv): number =>
  nodeEnv === 'staging' || nodeEnv === 'production' ? 0.1 : 1;

// An omitted OTLP metrics endpoint is derived from the traces endpoint by
// swapping the standard per-signal path (`/v1/traces` → `/v1/metrics`), so the
// common collector setup needs only one endpoint var. A traces endpoint with a
// custom path is not guessable — the metrics endpoint must then be explicit.
const deriveMetricsEndpointFromTraces = (tracesEndpoint: string | undefined): string | undefined =>
  tracesEndpoint?.endsWith('/v1/traces')
    ? `${tracesEndpoint.slice(0, -'/v1/traces'.length)}/v1/metrics`
    : undefined;

const booleanFromEnvString = z.preprocess((val) => {
  if (typeof val !== 'string') return val;
  const normalized = val.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true' || normalized === '1') return true;
  return val;
}, z.boolean());

const optionalNonEmptyString = z.preprocess(
  (value: unknown) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

// Whole-number knobs parse through @repo/schema's positiveIntEnvSchema — one
// parser for both apps, so a stack-wide env file (BACKEND_INSTANCE_COUNT /
// FRONTEND_INSTANCE_COUNT are documented mirrors) reads the same on each side:
// blank means unset, digits only, bounded. See that module for the rationale.

const databaseUrlSchema = z
  .url()
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection string',
  );
const slowQueryThresholdSchema = z.coerce.number().int().positive().default(500);

export const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().positive().default(3100),

    DATABASE_URL: databaseUrlSchema,

    // `min(1)` so a fresh clone boots; the real floor for a deployed
    // environment is MIN_DEPLOYED_SECRET_LENGTH, enforced in the superRefine
    // below alongside the committed-dev-default refusal.
    BACKEND_API_SECRET: z.string().min(1),
    ADMIN_API_KEY: z.string().min(1),

    // Session lifetime (7 days) — sets `sessions.expires_at` when a session is
    // issued, and the cookie's Max-Age is then computed from that column rather
    // than from this value. Rotation inherits a family's expiry instead of
    // extending it, so the cookie never outlives the row behind it.
    //
    // This is the absolute ceiling on a session's life. The frontend runs a
    // shorter idle clock of its own (`AUTH_IDLE_TIMEOUT_SECONDS`, 8 hours,
    // `apps/frontend/lib/auth/`), so a browser that stops touching member routes
    // is signed out well before this expires. Keep that value the smaller of the
    // two; neither app can read the other's env to check.
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

    // Session token rotation — see `auth/auth.service.ts`.
    //
    // A token that is minted once at login and never re-issued gives a copied
    // cookie the full AUTH_SESSION_TTL_SECONDS, and leaves nothing that could
    // tell the thief from the owner. Rotation re-issues the token on an
    // interval and keeps the superseded row: presenting a retired token is
    // something only a second holder can do, so it revokes the whole family and
    // logs it.
    //
    // The interval is a trade between exposure and row count. Every rotation
    // adds one row that survives until the family expires, so the ceiling per
    // sign-in is AUTH_SESSION_TTL_SECONDS / this value — 168 rows at the
    // defaults, and far fewer in practice because the clock only advances while
    // the browser is being used. Rotation never extends a session: the
    // successor inherits its family's expiry.
    AUTH_SESSION_ROTATE_AFTER_SECONDS: z.coerce.number().int().positive().default(3_600),

    // How long a superseded token keeps working after the rotation that retired
    // it. A request already in flight when the rotation lands still carries the
    // old token, and signing that request's owner out would make rotation worse
    // than the problem it fixes. Inside the window a stolen token also still
    // works, which is the cost — keep it short enough that it is a race window
    // rather than a second session lifetime.
    AUTH_SESSION_ROTATION_GRACE_SECONDS: z.coerce.number().int().positive().default(60),

    // Session pruning — see `auth/session-prune.service.ts`. `sessions` is
    // Archetype B (mutable, hard-delete only): a row is deleted outright once
    // it is dead, never soft-deleted. Nothing implemented that, so the table
    // grew by a row per login forever and retained the token hash of every
    // expired, revoked, and deleted-owner session indefinitely.
    //
    // `AUTH_SESSION_PRUNE_ENABLED` resolves in the transform below to on
    // everywhere except test, where a background timer would race the suites'
    // own `session.deleteMany()` cleanup; the session-prune spec turns it back
    // on explicitly. The batch size bounds a single delete statement, not the
    // sweep — a sweep keeps taking batches until the table is clean or it hits
    // its per-run batch ceiling.
    //
    // THE CEILING HAS TO KEEP UP WITH ROTATION. One sweep deletes at most
    // MAX_BATCHES × BATCH_SIZE rows, and rotation turned one sign-in into up to
    // AUTH_SESSION_TTL_SECONDS / AUTH_SESSION_ROTATE_AFTER_SECONDS rows that all
    // expire together. At these defaults that is 100,000 rows an hour — about
    // 1,700 expiring sign-ins, taking 56 rows as what a browser used eight hours
    // a day accumulates over the seven-day TTL. Above that arrival rate the
    // table grows every tick and never catches up;
    // `system.session_prune.completed` warns when a sweep stops on the ceiling,
    // which is the signal to raise this.
    // Superseded rows cannot be dropped early — reuse detection reads them —
    // so the only lever is the ceiling.
    AUTH_SESSION_PRUNE_ENABLED: booleanFromEnvString.optional(),
    AUTH_SESSION_PRUNE_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
    AUTH_SESSION_PRUNE_BATCH_SIZE: z.coerce.number().int().positive().max(10_000).default(500),
    AUTH_SESSION_PRUNE_MAX_BATCHES: z.coerce.number().int().positive().max(10_000).default(200),

    // Mount the Swagger UI and the OpenAPI JSON at `/docs` and `/docs-json`.
    // Resolved in the transform below to development-only. The document
    // describes every route, DTO, error shape, and security scheme in the
    // service, and `SwaggerModule.setup` mounts it directly on the Express
    // instance — outside `ApiSecretGuard`, outside the throttler, outside the
    // request pipeline every other route goes through. Enabling it in a
    // deployed environment is allowed and is not free: the mount is then gated
    // on `ADMIN_API_KEY` (see `src/bootstrap/openapi-docs.ts`).
    OPENAPI_DOCS_ENABLED: booleanFromEnvString.optional(),

    // Argon2id password-hashing cost (auth.service.ts). The defaults pin the
    // argon2 library's own production-strength parameters (64 MiB, t=3, p=4)
    // so a library upgrade can never silently change hashing cost. They exist
    // as env vars for one reason: at production strength a single hash costs
    // tens of milliseconds of CPU, and the backend test suite mints many
    // throwaway accounts — the test env dials these down to the argon2 spec
    // minimums (8 KiB, t=1, p=1). Weakened values are refused at boot in
    // staging/production (superRefine below), so the knobs cannot become a
    // production downgrade path.
    AUTH_ARGON2_MEMORY_KIB: z.coerce.number().int().positive().default(65_536),
    AUTH_ARGON2_TIME_COST: z.coerce.number().int().positive().default(3),
    AUTH_ARGON2_PARALLELISM: z.coerce.number().int().positive().default(4),

    // Express `trust proxy` value. Behind a reverse proxy/load balancer, `req.ip`
    // is the proxy's address unless this is set, which collapses every client
    // into one IP throttle bucket. Set it DELIBERATELY for the deployed proxy
    // chain — over-trusting (e.g. `true` with no proxy) lets a client spoof
    // `X-Forwarded-For` and mint a fresh IP bucket per request.
    //   unset/`false` -> trust nobody; req.ip is the socket address (safe default)
    //   `<n>`          -> trust n proxy hops (e.g. `1` for a single LB in front)
    //   `true`         -> trust the whole X-Forwarded-For chain (discouraged)
    //   other          -> passed through to Express (e.g. `loopback`, a subnet)
    TRUST_PROXY: optionalNonEmptyString,

    // Declared number of backend instances behind the load balancer. The
    // throttler store is in-process (`BoundedThrottlerStorage`), so each
    // instance counts attempts independently and per-client limits are
    // multiplied by the instance count. Until a shared throttler store (e.g.
    // Redis) is wired, staging/production must run a single instance — this is
    // enforced fail-closed at boot in the superRefine below.
    BACKEND_INSTANCE_COUNT: positiveIntEnvSchema('BACKEND_INSTANCE_COUNT', 1, 1_000),

    // Master switch for all rate limiting (the AppThrottlerGuard family). On by
    // default; only honoured outside staging/production, where it is refused at
    // boot (superRefine below) so a deploy can never ship with limits disabled.
    // Exists so the e2e harness can drive many requests from a single localhost
    // IP without tripping the per-IP throttles.
    RATE_LIMITING_ENABLED: booleanFromEnvString.default(true),

    // Logging
    APPLICATION_NAME: z.string().min(1).default('backend'),
    LOG_SINK: z.enum(['stdout', 'http_otlp', 'seq']).default('stdout'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
    LOG_PRETTY: booleanFromEnvString.default(false),
    LOG_REDACT_PATHS: z.string().optional(),

    // Seq
    SEQ_SERVER_URL: z.string().optional(),
    SEQ_API_KEY: z.string().min(1).optional(),

    // HTTP OTLP sink
    LOG_HTTP_OTLP_ENDPOINT: z.string().optional(),
    LOG_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    LOG_HTTP_BATCH_SIZE: z.coerce.number().int().positive().default(100),
    LOG_HTTP_QUEUE_SIZE: z.coerce.number().int().positive().default(1_000),
    LOG_HTTP_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
    LOG_HTTP_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
    LOG_HTTP_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(200),
    LOG_HTTP_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(10_000),
    LOG_HTTP_BACKOFF_JITTER_FACTOR: z.coerce.number().min(0).max(1).default(0.3),
    LOG_HTTP_FAILURE_FALLBACK_THRESHOLD: z.coerce.number().int().positive().default(5),
    LOG_HTTP_INIT_FAILURE_FALLBACK_THRESHOLD: z.coerce.number().int().positive().default(3),
    LOG_HTTP_CIRCUIT_OPEN_MS: z.coerce.number().int().positive().default(30_000),
    LOG_HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    // Slow query
    LOG_SLOW_QUERY_THRESHOLD_MS: slowQueryThresholdSchema,

    // OpenTelemetry tracing (backend-only). Traces use their own OTLP endpoint,
    // separate from the logs-only LOG_HTTP_OTLP_ENDPOINT. Off by default; when
    // enabled, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required (superRefine below).
    OTEL_TRACES_ENABLED: booleanFromEnvString.default(false),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: optionalNonEmptyString,
    // Sampling ratio in [0, 1]. Optional: the env-dependent default (1 in
    // dev/test, 0.1 in staging/production) is applied in the transform below
    // because Zod `.default()` can't read NODE_ENV.
    OTEL_TRACES_SAMPLE_RATE: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.coerce.number().min(0).max(1).optional(),
    ),
    // Resource service.name for emitted spans. Resolves to APPLICATION_NAME
    // when omitted (applied in the transform below).
    OTEL_SERVICE_NAME: optionalNonEmptyString,

    // OpenTelemetry metrics (backend-only). Off unless enabled; when omitted the
    // flag mirrors OTEL_TRACES_ENABLED (resolved in the transform below) so the
    // usual one-switch setup exports both signals — and stays fully off in test/
    // local defaults. Metrics use their own OTLP endpoint; when it is omitted it
    // is derived from OTEL_EXPORTER_OTLP_TRACES_ENDPOINT by swapping the standard
    // `/v1/traces` path for `/v1/metrics` (superRefine rejects an enabled-but-
    // endpointless config — exporting to nowhere silently drops every metric).
    OTEL_METRICS_ENABLED: booleanFromEnvString.optional(),
    OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: optionalNonEmptyString,

    FRONTEND_PUBLIC_URL: z
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
      }, 'FRONTEND_PUBLIC_URL must use http or https')
      .optional(),

    // Comma-separated EXACT-match allowlist of browser web origins for any
    // browser-facing surface that checks the Origin header. Defaults to the
    // local frontend in development AND test; required in staging/production
    // (superRefine below) so a deploy can never fall back to a localhost
    // allowlist.
    FRONTEND_ORIGIN: optionalNonEmptyString,
  })
  .superRefine((env, ctx) => {
    // The argon2 spec requires memory >= 8 KiB per lane; the native addon
    // rejects the hash call at runtime otherwise. Fail at boot instead of on
    // the first registration.
    if (env.AUTH_ARGON2_MEMORY_KIB < 8 * env.AUTH_ARGON2_PARALLELISM) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_ARGON2_MEMORY_KIB'],
        message: 'AUTH_ARGON2_MEMORY_KIB must be at least 8 x AUTH_ARGON2_PARALLELISM.',
      });
    }

    // Fail closed on weakened password hashing. The argon2 cost knobs exist so
    // the test suite can stop paying production-strength key-stretching for
    // throwaway accounts; a deployed environment that weakens any of them
    // would silently degrade every stored password hash. Refuse at boot below
    // the pinned production parameters.
    if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
      const argon2Floors = [
        ['AUTH_ARGON2_MEMORY_KIB', 65_536],
        ['AUTH_ARGON2_TIME_COST', 3],
        ['AUTH_ARGON2_PARALLELISM', 4],
      ] as const;
      for (const [key, floor] of argon2Floors) {
        if (env[key] < floor) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} must be at least ${floor} in staging or production. The reduced-cost knobs exist for the test suite only; a deployed environment must hash at full production strength.`,
          });
        }
      }
    }

    // A rotation interval at or above the session TTL never fires: the session
    // expires first, so the token is minted once and never re-issued — exactly
    // the state rotation exists to end, reached silently through config rather
    // than through code. Refuse it at boot.
    if (env.AUTH_SESSION_ROTATE_AFTER_SECONDS >= env.AUTH_SESSION_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_ROTATE_AFTER_SECONDS'],
        message:
          'AUTH_SESSION_ROTATE_AFTER_SECONDS must be less than AUTH_SESSION_TTL_SECONDS. ' +
          'At or above it the session expires before its first rotation, so the token is ' +
          'never re-issued.',
      });
    }

    // The grace window is meant to cover a request that was in flight when the
    // rotation landed. At or above the rotation interval it stops being that:
    // every token in the family stays usable for its whole life, and presenting
    // a retired one never becomes the reuse signal it is supposed to be.
    if (env.AUTH_SESSION_ROTATION_GRACE_SECONDS >= env.AUTH_SESSION_ROTATE_AFTER_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_ROTATION_GRACE_SECONDS'],
        message:
          'AUTH_SESSION_ROTATION_GRACE_SECONDS must be less than ' +
          'AUTH_SESSION_ROTATE_AFTER_SECONDS. A grace window that outlasts the rotation ' +
          'interval keeps every superseded token usable, which disables reuse detection.',
      });
    }

    // Fail closed: in-memory throttling cannot be shared across instances, so a
    // multi-instance staging/production deployment would silently multiply every
    // rate limit by its instance count. Refuse to boot until a shared throttler
    // store is implemented (then this guard relaxes to require that store's URL).
    if (
      (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
      env.BACKEND_INSTANCE_COUNT > 1
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BACKEND_INSTANCE_COUNT'],
        message:
          'Multi-instance deployments need a shared throttler store, which is not yet configured. ' +
          'Run a single instance (BACKEND_INSTANCE_COUNT=1) or implement shared throttler storage before scaling out.',
      });
    }

    // Fail closed: rate limiting is a security control, so it can only be turned
    // off in development/test. A staging/production boot with it disabled is a
    // misconfiguration and is refused here rather than silently leaving
    // endpoints unthrottled.
    if (
      (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
      env.RATE_LIMITING_ENABLED === false
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMITING_ENABLED'],
        message: 'RATE_LIMITING_ENABLED must not be false in staging or production.',
      });
    }

    // Fail closed: exporting traces with no endpoint silently drops every span.
    // When tracing is enabled, the OTLP traces endpoint must be set explicitly
    // (this is logs-independent — LOG_HTTP_OTLP_ENDPOINT does not satisfy it).
    if (env.OTEL_TRACES_ENABLED && env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'],
        message:
          'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required when OTEL_TRACES_ENABLED is true ' +
          '(exporting to nowhere silently drops every span).',
      });
    }

    // Same posture for metrics: an enabled exporter needs a resolvable
    // endpoint. The flag mirrors OTEL_TRACES_ENABLED when omitted (transform
    // below), so compute the effective value here.
    const metricsEnabled = env.OTEL_METRICS_ENABLED ?? env.OTEL_TRACES_ENABLED;
    if (
      metricsEnabled &&
      env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT === undefined &&
      deriveMetricsEndpointFromTraces(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTEL_EXPORTER_OTLP_METRICS_ENDPOINT'],
        message:
          'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is required when metrics are enabled and it ' +
          'cannot be derived from OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ' +
          '(exporting to nowhere silently drops every metric).',
      });
    }

    // Fail closed: the browser Origin allowlist must be explicit in deployed
    // environments — a staging/production boot silently allowlisting localhost
    // would let any local page pass origin checks with a victim's cookie.
    if (
      (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
      env.FRONTEND_ORIGIN === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_ORIGIN'],
        message: 'FRONTEND_ORIGIN is required in staging and production',
      });
    }

    // Each allowlist entry must BE an http(s) web origin (http(s)://host[:port]
    // — what the browser Origin header carries). Origin checks compare exactly,
    // so a trailing slash, a path, or a non-http scheme (e.g. ws://) would
    // never match any real header and silently reject every browser at runtime;
    // refuse at boot instead.
    if (env.FRONTEND_ORIGIN !== undefined) {
      for (const entry of env.FRONTEND_ORIGIN.split(',').map((value) => value.trim())) {
        let isOrigin = false;
        try {
          const parsed = new URL(entry);
          isOrigin =
            (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            parsed.origin === entry;
        } catch {
          isOrigin = false;
        }
        if (!isOrigin) {
          ctx.addIssue({
            code: 'custom',
            path: ['FRONTEND_ORIGIN'],
            message:
              `FRONTEND_ORIGIN entry "${entry}" is not an http(s) web origin. ` +
              'Use http://host[:port] or https://host[:port] with no trailing ' +
              'slash or path (e.g. https://app.example.com) — Origin headers ' +
              'are matched exactly.',
          });
        }
      }
    }

    // Fail closed on the committed local dev credentials. BACKEND_API_SECRET is
    // the whole trust boundary the global ApiSecretGuard enforces between the
    // BFFs and this service, and ADMIN_API_KEY gates the admin surface. Both
    // ship with a working default so a fresh clone boots, which means the empty
    // value that used to refuse boot no longer forces an operator to pick a real
    // secret — this does. A staging/production deploy that inherited a
    // `pnpm setup` .env is refused here rather than coming up on a credential
    // anyone can read in the repository.
    //
    // A deployed environment must also pick a secret long enough to be worth
    // comparing. Refusing the two published defaults says nothing about what
    // replaces them, and the field-level `min(1)` was happy with anything:
    // `BACKEND_API_SECRET=x` booted in production and left `ApiSecretGuard`
    // defending every internal route with a 62-value keyspace.
    //
    // This check reads NODE_ENV, which is now a required variable with no
    // default (see `nodeEnvSchema`) — an omitted one used to skip this and
    // every other rule below in silence.
    if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
      for (const [key, devValue] of Object.entries(LOCAL_DEV_SECRET_DEFAULTS) as [
        keyof typeof LOCAL_DEV_SECRET_DEFAULTS,
        string,
      ][]) {
        if (env[key] === devValue) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message:
              `${key} is still the committed local dev default, which is public in the ` +
              'repository. Set a real secret before deploying.',
          });
          continue;
        }

        if (env[key].length < MIN_DEPLOYED_SECRET_LENGTH) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message:
              `${key} must be at least ${MIN_DEPLOYED_SECRET_LENGTH} characters in staging or ` +
              'production. Generate one with `openssl rand -base64 24`.',
          });
        }
      }
    }
  })
  .transform((env) => {
    const frontendPublicUrl = env.FRONTEND_PUBLIC_URL ?? developmentDefaults.FRONTEND_PUBLIC_URL;
    return {
      ...env,
      FRONTEND_PUBLIC_URL: frontendPublicUrl,
      // Dev/test default mirrors the frontend dev server; deployed environments
      // were required to set it explicitly in the superRefine above.
      FRONTEND_ORIGIN: env.FRONTEND_ORIGIN ?? developmentDefaults.FRONTEND_PUBLIC_URL,
      // Development only unless an operator says otherwise, and gated on the
      // admin key when they do — see the field comment above and
      // `src/bootstrap/openapi-docs.ts`.
      OPENAPI_DOCS_ENABLED: env.OPENAPI_DOCS_ENABLED ?? env.NODE_ENV === 'development',
      // On everywhere but test: a background sweep firing mid-spec would race
      // the integration suites' own session cleanup.
      AUTH_SESSION_PRUNE_ENABLED: env.AUTH_SESSION_PRUNE_ENABLED ?? env.NODE_ENV !== 'test',
      OTEL_TRACES_SAMPLE_RATE:
        env.OTEL_TRACES_SAMPLE_RATE ?? resolveDefaultTracesSampleRate(env.NODE_ENV),
      OTEL_SERVICE_NAME: env.OTEL_SERVICE_NAME ?? env.APPLICATION_NAME,
      OTEL_METRICS_ENABLED: env.OTEL_METRICS_ENABLED ?? env.OTEL_TRACES_ENABLED,
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:
        env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
        deriveMetricsEndpointFromTraces(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT),
    };
  });

export type Env = z.infer<typeof envSchema>;

/**
 * What an operator/seed script validates, and why it is not `envSchema`: a
 * script that boots only `ConfigModule` + `PrismaModule` reads exactly these
 * variables, and validating the whole schema would refuse to run in a shell
 * that exports `NODE_ENV=production` without the rest of the application's env
 * (a CI runner, or an operator's terminal pointed at a deployed database).
 * The field schemas are SHARED with `envSchema` above, not restated. Adding a
 * variable here means a script genuinely reads it — it is not a place to
 * silence a boot failure.
 *
 * That sharing includes NODE_ENV being REQUIRED. A narrower schema is not a
 * laxer one: a script that decides what it may touch by reading NODE_ENV must
 * not read `'development'` off an unset variable any more than the server may.
 */
export const operatorScriptEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  DATABASE_URL: databaseUrlSchema,
  LOG_SLOW_QUERY_THRESHOLD_MS: slowQueryThresholdSchema,
});
