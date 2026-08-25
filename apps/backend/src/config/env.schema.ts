import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'test', 'staging', 'production']);
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

const databaseUrlSchema = z
  .url()
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection string',
  );
const slowQueryThresholdSchema = z.coerce.number().int().positive().default(500);

export const envSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default('development'),
    PORT: z.coerce.number().int().positive().default(3100),

    DATABASE_URL: databaseUrlSchema,

    BACKEND_API_SECRET: z.string().min(1),
    ADMIN_API_KEY: z.string().min(1),

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
    BACKEND_INSTANCE_COUNT: z.coerce.number().int().positive().default(1),

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
    // Note the limit of that: this keys off NODE_ENV, and docker-compose.yml
    // pins NODE_ENV: development, so a stack copied from there carries the
    // variable that disables this check. The compose comments say so.
    if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
      for (const [key, devValue] of Object.entries(LOCAL_DEV_SECRET_DEFAULTS)) {
        if (env[key as keyof typeof LOCAL_DEV_SECRET_DEFAULTS] === devValue) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message:
              `${key} is still the committed local dev default, which is public in the ` +
              'repository. Set a real secret before deploying.',
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
 */
export const operatorScriptEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  DATABASE_URL: databaseUrlSchema,
  LOG_SLOW_QUERY_THRESHOLD_MS: slowQueryThresholdSchema,
});
