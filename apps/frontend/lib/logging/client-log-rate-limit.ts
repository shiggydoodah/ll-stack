import 'server-only';
import { isIP } from 'node:net';
import { getServerEnv } from '../../config/env';
import {
  CLIENT_LOG_RATE_LIMIT_DEFAULT,
  CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT,
  CLIENT_LOG_RATE_SHARED_LIMIT_MAX,
  CLIENT_LOG_RECORD_LIMIT_DEFAULT,
  CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT,
} from '../../config/env.schema';
import { serverLogger } from './server-logger';
import { FRONTEND_LOG_EVENTS } from './log-events';

// Rate limit for `POST /api/client-logs`, the one anonymous write surface this
// app exposes. The route is already hardened per request (64 KiB body cap, 100
// records, server-side re-redaction, server-authoritative fields) but nothing
// capped how OFTEN an unauthenticated caller could post — so a loop could
// inflate whatever sink the deployment ships logs to. This is that cap.
//
// A DROPPED LOG BATCH IS A NON-EVENT. Rejecting here costs observability for
// one batch and nothing else: `client-logger.ts` fires and forgets (sendBeacon,
// or a `fetch` whose rejection is swallowed), so a 429 never surfaces to the
// member or retries. That is what makes a conservative default safe.
//
// TWO DIMENSIONS, BECAUSE A REQUEST IS NOT THE UNIT THE SINK IS PRICED IN. A
// request-only cap was the earlier design and it was off by the batch size: one
// request may legally carry 100 records and 64 KiB, so a caller packing every
// batch to the maximum bought ~100x the ingest of an honest client flushing a
// record at a time — against a control whose whole purpose is bounding what the
// sink has to swallow. Every caller therefore spends TWO allowances per window:
//
//   requests — `CLIENT_LOG_RATE_LIMIT_*`, charged before the body is read, so a
//              flood is refused without parsing anything. It is also what bounds
//              this module's memory, since a bucket holds one entry per request.
//   records  — `CLIENT_LOG_RECORD_LIMIT_*`, charged once the batch is parsed and
//              its size is known. This is the ingest ceiling proper.
//
// Neither charge is refunded on rejection: a malformed or oversized body still
// costs the request it arrived on (though only that — it is refused before the
// record charge runs), and a refused over-budget batch keeps its record charge,
// so the remaining headroom cannot be probed for free.
//
// TWO ALLOWANCES OF EACH — AND BOTH ARE SPENT ON EVERY REQUEST. When
// `TRUST_PROXY` describes the proxy chain each caller gets its own bucket held
// to the per-client figures, AND every request is charged against the one
// shared bucket held to the `..._SHARED_...` figures — the whole-app ceiling.
// When no address can be vouched for, the shared bucket is the only one and
// the shared figures are the only allowance. Per-client XOR shared was the
// earlier design and it had no global ceiling at all once per-client buckets
// were on: at the defaults, ~2 800 addresses each politely inside their own
// allowance multiplied out to ~33.6M record-units/min with nothing above them
// to bind — a distributed caller paid retail while the app paid the sink. The
// per-client bucket is what stops one abuser; the shared bucket is what stops
// all of them together. (Reusing the per-client figure for both roles was an
// even earlier design, and it dropped real logs at roughly sixty page loads a
// minute — the whole-app ceiling needs its own, much larger numbers.)
//
// THE BUCKET IS AN ADDRESS, NOT A PERSON. Behind corporate NAT or mobile CGNAT
// hundreds of members share one address, and a single tab in an error storm
// flushes far faster than its idle cadence (`client-logger.ts` flushes on 20
// buffered records as well as every 5s). Both push real traffic well past a
// small per-client figure, which is why the default is 300 requests/min rather
// than the 60/min this shipped with. A per-IP limit cannot fully separate a
// large office from an abuser; when it fires on real users the
// `server.client_logs.throttled` record says so (`sharedBucket: false` with a
// high `bucketCount`), and raising the allowance is the intended response. See
// `.env.example` for the trade: the key ceiling below shrinks as the request
// allowance rises. For IPv6 the address-shaped unit is a /56 NETWORK, not a
// single address — one subscriber's delegation is many addresses — see
// `normalizeAddress`.
//
// IN-PROCESS, LIKE THE BACKEND'S. Counts live in this process, so they do not
// hold across instances — the same known limitation `SECURITY.md` records for
// the backend throttler. `FRONTEND_INSTANCE_COUNT > 1` is refused at boot in
// staging and production for exactly that reason (`config/env.schema.ts`); a
// shared store (Redis or equivalent) is what relaxes it, and it replaces the map
// below without touching the route. That guard is a DECLARATION, not an
// observation: a serverless or auto-scaling host runs N isolates without telling
// the app, so there the refusal proves nothing and the shared store is the only
// real answer.

/** The counting window. Fixed; only the per-window allowances are configurable. */
export const CLIENT_LOG_RATE_WINDOW_MS = 60_000;

/**
 * Allowances used when the env cannot be read at all — see `readConfig`. They
 * ARE the schema defaults, imported rather than restated, so the fallback cannot
 * drift into a second, invisible policy. Two copies of the figure with a comment
 * promising they matched was the earlier design, and nothing enforced it.
 */
export const CLIENT_LOG_RATE_FALLBACK_LIMIT = CLIENT_LOG_RATE_LIMIT_DEFAULT;
export const CLIENT_LOG_RATE_FALLBACK_SHARED_LIMIT = CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT;
export const CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT = CLIENT_LOG_RECORD_LIMIT_DEFAULT;
export const CLIENT_LOG_RATE_FALLBACK_SHARED_RECORD_LIMIT = CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT;

/**
 * The memory bound, expressed where it actually lives: the total number of live
 * REQUEST entries this module will hold across every bucket. Each entry costs
 * two numbers — its timestamp, and the records charged against it — so ~900k
 * entries is roughly 15 MB (transiently up to twice that: retirement compacts
 * lazily, holding at most one dead entry per live one — see
 * `retireExpiredHits`). It halved when the record dimension was added, for
 * exactly that reason: the same byte budget buys half as many entries once each
 * one has to carry what it cost the sink.
 *
 * It is the product `keys x request allowance` — not either factor alone — that
 * has to be bounded, so the key ceiling below is derived from it rather than
 * fixed. `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` is capped in the schema so the
 * derivation never has to choose between this budget and `..._MIN_KEYS`. The
 * record allowance does NOT enter the derivation: records are charged onto
 * entries that already exist, so they add no entries of their own.
 */
export const CLIENT_LOG_RATE_MAX_TRACKED_HITS = 900_000;

/**
 * Headroom held back for the shared bucket, which is held to `sharedLimit` and
 * not to `limit`. Without it the budget above was a claim about the per-client
 * buckets alone and the module could exceed it by up to the shared allowance —
 * the key ceiling is derived from what is left after this reserve instead, so
 * `keys x limit + sharedLimit` really does fit.
 *
 * Because the reserve is held OUTSIDE the derived ceiling, the shared bucket is
 * also exempt from that ceiling in `checkClientLogRateLimit` — it is budgeted
 * for separately, so making it compete for a per-client slot was the two halves
 * of this contradicting each other. See the exemption there for what that cost.
 *
 * It IS the schema's maximum for `CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE`,
 * imported rather than restated, so raising that cap cannot silently understate
 * the budget; the derivation stays a pure function of the per-client allowance.
 */
