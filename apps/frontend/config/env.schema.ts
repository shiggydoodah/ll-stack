import { z } from 'zod';
import { positiveIntEnvSchema } from '@repo/schema';
import {
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  DEFAULT_ROTATION_RETRY_SECONDS,
} from '../lib/auth/constants';

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

// Whole-number knobs parse through @repo/schema's positiveIntEnvSchema — one
// parser for both apps, so a stack-wide env file reads the same on each side
// (blank means unset, digits only, bounded). See that module for the rationale.

/**
 * Deepest proxy chain treated as a declaration rather than a typo. Real
 * topologies are one to three hops (CDN, load balancer, ingress); this is well
 * clear of a plausible stack and well short of a fat-fingered `TRUST_PROXY=100`.
 *
 * A count at or under it that still overshoots the real chain cannot be caught
 * here — nothing at boot knows the topology — so `client-log-rate-limit.ts`
 * reports it at request time instead (`server.trust_proxy.chain_too_short`).
 */
export const TRUSTED_PROXY_HOPS_MAX = 16;

/**
 * `TRUST_PROXY` as a number of trusted reverse-proxy hops. Same variable, same
 * meaning as the backend's (`apps/backend/src/config/env.schema.ts`), but parsed
 * to a number here because this app has no Express to hand it to: it is read by
 * `lib/logging/client-log-rate-limit.ts` to decide how much of `X-Forwarded-For`
 * was written by infrastructure rather than by the caller.
 *
 *   unset/`false` -> trust nobody (safe default); every caller shares one bucket
 *   `<n>`          -> trust n hops; the nth entry from the right is the client
 *
 * ONE VARIABLE, TWO GRAMMARS. The backend hands this value to Express, which
 * resolves `true`, `loopback`, and CIDR forms against the socket address. A Next
 * route handler has no socket address, so none of those can be honoured here.
 * They resolve to ZERO hops — the safe reading, every caller in one bucket,
 * never "take whatever the caller wrote" — rather than failing the boot.
 * Refusing them was the earlier design and it was a trap: `TRUST_PROXY` is
 * routinely set once for a whole stack (a compose file, a k8s ConfigMap), so a
 * stack-wide `TRUST_PROXY=true` booted the backend and crashed the frontend for
 * a value that is legal on the other side of the same repo. The degradation is
 * not silent — `instrumentation.ts` reports `server.trust_proxy.degraded` at
 * boot, because an operator reading `TRUST_PROXY=true` in their own config
 * would otherwise believe per-client buckets were on.
 *
 * A HOP COUNT IS ONLY AS GOOD AS THE NETWORK. Counting from the right is
 * spoof-resistant while every request really does traverse the declared chain: a
 * caller may prepend entries but cannot displace the ones proxies appended after
 * them. A request that reaches this app WITHOUT that chain inverts it — a
 * directly reachable container port, an SSRF pivot, or a proxy that forwards
 * `X-Forwarded-For` verbatim instead of appending to it — because the caller
 * then writes the selected entry itself. `client-log-rate-limit.ts` bounds the
 * damage (keys must be IP literals; the key map is capped, degrading newcomers
 * to the shared bucket at the ceiling) but cannot make the address true. The rest is network-level and is in SECURITY.md's
 * deploy checklist.
 *
 * Exported because `instrumentation.ts` needs the raw value's verdict, not just
 * the resolved number, to report the degraded case.
 */
export const resolveTrustedProxyHops = (
  raw: string | undefined,
): { hops: number; unevaluatable?: string } => {
  const value = raw?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'false') return { hops: 0 };
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    // Past the bound this is a typo, not a topology, and an over-declared count
    // is NOT harmless: `client-log-rate-limit.ts` counts entries from the right,
    // so a chain shorter than the declared depth can only fall back to the shared
    // bucket — silently turning per-client bucketing off for every request. It
    // takes the same degraded path as `true`/`loopback` (zero hops, reported at
    // boot) rather than failing, for the same reason they do: TRUST_PROXY is set
    // once for a whole stack, and crashing the frontend over a value Express
    // accepts is the trap this function exists to avoid.
    return hops > TRUSTED_PROXY_HOPS_MAX ? { hops: 0, unevaluatable: value } : { hops };
  }
  return { hops: 0, unevaluatable: value };
};

