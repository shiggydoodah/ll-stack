import { z } from 'zod';

const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;

/**
 * Required, with no default — mirroring `apps/backend/src/config/env.schema.ts`.
 * The `superRefine` below (and `lib/logging/log-emitter.ts`, and
 * `lib/auth/constants.ts`'s `__Host-` cookie prefix) all branch on this value,
 * so a default of `'development'` meant an omitted variable quietly selected
 * the least guarded behaviour. Next sets NODE_ENV itself for `next dev`,
 * `next build`, and `next start`, and `apps/frontend/Dockerfile` pins
 * `production`, so nothing that runs this app relies on a default.
 */
const nodeEnvSchema = z.enum(NODE_ENVS, {
  error: (issue) =>
    issue.input === undefined
      ? `NODE_ENV must be set explicitly to one of: ${NODE_ENVS.join(' | ')}. ` +
        'There is deliberately no default — an omitted value must not silently ' +
        'mean "development".'
      : undefined,
});

const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

// Env vars arrive as strings; treat the literal 'true'/'false' as a boolean flag.
const booleanFlagSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

// The shared local dev credentials committed to apps/frontend/.env.example and to
// docker-compose.yml, so `pnpm setup` yields a stack that boots unattended. They
// are public in the repository, so the superRefine below refuses them once
// deployed. BINDING_SECRET matters most: it is a live signing key (binding-token
// HMAC, lib/auth/binding.ts), so a known value means forgeable binding tokens —
// not merely a readable access secret. SESSION_SECRET is reserved rather than
// read: the session cookie is sealed by the backend and this app only stores what
// it issues (lib/authentication/session-cookie.ts), so this schema is the
// variable's only reference here. It is guarded on the same terms so it cannot
// later become a live key still holding a published value. Mirrors the same guard
// in apps/backend/src/config/env.schema.ts. Keep byte-identical to
// apps/frontend/.env.example.
const LOCAL_DEV_SECRET_DEFAULTS = {
  BACKEND_API_SECRET: 'dev-backend-api-secret',
  SESSION_SECRET: 'dev-session-secret-must-be-at-least-32-chars',
  BINDING_SECRET: 'dev-binding-secret-must-be-at-least-32-chars',
} as const;

const serverEnvBaseSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().positive().default(4100),
  BACKEND_INTERNAL_URL: z.string().url(),
  BACKEND_API_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  BINDING_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('app'),
  DEV_MODE: booleanFlagSchema.default(false),

  // Service identity stamped on log records and used as the sink service name
  // (parallels the backend's APPLICATION_NAME='backend'). Distinct from the
  // user-facing NEXT_PUBLIC_APP_NAME brand name.
  APPLICATION_NAME: z.string().min(1).default('frontend'),

  // Logging — mirrors the backend's LOG_* knobs so frontend server logs land in
  // the same sink pipeline (see apps/backend/src/common/logging/logger.config.ts).
  LOG_SINK: z.enum(['stdout', 'http_otlp', 'seq']).default('stdout'),
  LOG_LEVEL: logLevelSchema.optional(),
  // Ship server logs through the configured sink. When off (default in dev),
  // the server logger prints to the terminal instead.
  LOG_REMOTE: booleanFlagSchema,
  SEQ_SERVER_URL: z.string().url().optional(),
  SEQ_API_KEY: z.string().optional(),
  LOG_HTTP_OTLP_ENDPOINT: z.string().url().optional(),
});

// Each non-stdout sink needs its endpoint; fail at boot rather than letting a
// misconfigured sink surface lazily in the request path.
export const serverEnvSchema = serverEnvBaseSchema.superRefine((env, ctx) => {
  if (env.LOG_SINK === 'seq' && !env.SEQ_SERVER_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SEQ_SERVER_URL'],
      message: "SEQ_SERVER_URL is required when LOG_SINK='seq'",
    });
  }
  if (env.LOG_SINK === 'http_otlp' && !env.LOG_HTTP_OTLP_ENDPOINT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LOG_HTTP_OTLP_ENDPOINT'],
      message: "LOG_HTTP_OTLP_ENDPOINT is required when LOG_SINK='http_otlp'",
    });
  }

  // Fail closed on the committed local dev credentials. These ship with working
  // defaults so a fresh clone boots, which means nothing else would notice them
  // outside development — and a known BINDING_SECRET lets anyone holding the
  // repository mint a valid binding token. `instrumentation.ts`'s `register()`
  // is what evaluates this at boot; every other caller of `getServerEnv()` in
  // this app swallows the failure (see lib/logging/log-emitter.ts).
  if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
    for (const [key, devValue] of Object.entries(LOCAL_DEV_SECRET_DEFAULTS)) {
      if (env[key as keyof typeof LOCAL_DEV_SECRET_DEFAULTS] === devValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message:
            `${key} is still the committed local dev default, which is public in the ` +
            'repository. Set a real secret before deploying.',
        });
      }
    }
  }
});

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('app'),
  // Browser log verbosity; falls back to the per-environment default.
  NEXT_PUBLIC_LOG_LEVEL: logLevelSchema.optional(),
  // Ship browser logs to /api/client-logs. When off (default in dev), the
  // browser logger only writes to the DevTools console.
  NEXT_PUBLIC_LOG_REMOTE: booleanFlagSchema,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