export const CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE = CLIENT_LOG_RATE_SHARED_LIMIT_MAX;

/**
 * Hard ceiling on live PER-CLIENT buckets, bounding cardinality when a source
 * sprays distinct keys. `normalizeAddress` is the first line of that defence —
 * an IPv6 caller's entire delegation collapses onto one /56 key, so filling
 * the map takes addresses in thousands of distinct NETWORKS, not one host's —
 * and this ceiling is the backstop for a source that has them. The shared
 * bucket sits outside it, on its own reserve. See `admit` for what happens at
 * the ceiling.
 */
export const CLIENT_LOG_RATE_MAX_KEYS = 10_000;

/**
 * Floor on the derived ceiling. A map too small to hold a real working set
 * would collapse ordinary traffic into the shared bucket — so a large
 * configured allowance shrinks the map only this far. The schema's cap
 * on the allowance keeps this floor out of reach; it exists so that raising the
 * cap fails safe rather than collapsing the map.
 */
export const CLIENT_LOG_RATE_MIN_KEYS = 1_000;

/**
 * How many per-client buckets may be live, given the request allowance each of
 * them can grow to. At the default 300 this is 2 800; at the schema's maximum
 * allowance it is 1 400, and in both cases `keys x allowance + the shared
 * reserve` stays inside the entry budget above — the shared bucket spends the
 * reserve rather than one of these slots.
 *
 * There is no env knob for this: an operator seeing
 * `server.client_logs.store_saturated` raises nothing to fix it, because the
 * ceiling SHRINKS as the allowance grows. The
 * lever is lowering `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` (up to the flat cap
 * above) or moving to a shared store. `.env.example` says so where operators
 * will look for it.
 */
export const resolveClientLogRateMaxKeys = (limit: number): number =>
  Math.min(
    CLIENT_LOG_RATE_MAX_KEYS,
    Math.max(
      CLIENT_LOG_RATE_MIN_KEYS,
      Math.floor(
        (CLIENT_LOG_RATE_MAX_TRACKED_HITS - CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE) / limit,
      ),
    ),
  );

/**
 * Floor on how often a request may force a full sweep. At the ceiling every
 * request carrying a new key would otherwise buy the caller an O(size) scan.
 */
const PRUNE_MIN_INTERVAL_MS = 1_000;

/**
 * Bucket key for every caller whose real address cannot be established: no
 * declared proxy chain, no `X-Forwarded-For`, a chain shorter than declared, or
 * a selected entry that is not an address at all.
 *
 * It carries no prefix and every address-derived key does, so no header value
 * can ever normalise onto it. That is defence in depth rather than a hole being
 * closed — naming the old bare-string sentinel got a caller the same shared
 * bucket that simply omitting the header already gives them — but a sentinel
 * sharing a namespace with caller-influenced keys is a bug waiting for the next
 * change to the bucketing rules.
 */
export const SHARED_BUCKET_KEY = 'shared';

/** Namespaces every address-derived key away from {@link SHARED_BUCKET_KEY}. */
const ADDRESS_KEY_PREFIX = 'ip:';

/** An address is at most an IPv6 literal with an IPv4 tail (45 chars). */
const MAX_KEY_LENGTH = 64;

const FORWARDED_FOR_HEADER = 'x-forwarded-for';

export type ClientLogRateLimitReason = 'window_exhausted' | 'record_budget_exhausted';

/**
 * Why the route refused a request BEFORE the limiter saw it — see
 * {@link reportClientLogRefusal}.
 */
export type ClientLogRefusalReason = 'cross_site' | 'origin_mismatch' | 'content_type';

/**
 * Handle for the second half of a request's charge. `checkClientLogRateLimit`
 * opens entries before the body is read; `chargeClientLogRecords` writes the
 * batch size onto THOSE entries once it is known, so the records retire from
 * the window at the same moment the request that carried them does.
 *
 * Each half identifies its entry by absolute sequence rather than array index,
 * because entries retire off the front while a body is in flight and an index
 * would quietly slide onto someone else's request.
 */
export interface ClientLogRateTicket {
  /**
   * The caller's own window. Absent when the request was metered on the shared
   * bucket alone — an untrusted topology, or a newcomer degraded at the key
   * ceiling — in which case the shared entry below is the whole charge.
   */
  client?: { bucket: Bucket; sequence: number };
  /** The whole-app window. Every admitted request holds an entry here. */
  shared: { bucket: Bucket; sequence: number };
  sharedBucket: boolean;
  /** Carried so the record half's decisions wear it too — see the decision field. */
  degraded: boolean;
}

export interface ClientLogRateLimitDecision {
  allowed: boolean;
  /** Seconds to advertise in `Retry-After`. Zero when the request is allowed. */
  retryAfterSeconds: number;
  /**
   * True at most once per window PER (reason, bucket kind, degraded). A record per rejected
   * request would turn a flood of dropped logs into a flood of written ones — the
   * amplification this limit exists to prevent — but a single global slot was the
   * wrong correction: whichever rejection won it silenced the others for a full
   * window, so one throttled abuser could mask app-wide starvation.
   */
  shouldReport: boolean;
  reason?: ClientLogRateLimitReason;
  /** The allowance in force for this decision's dimension, so the reporter does not re-read the env. */
  limit: number;
  /**
   * Rejections on THIS (reason, bucket kind) since it last reported, this one
   * included, and zero on any request that is not reporting. Because the report
   * fires once per window, the single log line is the operator's whole signal —
   * without a count it cannot separate one caller hammering the endpoint from
   * every real user being dropped.
   */
  rejectedSinceLastReport: number;
  /**
   * Live PER-CLIENT bucket count, so a saturated store is visible as such in
   * the log. The shared bucket is excluded: every request charges it, so it is
   * effectively always live and would only add a constant 1 to every figure —
   * and it is budgeted by the reserve, not by a key slot.
   */
  bucketCount: number;
  /** True when the allowance in force is the whole-app one — see `TRUST_PROXY`. */
  sharedBucket: boolean;
  /**
   * True when the caller was pushed into the shared bucket by the key ceiling
   * rather than by topology. A shared-bucket rejection wearing this flag is map
   * pressure, not an unset `TRUST_PROXY`, and its lever is LOWERING
   * `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` — not raising the shared allowance.
   */
  degraded: boolean;
  /** Present only on an admitted request: pass it to `chargeClientLogRecords`. */
  ticket?: ClientLogRateTicket;
}

interface RateLimitConfig {
  /** The /api/client-logs master switch — see `isClientLogIngestEnabled`. */
  ingestEnabled: boolean;
  /** Operator-set origin for the route's Origin check — see `resolveClientLogAllowedOrigin`. */
  allowedOrigin: string | undefined;
  /** Per-client request allowance, in force when a caller has its own bucket. */
  limit: number;
  /** Whole-app request allowance, in force when callers share the untrusted bucket. */
  sharedLimit: number;
  /** Per-client record allowance. */
  recordLimit: number;
  /** Whole-app record allowance. */
  sharedRecordLimit: number;
  /** Trusted proxy hops; zero means the whole-app bucket. */
  trustedProxyHops: number;
  /** Derived from `limit` — see `resolveClientLogRateMaxKeys`. */
  maxKeys: number;
}