const trustedProxyHopsSchema = z
  .string()
  .optional()
  .transform((raw) => resolveTrustedProxyHops(raw).hops);

const ALLOWED_ORIGIN_HINT =
  'Set the origin browsers address this app on (e.g. https://app.example.com), or leave it ' +
  'unset to compare Origin against the Host header this process receives.';

/**
 * The origin browsers actually address this app on, for `/api/client-logs`'s
 * `Origin` check. Normally UNSET, and normally not needed.
 *
 * That check compares `Origin` against the `Host` header THIS PROCESS RECEIVED,
 * because the app deliberately carries no configured self-URL. Exact while
 * every proxy in front of Next preserves `Host` — and 100% wrong the moment one
 * rewrites it to its upstream (an nginx `proxy_pass` without
 * `proxy_set_header Host $host`), where it fails every real browser request and
 * takes all browser telemetry with it. Preserving `Host` is the better repair
 * and stays the documented one (SECURITY.md, deploy checklist item 13); this is
 * for the deployments where the proxy is not the operator's to change.
 *
 * It is OPERATOR-SET, which is what makes it safe where `X-Forwarded-Host` is
 * not: that header is written by the caller, so honouring it would delete the
 * check rather than repair it. When set it REPLACES the `Host` comparison
 * rather than widening it — an `Origin` that is not this value is refused even
 * when it names the host this process received.
 *
 * IT REPAIRS THE COMPARISON AND TIGHTENS NOTHING. The route compares only when
 * an `Origin` header is PRESENT (see `isAllowedOrigin`), here exactly as under
 * the `Host` comparison: a caller that sends none — an older browser, or
 * anything not a browser — is still admitted, so setting this does not turn
 * `Origin` into a required header and cannot be relied on as one. A browser
 * always sends it, which is the whole basis of the check: it stops other SITES
 * using real visitors' browsers, and never stops `curl`. The rate limit and the
 * shape caps are what bound a caller speaking HTTP directly.
 *
 * ONE ORIGIN, NOT A LIST, and deliberately not parsed as one — a list is how
 * this variable would grow into a general-purpose allowlist, which is a
 * different control with different failure modes. An app genuinely served on
 * several origins (apex plus `www`, per-tenant domains) would therefore lose
 * browser telemetry from every origin but the one named here, so that
 * deployment should leave this unset and fix `Host` at the proxy — which is the
 * better repair in any case.
 *
 * Normalised to a bare origin (scheme + host + port). Anything more is refused
 * at boot: a path or a query in this value reads as a restriction it cannot
 * express, and a check an operator misreads is worse than one they must think
 * about.
 */
const clientLogAllowedOriginSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    const value = raw?.trim() ?? '';
    // Blank is how an env file says "left alone" — it must not read as an
    // origin nothing can ever match, which would refuse every browser request.
    if (value === '') return undefined;

    let parsed: URL | undefined;
    try {
      parsed = new URL(value);
    } catch {
      parsed = undefined;
    }
    // A bare host ('app.example.com') is the likely typo and parses as nothing;
    // a non-http scheme parses fine and could never match a browser's Origin.
    if (parsed === undefined || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `CLIENT_LOG_ALLOWED_ORIGIN must be an absolute http(s) URL. ${ALLOWED_ORIGIN_HINT}`,
      });
      return z.NEVER;
    }
    if (
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'CLIENT_LOG_ALLOWED_ORIGIN is an ORIGIN — scheme, host, and port only. A path, query, ' +
          `fragment, or credentials in it would be ignored, not honoured. ${ALLOWED_ORIGIN_HINT}`,
      });
      return z.NEVER;
    }
    // `URL.origin` is the comparable form: lowercased, default port dropped —
    // the same normalisation the browser's own `Origin` header arrives in.
    return parsed.origin;
  });