const FALLBACK_CONFIG: RateLimitConfig = {
  // Fail CLOSED, like the schema default it mirrors: an unreadable env must
  // read as "ingest off", never as "ingest on with default allowances".
  ingestEnabled: false,
  // Unset is the stricter reading: the route falls back to comparing Origin
  // against the Host header, which is what it does with no override configured.
  // An unreadable env must not be able to widen a security check. Kept as the
  // correct default rather than a live one — `ingestEnabled: false` above means
  // the route never reads this field off THIS object; see
  // `resolveClientLogAllowedOrigin`.
  allowedOrigin: undefined,
  limit: CLIENT_LOG_RATE_FALLBACK_LIMIT,
  sharedLimit: CLIENT_LOG_RATE_FALLBACK_SHARED_LIMIT,
  recordLimit: CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT,
  sharedRecordLimit: CLIENT_LOG_RATE_FALLBACK_SHARED_RECORD_LIMIT,
  trustedProxyHops: 0,
  maxKeys: resolveClientLogRateMaxKeys(CLIENT_LOG_RATE_FALLBACK_LIMIT),
};

let cachedConfig: RateLimitConfig | null = null;
let fallbackReported = false;
let fallbackHoldUntilMs = 0;

/**
 * How long a failed env parse holds the fallback before another attempt. See
 * `readConfig`: recovery needs re-attempts, the request path needs them to be
 * rare, and this is the balance between the two.
 */
export const CLIENT_LOG_RATE_CONFIG_RETRY_MS = 5_000;

/**
 * The parsed env, memoised — but ONLY on success.
 *
 * `instrumentation.ts` parses the env at boot, so a booted app never reaches the
 * fallback. If it ever does, fail closed on the documented default allowances
 * and no proxy trust rather than let a config problem disable the limit — and
 * critically, do NOT memoise that: caching the fallback made one early failure
 * discard `TRUST_PROXY` for the entire life of the process, silently and
 * irreversibly. It is reported once, because a security control quietly running
 * in a degraded mode is worse than the mode itself.
 *
 * Re-attempted on a HOLD-DOWN, not per request: `getServerEnv` memoises nothing
 * on failure, so while degraded every call here would otherwise re-run a full
 * zod parse of `process.env` (and construct its ZodError) — up to three times
 * per request, on the one route whose design depends on shedding floods without
 * doing work. One attempt per `CLIENT_LOG_RATE_CONFIG_RETRY_MS` keeps the
 * recovery while making the degraded path cheap for every request in between.
 */
const readConfig = (nowMs: number): RateLimitConfig => {
  if (cachedConfig !== null) return cachedConfig;
  if (nowMs < fallbackHoldUntilMs) return FALLBACK_CONFIG;
  try {
    const env = getServerEnv();
    cachedConfig = {
      ingestEnabled: env.CLIENT_LOG_INGEST_ENABLED,
      allowedOrigin: env.CLIENT_LOG_ALLOWED_ORIGIN,
      limit: env.CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
      sharedLimit: env.CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE,
      recordLimit: env.CLIENT_LOG_RECORD_LIMIT_PER_MINUTE,
      sharedRecordLimit: env.CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE,
      trustedProxyHops: env.TRUST_PROXY,
      maxKeys: resolveClientLogRateMaxKeys(env.CLIENT_LOG_RATE_LIMIT_PER_MINUTE),
    };
    return cachedConfig;
  } catch {
    fallbackHoldUntilMs = nowMs + CLIENT_LOG_RATE_CONFIG_RETRY_MS;
    if (!fallbackReported) {
      fallbackReported = true;
      report('server.client_logs.config_unreadable', {
        limitPerMinute: FALLBACK_CONFIG.limit,
        sharedLimitPerMinute: FALLBACK_CONFIG.sharedLimit,
        recordLimitPerMinute: FALLBACK_CONFIG.recordLimit,
        sharedRecordLimitPerMinute: FALLBACK_CONFIG.sharedRecordLimit,
        trustedProxyHops: FALLBACK_CONFIG.trustedProxyHops,
      });
    }
    return FALLBACK_CONFIG;
  }
};

/**
 * Whether POST /api/client-logs is switched on at all (`CLIENT_LOG_INGEST_ENABLED`,
 * default OFF). The route checks this before anything else — before its rate
 * limit, before reading a single header beyond what routing needed — and answers
 * 404 while it is off, so a disabled route is indistinguishable from one that
 * does not exist. It lives here rather than in the route because `readConfig`
 * already owns the safe way to read this env per request: memoised on success,
 * held down on failure (so a broken env is not re-parsed per request on the one
 * route built for cheap shedding), and failing CLOSED to the schema's own
 * default of off.
 */
export const isClientLogIngestEnabled = (nowMs: number = Date.now()): boolean =>
  readConfig(nowMs).ingestEnabled;

/**
 * `CLIENT_LOG_ALLOWED_ORIGIN`, normalised to a bare origin — or undefined when
 * it is unset, which is the default and the common case. The route's Origin
 * check compares against the Host header until this names something to compare
 * against instead; see `clientLogAllowedOriginSchema` in config/env.schema.ts
 * for what it is for and why an operator-set value is safe where the
 * caller-written `X-Forwarded-Host` would not be.
 *
 * Read through `readConfig` for the same reason `isClientLogIngestEnabled` is:
 * that is where the per-request env read is memoised on success and held down
 * on failure.
 *
 * Its fallback is the stricter reading (`allowedOrigin: undefined`, so a config
 * problem could only narrow this check and never widen it) — but that is a
 * correct default, NOT a live guarantee, and it is worth knowing which. The
 * same FALLBACK_CONFIG sets `ingestEnabled: false`, and the route tests that
 * first: it answers 404 before it reads a single header. So every request that
 * reaches the Origin check has already passed `isClientLogIngestEnabled`, which
 * means `readConfig` returned a parsed env and memoised it — `cachedConfig` is
 * populated and the fallback's `allowedOrigin` is never the value consulted
 * here. The default stays because it is the right one for a direct caller and
 * for whatever order the checks end up in later, not because anything reaches
 * it today.
 */
export const resolveClientLogAllowedOrigin = (nowMs: number = Date.now()): string | undefined =>
  readConfig(nowMs).allowedOrigin;

/**
 * Writes one of this module's own records. Guarded because the logger resolves
 * its threshold from the same env that may have just failed to parse, and
 * because the sink is exactly what these records are about — so it is the thing
 * most likely to be broken when one is written. A report that cannot be written
 * must never become the reason a request fails.
 */
const report = (
  event: keyof typeof FRONTEND_LOG_EVENTS,
  details: Record<string, unknown>,
): void => {
  try {
    serverLogger.warn(FRONTEND_LOG_EVENTS[event], details);
  } catch {
    // Nothing left to report through. The decision still stands.
  }
};

/**
 * WHICH COMPARAND the Origin check was running against, added to the one
 * refusal it bears on.
 *
 * Without it the record is the same bytes in both modes, and the two states an
 * operator has to tell apart look identical: `CLIENT_LOG_ALLOWED_ORIGIN` is not
 * being read (unset, or blanked by an env that never reached this process), and
 * it IS being read and is wrong — a typo, a `www.` where browsers address the
 * apex, an origin left over from a domain migration. Both produce
 * `origin_mismatch` on every request and drop 100% of browser telemetry, and
 * the variable an operator reaches for under SECURITY.md's checklist item 13 is
 * itself the second one. A repair whose own failure mode is indistinguishable
 * from the fault it repairs is not much of a repair.
 *
 * THE CONFIGURED VALUE IS RECORDED, the Host comparand is not, and the
 * asymmetry is the point: `allowedOrigin` is operator-set and schema-normalised
 * (config/env.schema.ts), so it is ours to log and it is the NORMALISED form
 * actually compared — which is the one thing reading the env back does not
 * show. `Host` is caller-written, so recording it would put caller-controlled
 * bytes in a record about refusing caller-controlled bytes. `originCheck:
 * 'host'` names the mode without quoting anybody.
 *
 * Read through `readConfig` like every other config access here, at the same
 * instant the report is taken.
 */
const originCheckDetails = (
  reason: ClientLogRefusalReason,
  nowMs: number,
): Record<string, unknown> => {
  if (reason !== 'origin_mismatch') return {};
  const allowedOrigin = readConfig(nowMs).allowedOrigin;
  return allowedOrigin === undefined
    ? { originCheck: 'host' }
    : { originCheck: 'allowed_origin', allowedOrigin };
};

/**
 * Reports one of the route's PRE-LIMIT refusals — cross-site fetch metadata, an
 * Origin that does not name this host, a non-JSON content-type. Those refusals
 * answer with a bare status, and the browser logger fires and forgets, so
 * without this the condition is invisible on both sides at once.
 *
 * It lives here rather than in the route because the report budget does: a
 * per-request record on an anonymous endpoint is the amplification every other
 * report in this module is shaped to avoid, and a second copy of that budget in
 * the route would be one more thing to keep in step. One slot PER REASON, so a
 * flood of cross-site probes cannot hide the `origin_mismatch` that means a
 * proxy is eating every real browser request — the same reason the throttle
 * report is split per (reason, bucket kind).
 *
 * Reasons, counts, and — for `origin_mismatch` — which comparand the check was
 * running against. Nothing caller-supplied: the request's own `Origin`, and the
 * `Host` it would have been matched against, are both written by the caller and
 * are never recorded.
 */
export const reportClientLogRefusal = (
  reason: ClientLogRefusalReason,
  nowMs: number = Date.now(),
): void => {
  const slot = takeReportSlot(`refused:${reason}`, nowMs);
  if (!slot.shouldReport) return;
  report('server.client_logs.refused', {
    reason,
    refusedSinceLastReport: slot.count,
    ...originCheckDetails(reason, nowMs),
  });
};

/**
 * The eight 16-bit groups of an IPv6 literal `isIP` has already accepted —
 * compressed (`::`), full, and embedded-IPv4 (`::ffff:1.2.3.4`) forms alike.
 * Only ever called on validated input, which is what keeps it this small; it
 * exists because Node exposes no byte-level parse of its own.
 */
const parseIpv6Groups = (literal: string): number[] => {
  let text = literal;
  const tail: number[] = [];

  // An embedded dotted quad (`::ffff:1.2.3.4`) is the last two groups in
  // another spelling.
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    const octets = text
      .slice(lastColon + 1)
      .split('.')
      .map(Number);
    tail.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
    text = text.slice(0, lastColon + 1);
  }

  const toGroups = (part: string): number[] =>
    part
      .split(':')
      .filter((group) => group.length > 0)
      .map((group) => Number.parseInt(group, 16));

  const compressedAt = text.indexOf('::');
  if (compressedAt === -1) return [...toGroups(text), ...tail];

  const head = toGroups(text.slice(0, compressedAt));
  const rest = [...toGroups(text.slice(compressedAt + 2)), ...tail];
  return [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
};

/**
 * One chain entry reduced to the address it identifies, or `null` when it is not
 * an address at all.
 *
 * Proxies disagree about whether to append the source port: Azure App Service
 * always does (`1.2.3.4:41237`), AWS ALB does when port appending is on, and the
 * bracketed IPv6 form (`[2001:db8::1]:41237`) exists to delimit the two. Keeping
 * the port would make every new connection from one client a new bucket, which
 * turns the per-client limit into no limit at all and fills the key map with
 * what is really a single caller.
 *
 * VALIDATED, NOT JUST TRIMMED. Anything that is not an IP literal after that is
 * refused outright and its request falls to the shared bucket. An earlier version
 * lowercased the entry, truncated it to 64 characters and used whatever was left
 * as a key, which meant a caller able to write the selected entry could mint an
 * unbounded number of buckets out of arbitrary strings — and could collide two
 * distinct entries by sharing a 64-character prefix. Restricting keys to IP
 * literals does not make a caller-written entry trustworthy (see
 * `resolveClientLogRateLimitKey`), but it bounds the key space to something the
 * ceiling in `admit` can actually defend.
 *
 * CANONICALISED, NOT JUST VALIDATED. IPv6 has many spellings per address —
 * `2001:db8::1`, `2001:0db8:0:0:0:0:0:1`, and `::ffff:0102:0304` for
 * `::ffff:1.2.3.4` — so a key cut from the accepted text handed one caller a
 * bucket per spelling. IPv6 keys are therefore derived from the PARSED groups,
 * never from the caller-shaped text. IPv4 needs no such step: `isIP` accepts
 * only its one canonical dotted-quad form.
 *
 * AN IPV6 CLIENT IS A NETWORK, NOT AN ADDRESS. Carriers and ISPs delegate a
 * whole /64 or /56 per subscriber, so one ordinary v6 host can source every
 * request from a different, entirely genuine address — no spoofing, no broken
 * topology. Keyed by full address it could open a bucket per request and pin
 * the key map at its ceiling for 2 800 requests a minute at the default
 * allowance, collapsing every legitimate newcomer into the shared whole-app
 * allowance for as long as it kept going. IPv6 keys are therefore the /56 NETWORK, sized to the largest
 * routine delegation, so rotating inside one spends a single allowance exactly
 * as one IPv4 address does. The trade is that a /56 can group neighbouring
 * /64s — sometimes distinct subscribers — into one bucket: the same NAT/CGNAT
 * trade documented above for IPv4, with the same response (raise the
 * allowance).
 */