/**
 * The `/api/client-logs` ingest figures, exported because
 * `lib/logging/client-log-rate-limit.ts` has to agree with them EXACTLY and a
 * second copy of the numbers was drift waiting to happen. That module's
 * unreadable-env fallback claims to be the schema default, and its memory
 * budget reserves precisely the shared maximum — both were prose promises made
 * over duplicated literals, so moving a figure here would have silently turned
 * the fallback into a separate, invisible policy or understated the budget.
 *
 * The schema owns them rather than the limiter because the limiter is
 * `'server-only'`: importing it here would drag that into the edge bundle
 * through `instrumentation.ts`, which loads this module on both runtimes.
 */
export const CLIENT_LOG_RATE_LIMIT_DEFAULT = 300;
export const CLIENT_LOG_RATE_LIMIT_MAX = 600;
/**
 * The shared figures are WHOLE-APP CEILINGS THAT ALWAYS BIND: every request is
 * charged against the shared bucket alongside the caller's own (see
 * `lib/logging/client-log-rate-limit.ts`), so these are what a distributed
 * caller — many addresses, each politely under its per-client allowance — is
 * held to. They were originally sized as a fallback for the untrusted-topology
 * posture only; once they bind always they bind real production traffic, which
 * is why the default doubled when the dual charge landed: 6 000 requests/min is
 * ~500 concurrently active tabs at the browser logger's idle 5s cadence, or 20
 * saturated per-client callers — and still 10x under the memory reserve the
 * maximum protects.
 */
export const CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT = 6_000;
export const CLIENT_LOG_RATE_SHARED_LIMIT_MAX = 60_000;

/**
 * The record allowances, in the same shape. A request cap alone was the earlier
 * design and it metered the wrong thing: one request may legally carry
 * `MAX_RECORDS` (100), so a caller packing every batch bought roughly a hundred
 * times the ingest of an honest client for the same allowance — against a limit
 * whose stated job is bounding what the log sink has to swallow.
 *
 * Both defaults are 40x their request counterpart — a parity the route charges
 * in record-EQUIVALENTS (a batch costs its record count or its bytes in
 * 64 KiB/100ths, whichever is larger), so 40 units per request is 40 records
 * or ~26 KB of body. In records that is twice the browser logger's own
 * 20-record flush threshold (`lib/logging/client-logger.ts`); in bytes it
 * binds sooner for `client.error.*` batches, whose records deliberately carry
 * the minified browser stack — deliberate here too, since the sink is billed
 * in bytes and an error storm is exactly the traffic whose bytes it must
 * swallow, but it makes the record ceiling, not the request one, the
 * constraint an error storm meets first. A maximally-packed caller is cut to
 * 40% of what the request cap alone would have let through. Raise them if
 * `server.client_logs.throttled` reports `record_budget_exhausted` on real
 * traffic — unlike the request allowance, these do not shrink the key map,
 * because records are charged onto entries that already exist.
 */
export const CLIENT_LOG_RECORD_LIMIT_DEFAULT = 12_000;
export const CLIENT_LOG_RECORD_LIMIT_MAX = 60_000;
/**
 * The shared record ceiling holds the same 40x parity with its request
 * counterpart that the per-client pair does (6 000 x 40 = 240 000), and binds
 * always for the same reason the shared request figure does. It is the app-wide
 * worst case your sink can be asked to swallow in a minute: in byte-equivalents
 * (one unit = 64 KiB / 100) that is ~150 MB/min under active attack, so size it
 * against the sink plan and back it with the provider-side spending quota
 * SECURITY.md's deploy checklist calls for — this ceiling is the last in-app
 * line, not the only one.
 */
export const CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT = 240_000;
export const CLIENT_LOG_RECORD_SHARED_LIMIT_MAX = 1_200_000;

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

  // Idle timeout: how long a signed-in browser may go without touching a member
  // route before it is signed out. Drives the binding cookies' maxAge and the
  // expiry inside the binding token itself (lib/auth/constants.ts), which
  // `proxy.ts` rolls forward as member traffic arrives — on requests of every
  // method, though it writes only when it has something to record or the
  // binding is past half its life.
  //
  // The SECOND of two session clocks, and the one interactive users actually
  // meet. The backend's AUTH_SESSION_TTL_SECONDS is the absolute ceiling on a
  // session's life; this is the idle window inside it. Keep this the smaller of
  // the two. Setting it larger is allowed and degrades cleanly — the session
  // cookie expires first and the visitor lands on /login — because nothing here
  // can read the backend's value to compare against.
  //
  // Capped at 30 days: past that the idle timeout has stopped being one, and
  // any real ceiling belongs in AUTH_SESSION_TTL_SECONDS where it is enforced
  // server-side rather than by a cookie the browser holds.
  AUTH_IDLE_TIMEOUT_SECONDS: positiveIntEnvSchema(
    'AUTH_IDLE_TIMEOUT_SECONDS',
    DEFAULT_IDLE_TIMEOUT_SECONDS,
    2_592_000,
  ),

  // How long `proxy.ts` waits before asking the backend to rotate again after a
  // rotation call it could not complete (lib/auth/session-rotation.ts).
  //
  // The THIRD clock this app shares with the backend, and the same rule holds:
  // neither side can read the other's env, so the coupling lives in both
  // `.env.example` files. Keep it at or below the backend's
  // AUTH_SESSION_ROTATION_GRACE_SECONDS. A rotation that commits and loses its
  // answer on the way back here leaves the browser on the retired token; the
  // grace window keeps that token served, and a retry inside it is answered
  // `superseded` and asks again on the next navigation until one lands past
  // the window and the backend restores the token. A retry set above the
  // window leaves a stretch where ordinary requests are refused before
  // anything asks — a forced sign-out. The recovery reaches no further than a
  // lost answer: once one arrives, this request's own render spends the new
  // token.
  //
  // Capped at an hour: this is a back-off between two calls on one navigation
  // path, and past that it has become a rotation interval of its own.
  AUTH_ROTATION_RETRY_SECONDS: positiveIntEnvSchema(
    'AUTH_ROTATION_RETRY_SECONDS',
    DEFAULT_ROTATION_RETRY_SECONDS,
    3_600,
  ),

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

  // Reverse-proxy topology. Only read by the /api/client-logs rate limit today,
  // which is the only place this app has to work out who a caller is.
  TRUST_PROXY: trustedProxyHopsSchema,

  // How many copies of this app are running behind the load balancer. Read only
  // by the superRefine below, which refuses a scaled-out staging/production boot
  // because the /api/client-logs limit counts in-process. Mirrors the backend's
  // BACKEND_INSTANCE_COUNT guard.
  //
  // It is a DECLARATION, not an observation: nothing here can count its own
  // siblings. On a host where the operator sets the replica count the guard
  // holds; on a serverless or auto-scaling platform (Vercel, Lambda, Cloud Run
  // with min-instances above one) the platform decides, `1` is simply untrue,
  // and the guard proves nothing. That is a far more common way to deploy a Next
  // app than a pinned container, so treat the shared store as required there
  // rather than optional — see SECURITY.md.
  FRONTEND_INSTANCE_COUNT: positiveIntEnvSchema('FRONTEND_INSTANCE_COUNT', 1, 1_000),

  // Master switch for POST /api/client-logs, the one anonymous, unauthenticated
  // write surface this app exposes. OFF BY DEFAULT, matching the house posture
  // for optional infrastructure (OpenTelemetry ships wired up and off by
  // default): a template must not expose an internet-writable ingest endpoint
  // an operator never chose to run. While off the route answers 404 —
  // indistinguishable from not existing — before its rate limit or any body
  // handling runs, and instrumentation.ts names this variable at boot so the
  // silence is never a support mystery. This flag is AUTHORITATIVE over the
  // browser half of the switch: NEXT_PUBLIC_LOG_REMOTE only decides whether our
  // own bundle posts, and cannot re-open ingestion the server has turned off.
  CLIENT_LOG_INGEST_ENABLED: booleanFlagSchema.default(false),

  // The origin the /api/client-logs Origin check compares against, replacing
  // the Host header it uses by default. Unset unless a proxy in front of Next
  // rewrites Host — see `clientLogAllowedOriginSchema` above and SECURITY.md's
  // deploy checklist item 13.
  CLIENT_LOG_ALLOWED_ORIGIN: clientLogAllowedOriginSchema,

  // Allowance for POST /api/client-logs, per 60s window, PER CLIENT — in force
  // only when TRUST_PROXY makes the caller's address knowable and each one gets
  // its own bucket. Tunable because the right figure depends on traffic shape;
  // the LIMIT has deliberately no off switch — while ingestion is enabled
  // (CLIENT_LOG_INGEST_ENABLED above) the anonymous route is always capped,
  // because a template must not ship a way to leave it uncapped.
  //
  // A BUCKET IS AN ADDRESS, NOT A PERSON, which is what sizes the default. This
  // shipped at 60/min against the browser logger's IDLE cadence of twelve a
  // minute, and that figure was wrong twice over: client-logger.ts also flushes
  // the moment 20 records buffer, so one tab in an error storm spends 60/min in
  // seconds — exactly when the logs are worth having — and behind corporate NAT
  // or mobile CGNAT hundreds of members share one address. 300/min covers a
  // sustained burst from one tab or ~25 idle ones and is still an order of
  // magnitude under the shared ceiling below. A per-IP limit cannot fully
  // separate a large office from an abuser; when it fires on real users the
  // server.client_logs.throttled record says so, and raising this is the answer.
  // For IPv6 a bucket is the client's /56 network rather than a single address —
  // one subscriber's delegation is many addresses — so the same grouping trade
  // holds there by construction (see normalizeAddress in that module).
  //
  // The maximum is what keeps the limiter's memory bounded: it is multiplied by
  // the live bucket count, and lib/logging/client-log-rate-limit.ts shrinks its
  // key ceiling as this rises so the product stays at a fixed budget — buying a
  // larger allowance spends tracked clients. The figures are deliberately not
  // restated here: resolveClientLogRateMaxKeys in that module derives them, and
  // .env.example quotes the current values beside this knob.
  CLIENT_LOG_RATE_LIMIT_PER_MINUTE: positiveIntEnvSchema(
    'CLIENT_LOG_RATE_LIMIT_PER_MINUTE',
    CLIENT_LOG_RATE_LIMIT_DEFAULT,
    CLIENT_LOG_RATE_LIMIT_MAX,
  ),

  // Allowance for the same route, per 60s window, for the SHARED bucket — the
  // whole-app request ceiling. EVERY request spends it: alongside the caller's
  // own bucket when TRUST_PROXY vouches for an address, and as the only
  // allowance when it cannot (the default). Per-client XOR shared was the
  // earlier design, and it left no global ceiling at all once per-client
  // buckets were on — thousands of addresses each politely under the
  // per-client figure could multiply it out with nothing above them to bind.
  //
  // Sized as a whole-app figure: the browser logger flushes at most every 5s
  // and every new visitor costs at least one request, so anything near the
  // per-client number would drop real logs at a few dozen page loads a minute.
  // In the untrusted-topology posture one abuser can still spend the whole
  // allowance and starve every real user's telemetry for the rest of the
  // window — documented in SECURITY.md, and the reason TRUST_PROXY is worth
  // setting. The maximum is also the reserve the limiter holds back from its
  // memory budget, so raising it past the cap here means revisiting
  // CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE in lib/logging/client-log-rate-limit.ts.
  CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: positiveIntEnvSchema(
    'CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE',
    CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT,
    CLIENT_LOG_RATE_SHARED_LIMIT_MAX,
  ),

  // Records — not requests — accepted from one client per 60s window, in force
  // alongside the request allowance above. This is the ingest ceiling proper:
  // the sink is sized and billed in records, and a request is worth up to 100 of
  // them, so capping requests alone let a caller who packs every batch buy ~100x
  // the ingest of one who does not. Charged after the body is parsed, because
  // that is the first moment the cost is known; the request cap still does the
  // pre-body shedding. The unit is byte-aware: the route charges a batch its
  // record count or its byte size in 64KiB/100ths, whichever is larger, so one
  // enormous record cannot ride through as a single record.
  //
  // Raising this does NOT shrink the key map the way the request allowance does
  // — records are charged onto entries that already exist, so they cost no extra
  // memory. If server.client_logs.throttled reports record_budget_exhausted on
  // real traffic, this is the knob.
  CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: positiveIntEnvSchema(
    'CLIENT_LOG_RECORD_LIMIT_PER_MINUTE',
    CLIENT_LOG_RECORD_LIMIT_DEFAULT,
    CLIENT_LOG_RECORD_LIMIT_MAX,
  ),

  // The same ceiling for the SHARED bucket, in the record dimension — the
  // whole-app ingest ceiling proper, spent by every batch alongside the
  // caller's own record allowance. This is the figure that stops a distributed
  // caller: per-client buckets bound one address, and this bounds all of them
  // together. Whole-app, so sized well above the per-client figure for the
  // same reason its request counterpart is.
  CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: positiveIntEnvSchema(
    'CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE',
    CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT,
    CLIENT_LOG_RECORD_SHARED_LIMIT_MAX,
  ),
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

  // The shared allowances are the whole-app ceilings EVERY request now spends
  // alongside its per-client bucket, so shared-below-per-client is not a small
  // figure, it is a contradiction: the per-client allowance could never be
  // reached, every caller would meet the global ceiling first, and the
  // throttle records would blame the wrong knob. Refuse it at boot.
  if (env.CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE < env.CLIENT_LOG_RATE_LIMIT_PER_MINUTE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE'],
      message:
        'CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE is the whole-app request ceiling charged on ' +
        'every request and must be at least CLIENT_LOG_RATE_LIMIT_PER_MINUTE — below it, no ' +
        'caller could ever reach its per-client allowance.',
    });
  }
  if (env.CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE < env.CLIENT_LOG_RECORD_LIMIT_PER_MINUTE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE'],
      message:
        'CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE is the whole-app record ceiling charged on ' +
        'every batch and must be at least CLIENT_LOG_RECORD_LIMIT_PER_MINUTE — below it, no ' +
        'caller could ever reach its per-client allowance.',
    });
  }

  // Fail closed: the /api/client-logs limit counts in-process, so N instances
  // means N times the effective allowance with nothing to signal it. The backend
  // already refuses to boot scaled out for the identical reason
  // (BACKEND_INSTANCE_COUNT, apps/backend/src/config/env.schema.ts) — that
  // refusal is the documented mitigation for in-process counting in SECURITY.md,
  // and it has to hold on both sides of the stack to mean anything. Wiring a
  // shared store (Redis or equivalent) into lib/logging/client-log-rate-limit.ts
  // is what relaxes this guard.
  if (
    (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') &&
    env.FRONTEND_INSTANCE_COUNT > 1
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FRONTEND_INSTANCE_COUNT'],
      message:
        'Multi-instance deployments need a shared store for the /api/client-logs rate limit, ' +
        'which is not yet configured. Run a single instance (FRONTEND_INSTANCE_COUNT=1) or ' +
        'implement shared rate-limit storage before scaling out. Note that this guard can ' +
        'only check what you declare — on a serverless or auto-scaling host the platform ' +
        'sets the replica count and the shared store is the only real mitigation.',
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
  // Ship browser logs to /api/client-logs. OFF BY DEFAULT in every environment,
  // so both halves of the ingest switch agree out of the box (the server half is
  // CLIENT_LOG_INGEST_ENABLED, and it is authoritative: with it off, turning
  // this on posts batches into a 404). When off, the browser logger only writes
  // to the DevTools console.
  NEXT_PUBLIC_LOG_REMOTE: booleanFlagSchema,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