const normalizeAddress = (entry: string): string | null => {
  let value = entry.trim();

  // LENGTH FIRST, ahead of every scan and allocation below. Everything that
  // follows walks or copies the whole string — the bracket/port scan, the
  // `indexOf('%')`, the `slice`s, the digit test on the tail, `toLowerCase` —
  // and the entry is caller-written, bounded only by Node's ~16 KiB header
  // limit. This runs on the PRE-CHARGE path (the key decides the bucket, so it
  // is computed before the request is admitted or refused), the same path the
  // walk in `resolveClientLogRateLimitKey` materialises lazily for exactly this
  // reason; paying full-string work on a value about to be rejected undoes it.
  //
  // Checked on the entry as RECEIVED rather than after the port/zone strip:
  // `MAX_KEY_LENGTH` sits clear of the longest legal spelling — a bracketed
  // IPv6 with an embedded IPv4 tail, a port and a zone id is 63 characters —
  // so nothing `isIP` would have accepted is refused by checking it here.
  if (value.length === 0 || value.length > MAX_KEY_LENGTH) return null;

  if (value.startsWith('[')) {
    // The brackets are the delimiter, so whatever follows `]` is a port.
    const close = value.indexOf(']');
    if (close > 0) value = value.slice(1, close);
  } else {
    // A bare IPv6 literal is full of colons, so only a single trailing
    // `:<digits>` is unambiguously a port rather than part of the address.
    const colon = value.indexOf(':');
    if (colon > 0 && colon === value.lastIndexOf(':') && /^\d+$/.test(value.slice(colon + 1))) {
      value = value.slice(0, colon);
    }
  }

  // An IPv6 zone (`fe80::1%eth0`) is link scope rather than identity, and an
  // unbounded suffix a caller could otherwise use to mint keys from one address.
  const zone = value.indexOf('%');
  if (zone > 0) value = value.slice(0, zone);

  value = value.toLowerCase();

  const version = isIP(value);
  if (version === 4) return `${ADDRESS_KEY_PREFIX}${value}`;
  if (version !== 6) return null;

  const groups = parseIpv6Groups(value);

  // `::ffff:1.2.3.4` — in ANY spelling, `::ffff:0102:0304` included — is an
  // IPv4 caller on a dual-stack listener, not an IPv6 client, so it takes the
  // IPv4 key it spells: a proxy that varies the form would otherwise hand one
  // caller two allowances. Detected on the parsed groups rather than the text
  // so no spelling of the prefix escapes the collapse.
  if (groups[5] === 0xffff && groups.slice(0, 5).every((group) => group === 0)) {
    const [high, low] = [groups[6]!, groups[7]!];
    return `${ADDRESS_KEY_PREFIX}${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }

  // The /56 network, formatted from the masked groups so the key is derived
  // bytes rather than caller-shaped text. The low 72 bits are identity the
  // caller holds; the prefix is what the network routed to them.
  const prefix = [groups[0]!, groups[1]!, groups[2]!, groups[3]! & 0xff00];
  return `${ADDRESS_KEY_PREFIX}${prefix.map((group) => group.toString(16)).join(':')}::/56`;
};

/**
 * Which bucket a request counts against.
 *
 * Next route handlers expose no socket address, so the client address can only
 * come from `X-Forwarded-For` — a header the client itself can write. It is
 * therefore only trustworthy to the depth an operator declares in `TRUST_PROXY`:
 * with `n` trusted hops in front, the `n`th entry from the RIGHT is the one the
 * nearest trusted proxy wrote, and everything to its left is caller-supplied
 * (this mirrors Express' numeric `trust proxy`, which the backend uses).
 *
 * ANYTHING WE CANNOT VOUCH FOR SHARES ONE BUCKET, deliberately. Trusting the
 * header without a declared chain would let a caller mint a fresh allowance per
 * request by rotating the value — the limit would exist and enforce nothing. The
 * shared bucket is the honest floor: with `TRUST_PROXY` unset (the default) the
 * limit is a whole-app ingest cap on its own, larger allowances. Set
 * `TRUST_PROXY` to a hop count to get per-client buckets.
 *
 * WHAT A HOP COUNT DOES NOT COVER. Counting from the right holds while every
 * request really does traverse the declared chain — a caller may prepend entries
 * but cannot displace the ones proxies appended after them, so padding the header
 * moves the index, not the answer. A request that reaches this app WITHOUT that
 * chain inverts it: with one hop declared and nothing appending, `entries.length`
 * is whatever the caller sent and the selected entry is the caller's own. The
 * length check below only catches a caller sending FEWER entries than declared —
 * which a caller has no reason to produce, but a MISCONFIGURED operator produces
 * on every request, so it is reported (see `server.trust_proxy.chain_too_short`).
 * Two things bound the damage — keys must be IP literals (`normalizeAddress`),
 * and the key map is capped, degrading newcomers to the shared bucket at the
 * ceiling (`admit`) — but neither makes the address true. The remaining requirement is network-level: this app must be
 * reachable only through the chain `TRUST_PROXY` describes. SECURITY.md says so
 * in the deploy checklist; do not treat a hop count as protection on an app with
 * a directly reachable port.
 */
export const resolveClientLogRateLimitKey = (
  headers: Headers,
  nowMs: number = Date.now(),
): string => {
  const { trustedProxyHops } = readConfig(nowMs);
  if (trustedProxyHops <= 0) return SHARED_BUCKET_KEY;

  const chain = headers.get(FORWARDED_FOR_HEADER);
  if (chain === null) return SHARED_BUCKET_KEY;

  // WALKED FROM THE RIGHT, materialising only the entries actually examined.
  // This runs ahead of the request charge — the key decides the bucket — so it
  // has to stay cheap for requests about to be refused. Splitting the whole
  // header was up to ~8 000 substring allocations per request out of one 16 KiB
  // caller-supplied value, when only the `trustedProxyHops`-th entry from the
  // right is ever the answer. Empty segments are skipped, exactly as the old
  // split-and-filter skipped them.
  let end = chain.length;
  let seen = 0;
  let selected: string | null = null;
  while (end > 0) {
    const comma = chain.lastIndexOf(',', end - 1);
    const segment = chain.slice(comma + 1, end).trim();
    if (segment.length > 0) {
      seen += 1;
      if (seen === trustedProxyHops) {
        selected = segment;
        break;
      }
    }
    end = comma;
  }

  if (selected !== null) {
    const addressKey = normalizeAddress(selected);
    if (addressKey !== null) return addressKey;

    // The chain was long enough and the entry we were told to trust is simply
    // not an address — a proxy writing a hostname, the RFC 7239 `unknown`
    // token, or an obfuscated identifier. That collapses every caller into the
    // shared bucket exactly as an over-declared TRUST_PROXY does, permanently
    // and (until this record) just as silently, so it gets the same treatment
    // on a slot of its own.
    const notAnAddress = takeReportSlot('trust_proxy:entry_not_an_address', nowMs);
    if (notAnAddress.shouldReport) {
      report('server.trust_proxy.entry_not_an_address', {
        // The declared depth and the offending entry's LENGTH — enough to tell
        // `unknown` from a hostname from garbage. Never the entry, which is
        // caller-supplied.
        declaredHops: trustedProxyHops,
        entryLength: selected.length,
        requestsSinceLastReport: notAnAddress.count,
      });
    }
    return SHARED_BUCKET_KEY;
  }
  // A header that is present but holds no entries is the same thing as no
  // header: an ordinary address-less caller, not a misconfiguration.
  if (seen === 0) return SHARED_BUCKET_KEY;

  // A chain shorter than the declared hop count means the request did not come
  // through the topology we were told about. Share a bucket rather than guess —
  // and SAY SO, because the overwhelmingly likely cause is an over-declared
  // TRUST_PROXY, which silently collapses every caller into the shared bucket
  // for the life of the deployment. Silence here was the same trap
  // `server.trust_proxy.degraded` exists to close for `true`/`loopback`: the
  // operator reads their own config as "per-client buckets are on" and nothing
  // contradicts them. Reported at most once per window, on its own slot, so a
  // caller cannot amplify it into log volume.
  const slot = takeReportSlot('trust_proxy:chain_too_short', nowMs);
  if (slot.shouldReport) {
    report('server.trust_proxy.chain_too_short', {
      // Lengths and counts only — the chain itself is caller-supplied.
      declaredHops: trustedProxyHops,
      chainLength: seen,
      requestsSinceLastReport: slot.count,
    });
  }
  return SHARED_BUCKET_KEY;
};

/**
 * One caller's live window.
 *
 * `hits` holds the timestamp of every request still inside the window, ascending.
 * Holding the individual times rather than a counter plus a window stamp is what
 * keeps this a sliding window — a fixed window would hand a caller aligned to its
 * boundary `2 * limit` requests back to back.
 *
 * `records[i]` is what `hits[i]` cost the sink, written by
 * `chargeClientLogRecords` once the batch has been parsed. Keeping the two in
 * lockstep is what makes the record window slide with the request window instead
 * of needing a second set of timestamps.
 */
interface Bucket {
  hits: number[];
  records: number[];
  /** Index of the oldest LIVE entry; everything before it has retired — see `retireExpiredHits`. */
  start: number;
  /** Sum of the live `records`, maintained incrementally so the check stays O(1). */
  recordSum: number;
  /**
   * Lower bound on the oldest LIVE entry carrying a charge: no live entry
   * before it has one. `secondsUntilOldestChargedRetires` needs that entry, and
   * rescanning for it walked the live window on every record rejection — see
   * that function for why the prefix it walked is the cheap part of an attack
   * to manufacture. Advanced by the scan itself, pulled back by
   * `applyRecordCharge`, and rebased by compaction, so the answer stays exact.
   */
  charged: number;
  /** Hits retired off the front since this bucket opened — see `ClientLogRateTicket`. */
  retired: number;
}

/** Entries still inside the window — the dead prefix before `start` does not count. */
const liveHits = (bucket: Bucket): number => bucket.hits.length - bucket.start;

const buckets = new Map<string, Bucket>();
let lastPruneAtMs = 0;

/**
 * The figure the key ceiling and every reported `bucketCount` are about. The
 * shared bucket is excluded by construction: it is one fixed key budgeted by
 * `CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE` outside the derived ceiling, and —
 * now that every request charges it — it is effectively always live, so
 * counting it would permanently spend one derived per-client slot on a bucket
 * the reserve already pays for.
 */
const perClientBucketCount = (): number => buckets.size - (buckets.has(SHARED_BUCKET_KEY) ? 1 : 0);

/**
 * Report budget, held per channel rather than globally.
 *
 * Bounded and small: two bucket kinds times the rejection reasons (degraded
 * shared rejections on channels of their own), plus the proxy-chain and
 * saturation channels. One global slot was the earlier design and it defeated its
 * own purpose — the whole point of the record is to tell one caller hammering the
 * endpoint from the whole-app ceiling starving every real user from a key map
 * under a spray attack, and with one slot whichever fired first hid the others
 * for a full window while `rejectedSinceLastReport` silently summed them together.
 */
interface ReportSlot {
  lastReportAtMs: number;
  suppressed: number;
}
const reportSlots = new Map<string, ReportSlot>();

/**
 * Claims one channel's once-per-window report budget. Returns whether this call
 * gets to report and, if so, how many events it stands for (itself included).
 */
const takeReportSlot = (
  channel: string,
  nowMs: number,
): { shouldReport: boolean; count: number } => {
  let slot = reportSlots.get(channel);
  if (slot === undefined) {
    slot = { lastReportAtMs: 0, suppressed: 0 };
    reportSlots.set(channel, slot);
  }

  slot.suppressed += 1;
  if (nowMs - slot.lastReportAtMs < CLIENT_LOG_RATE_WINDOW_MS)
    return { shouldReport: false, count: 0 };

  slot.lastReportAtMs = nowMs;
  const count = slot.suppressed;
  slot.suppressed = 0;
  return { shouldReport: true, count };
};

/**
 * Retires the hits that have aged out. Ascending, so the expired ones are a
 * prefix — and retirement ADVANCES A HEAD INDEX rather than splicing them off,
 * because splicing from the front shifts every remaining element and this runs
 * on every request: in steady state at the allowance that made each request pay
 * two O(bucket) passes, which at the schema's maximum shared allowance was
 * ~120k element moves per request on the path built for cheap shedding. The
 * dead prefix is compacted away only once it outgrows the live remainder, so
 * each entry is copied O(1) times amortised and the wasted memory is bounded by
 * the live entries themselves (the budget on `CLIENT_LOG_RATE_MAX_TRACKED_HITS`
 * notes the transient).
 */
const retireExpiredHits = (bucket: Bucket, windowStartMs: number): void => {
  const { hits, records } = bucket;
  let { start } = bucket;
  while (start < hits.length && hits[start]! <= windowStartMs) {
    bucket.recordSum -= records[start]!;
    start += 1;
  }
  if (start === bucket.start) return;

  bucket.retired += start - bucket.start;
  bucket.start = start;
  if (start * 2 >= hits.length) {
    bucket.hits = hits.slice(start);
    bucket.records = records.slice(start);
    bucket.start = 0;
    // Compaction renumbers every live entry, so the charged-entry bound has to
    // move with them — left stale it would sit PAST live charged entries and
    // hide them from the scan.
    bucket.charged = Math.max(0, bucket.charged - start);
  }
};

const prune = (windowStartMs: number, nowMs: number): void => {
  lastPruneAtMs = nowMs;
  for (const [key, bucket] of buckets) {
    retireExpiredHits(bucket, windowStartMs);
    if (liveHits(bucket) === 0) buckets.delete(key);
  }
};

/**
 * True when there is room to open a PER-CLIENT bucket not currently tracked.
 * Never consulted for the shared bucket — see `checkClientLogRateLimit`.
 */
const admit = (maxKeys: number, windowStartMs: number, nowMs: number): boolean => {
  if (perClientBucketCount() < maxKeys) return true;
  if (nowMs - lastPruneAtMs >= PRUNE_MIN_INTERVAL_MS) {
    prune(windowStartMs, nowMs);
    return perClientBucketCount() < maxKeys;
  }
  // Full, and a sweep ran too recently to be worth repeating. No admission —
  // and no eviction either. The caller is DEGRADED into the shared bucket by
  // `checkClientLogRateLimit`: refusing a slot costs bucketing precision and is
  // never a rejection by itself — though the shared window the newcomer lands
  // in is a real allowance, and can itself be exhausted.
  return false;
};

/** Builds a rejection, taking that channel's report slot and count with it. */
const reject = (
  reason: ClientLogRateLimitReason,
  retryAfterSeconds: number,
  limit: number,
  sharedBucket: boolean,
  degraded: boolean,
  nowMs: number,
  windowStartMs: number,
): ClientLogRateLimitDecision => {
  // Degraded rejections take channels of their own: they share the shared
  // bucket's window but not its diagnosis, and one flavour winning the slot
  // must not hide the other for a window — the same reasoning that split the
  // single global slot per (reason, bucket kind) in the first place.
  const slot = takeReportSlot(
    `${reason}:${sharedBucket ? 'shared' : 'client'}${degraded ? ':degraded' : ''}`,
    nowMs,
  );

  // `bucketCount` is the operator's discriminator between one caller hammering
  // the endpoint and broad traffic, and buckets are otherwise only swept when the
  // map saturates — so without this it was the count of every address seen since
  // boot, which is never "low" on an app that has been up a while. Sweeping here
  // makes the number exact at the one moment it is read, at a cost of at most a
  // handful of scans per window.
  if (slot.shouldReport) prune(windowStartMs, nowMs);

  return {
    allowed: false,
    retryAfterSeconds,
    shouldReport: slot.shouldReport,
    reason,
    limit,
    rejectedSinceLastReport: slot.count,
    bucketCount: perClientBucketCount(),
    sharedBucket,
    degraded,
  };
};

/** Seconds until `hit` retires, never below one — a `Retry-After: 0` invites an immediate retry. */
const secondsUntilRetired = (hitMs: number, nowMs: number): number =>
  Math.max(1, Math.ceil((hitMs + CLIENT_LOG_RATE_WINDOW_MS - nowMs) / 1000));

/** Retires `key`'s bucket against the window and returns it only if still live. */
const getLiveBucket = (key: string, windowStartMs: number): Bucket | undefined => {
  const bucket = buckets.get(key);
  if (bucket === undefined) return undefined;
  retireExpiredHits(bucket, windowStartMs);
  if (liveHits(bucket) === 0) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
};

const openBucket = (key: string): Bucket => {
  const bucket: Bucket = { hits: [], records: [], start: 0, recordSum: 0, retired: 0, charged: 0 };
  buckets.set(key, bucket);
  return bucket;
};

/** Appends one request entry and returns the ticket half that identifies it. */
const commitHit = (bucket: Bucket, nowMs: number): { bucket: Bucket; sequence: number } => {
  const sequence = bucket.retired + liveHits(bucket);
  bucket.hits.push(nowMs);
  bucket.records.push(0);
  return { bucket, sequence };
};

/**
 * Counts one request against `key` AND against the whole-app shared bucket, and
 * says whether it may proceed. This is the REQUEST half of the charge; the
 * record half is `chargeClientLogRecords`, which needs the parsed batch and so
 * cannot run until the body has been read.
 *
 * BOTH CEILINGS HAVE TO HOLD. The per-client window binds one address; the
 * shared window is the whole-app ceiling that binds every address together, and
 * a request is admitted only when it fits under both. Checked per-client first:
 * that rejection names the caller's own allowance, which is the cheaper lever
 * and the commoner case. A rejection on the shared window while per-client
 * buckets are on (`sharedBucket: true` with TRUST_PROXY set) is the GLOBAL
 * ceiling firing — distributed traffic, not one caller — and it is deliberately
 * loud through the same per-(reason, bucket kind) report budget: a silent
 * global cap is an observability outage, not a security win.
 *
 * A REJECTED REQUEST IS NOT COUNTED — in either bucket, matching the backend
 * throttler: a caller who keeps hammering does not push their own window
 * forward forever, so the oldest hits age out on schedule and they are
 * readmitted at the configured rate instead of being locked out for as long as
 * they keep trying. The two commits land together or not at all, so the shared
 * window is never charged for a request the per-client window refused.
 *
 * `nowMs` is a parameter so tests can drive the window without fake timers.
 */
export const checkClientLogRateLimit = (
  key: string,
  nowMs: number = Date.now(),
): ClientLogRateLimitDecision => {
  const config = readConfig(nowMs);
  const windowStartMs = nowMs - CLIENT_LOG_RATE_WINDOW_MS;
  // True when the shared bucket is this request's ONLY meter — an untrusted
  // topology, or a newcomer degraded below. With a trusted address it stays
  // false and the request is metered on both buckets.
  let sharedOnly = key === SHARED_BUCKET_KEY;
  let degraded = false;

  // THE KEY CEILING GOVERNS ADMISSION, NOT SERVICE. The shared bucket is exempt
  // outright: it is one fixed key, not a caller-influenced one, and
  // `CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE` is already held back for it outside
  // the derived ceiling — making it win a per-client slot once dropped every
  // unvouched-for caller app-wide for cardinality pressure that was never
  // theirs. A PER-CLIENT newcomer refused a slot is DEGRADED into that same
  // shared bucket rather than 429'd. Failing closed was the earlier design and
  // it defended the map against the wrong party: the only source that can fill
  // thousands of slots is one holding thousands of distinct networks (the /56
  // keying prices a single delegation out), and that source has no use for an
  // eviction escape hatch — it already owns a fresh allowance per network. The
  // party a refusal actually starved was every legitimate newcomer, for as long
  // as the spray kept the map pinned. Cardinality pressure now costs bucketing
  // PRECISION — newcomers share the whole-app allowance until slots free — which
  // is the posture an unset TRUST_PROXY runs in permanently. No live bucket is
  // ever evicted, the memory bound is unchanged, and the condition reports once
  // per window (`server.client_logs.store_saturated`) so a pinned map is never
  // silent. Decisions taken on this path carry `degraded: true`, so a rejection
  // the newcomer meets in the shared window is attributable to map pressure
  // rather than to an untrusted topology. (A spray large enough to saturate the
  // map now also has to FIT UNDER the shared request ceiling it is charged
  // against — at the defaults it does, so the degradation path stays real.)
  let clientBucket: Bucket | undefined;
  if (!sharedOnly) {
    clientBucket = getLiveBucket(key, windowStartMs);
    if (clientBucket === undefined && !admit(config.maxKeys, windowStartMs, nowMs)) {
      const slot = takeReportSlot('store_saturated', nowMs);
      if (slot.shouldReport) {
        report('server.client_logs.store_saturated', {
          bucketCount: perClientBucketCount(),
          maxKeys: config.maxKeys,
          degradedSinceLastReport: slot.count,
        });
      }
      sharedOnly = true;
      degraded = true;
    }
  }

  const sharedBucketLive = getLiveBucket(SHARED_BUCKET_KEY, windowStartMs);

  // Per-client ceiling first — its rejection names the allowance whose lever
  // is the caller's own.
  if (!sharedOnly && clientBucket !== undefined && liveHits(clientBucket) >= config.limit) {
    // The oldest live hit is the one whose expiry frees an allowance.
    return reject(
      'window_exhausted',
      secondsUntilRetired(clientBucket.hits[clientBucket.start]!, nowMs),
      config.limit,
      false,
      false,
      nowMs,
      windowStartMs,
    );
  }

  // Whole-app ceiling — held against every caller, per-client bucket or not.
  if (sharedBucketLive !== undefined && liveHits(sharedBucketLive) >= config.sharedLimit) {
    return reject(
      'window_exhausted',
      secondsUntilRetired(sharedBucketLive.hits[sharedBucketLive.start]!, nowMs),
      config.sharedLimit,
      true,
      degraded,
      nowMs,
      windowStartMs,
    );
  }

  // Admitted under both ceilings: commit both charges (or the one, when the
  // shared bucket is this caller's only meter).
  const shared = commitHit(sharedBucketLive ?? openBucket(SHARED_BUCKET_KEY), nowMs);
  const client = sharedOnly ? undefined : commitHit(clientBucket ?? openBucket(key), nowMs);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    shouldReport: false,
    // The allowance in force FOR THIS CALLER: the shared figure only when the
    // shared bucket is its sole meter.
    limit: sharedOnly ? config.sharedLimit : config.limit,
    rejectedSinceLastReport: 0,
    bucketCount: perClientBucketCount(),
    sharedBucket: sharedOnly,
    degraded,
    ticket: { client, shared, sharedBucket: sharedOnly, degraded },
  };
};

const allowedRecordDecision = (
  limit: number,
  sharedBucket: boolean,
  degraded: boolean,
): ClientLogRateLimitDecision => ({
  allowed: true,
  retryAfterSeconds: 0,
  shouldReport: false,
  limit,
  rejectedSinceLastReport: 0,
  bucketCount: perClientBucketCount(),
  sharedBucket,
  degraded,
});

/**
 * Writes `records` onto one ticket half's entry, returning the bucket for the
 * ceiling check — or `null` when the whole window has already moved on and
 * there is no accounting left to do.
 */
const applyRecordCharge = (
  entry: { bucket: Bucket; sequence: number },
  records: number,
  windowStartMs: number,
): Bucket | null => {
  const { bucket, sequence } = entry;

  // Slide the window before reading `recordSum`. The request charge retired the
  // bucket a moment ago, but a body read sits between the two, so without this
  // the ceiling would be checked against a sum that still counts records which
  // have since aged out — rejecting a batch on budget the caller had got back.
  retireExpiredHits(bucket, windowStartMs);

  const index = sequence - bucket.retired;
  let target: number;
  if (index >= 0 && index < liveHits(bucket)) {
    target = bucket.start + index;
  } else if (liveHits(bucket) > 0) {
    // The entry retired while the body was still arriving (a read that outlasted
    // the window). Charge the newest live hit instead: the cost was real and
    // dropping it would let a slow trickle of very slow requests write for free.
    target = bucket.records.length - 1;
  } else {
    // Nothing live to attach the cost to — the whole window has moved on. There
    // is no accounting left to do, and inventing an entry here would resurrect a
    // bucket the sweep has already retired.
    return null;
  }

  bucket.records[target]! += records;
  bucket.recordSum += records;
  // A charge can land BEHIND the bound: a body read sits between a request's
  // admission and its charge, so a slow request's entry is charged after a
  // later request's. Pulling the bound back is what keeps `charged` a bound
  // rather than a guess — without it the next rejection would skip the entry
  // that actually frees the budget and advertise a later one's expiry.
  if (records > 0 && target < bucket.charged) bucket.charged = target;
  return bucket;
};

/**
 * Budget frees as the oldest hit CARRYING RECORDS retires; the oldest hit
 * outright may have cost the sink nothing (an empty batch, or one refused
 * before it was parsed) and advertising its expiry would promise headroom that
 * does not arrive.
 *
 * RESUMED FROM `bucket.charged` AND LEFT THERE, so the zero-charge prefix is
 * walked once across a window rather than once per rejection. Rescanning it
 * each time was O(live hits) on the REJECTION path — the one path this module
 * is built to make cheap — and the prefix is the cheap half of an attack to
 * manufacture: a request charged on the request dimension but refused before
 * its record charge (an oversized or unparseable body) leaves a zero-charge
 * entry at the front of the shared bucket, so a flood of them made every later
 * record rejection walk them all, up to `sharedLimit²` element reads per window
 * at the ceiling. Never resumed before `start`: the dead prefix keeps its stale
 * charge values until compaction, so a scan reaching it would land on a retired
 * entry.
 */
const secondsUntilOldestChargedRetires = (bucket: Bucket, nowMs: number): number => {
  let scan = Math.max(bucket.start, bucket.charged);
  while (scan < bucket.records.length && bucket.records[scan]! === 0) scan += 1;
  // Everything live below `scan` is uncharged — record that, so the next
  // rejection resumes here instead of starting over.
  bucket.charged = scan;
  return secondsUntilRetired(
    bucket.hits[scan < bucket.records.length ? scan : bucket.start]!,
    nowMs,
  );
};

/**
 * Charges a parsed batch's record count against the same windows the request
 * was admitted into — the caller's own AND the whole-app shared one — and says
 * whether the batch may be written. Both must hold: the per-client ceiling
 * bounds one address, the shared ceiling bounds all of them together.
 *
 * THIS IS THE INGEST CEILING. The request allowance above bounds how often a
 * caller may post; this bounds how much they may post, which is the figure the
 * log sink is actually billed and sized in. Without it a caller packing every
 * batch to `MAX_RECORDS` bought roughly a hundred times the ingest of an honest
 * client for the same allowance.
 *
 * `records` is in RECORD-EQUIVALENT UNITS, not a bare array length. The route
 * charges `max(record count, batch bytes / per-record byte budget)`, because a
 * record's size is unbounded below the 64 KiB body cap: counting records alone
 * let one maximal record cost 1 of 12 000 while carrying ~100 records' worth of
 * bytes — the same hole this dimension exists to close, one level down. This
 * module never sees the body; it just meters the units it is handed.
 *
 * THE CHARGE STANDS EVEN WHEN THE BATCH IS REFUSED. Refunding an over-budget
 * batch would let a caller probe the remaining headroom for free and re-send
 * forever; paying for what you asked to write is what makes the ceiling hold.
 */
export const chargeClientLogRecords = (
  ticket: ClientLogRateTicket,
  records: number,
  nowMs: number = Date.now(),
): ClientLogRateLimitDecision => {
  const config = readConfig(nowMs);
  const { sharedBucket, degraded } = ticket;
  const windowStartMs = nowMs - CLIENT_LOG_RATE_WINDOW_MS;

  // BOTH HALVES ARE CHARGED, AND BOTH CHARGES STAND whatever is decided below —
  // the same no-refund rule that has always governed this dimension, now
  // applied to the pair. Refunding the shared half on a per-client rejection
  // (or vice versa) would let a caller probe one ceiling's headroom through the
  // other's rejection.
  const clientCharged =
    ticket.client === undefined ? null : applyRecordCharge(ticket.client, records, windowStartMs);
  const sharedCharged = applyRecordCharge(ticket.shared, records, windowStartMs);

  // Per-client ingest ceiling first — the rejection names the caller's own
  // allowance, mirroring the request half's ordering.
  if (clientCharged !== null && clientCharged.recordSum > config.recordLimit) {
    return reject(
      'record_budget_exhausted',
      secondsUntilOldestChargedRetires(clientCharged, nowMs),
      config.recordLimit,
      false,
      false,
      nowMs,
      windowStartMs,
    );
  }

  // Whole-app ingest ceiling — the figure the sink is actually protected by,
  // and the one a distributed caller meets. Loud through the shared-bucket
  // report channel: a silent global cap is an observability outage.
  if (sharedCharged !== null && sharedCharged.recordSum > config.sharedRecordLimit) {
    return reject(
      'record_budget_exhausted',
      secondsUntilOldestChargedRetires(sharedCharged, nowMs),
      config.sharedRecordLimit,
      true,
      degraded,
      nowMs,
      windowStartMs,
    );
  }

  return allowedRecordDecision(
    sharedBucket ? config.sharedRecordLimit : config.recordLimit,
    sharedBucket,
    degraded,
  );
};

/**
 * Drops all counting state and the memoised config. Test-only: module state
 * outlives a test file otherwise, so one suite's requests would spend another's
 * allowance.
 */
export const resetClientLogRateLimit = (): void => {
  buckets.clear();
  reportSlots.clear();
  cachedConfig = null;
  fallbackReported = false;
  fallbackHoldUntilMs = 0;
  lastPruneAtMs = 0;
};
