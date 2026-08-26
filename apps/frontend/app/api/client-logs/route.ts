import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeLogRecord } from '@repo/logging/shared';
import { writeServerLogRecord } from '@/lib/logging/log-emitter';
import { serverLogger } from '@/lib/logging/server-logger';
import {
  CLIENT_INGESTIBLE_EVENTS,
  FRONTEND_LOG_EVENTS,
  FRONTEND_LOG_EVENT_LEVELS,
  type ClientLogEvent,
} from '@/lib/logging/log-events';
import {
  chargeClientLogRecords,
  checkClientLogRateLimit,
  isClientLogIngestEnabled,
  reportClientLogRefusal,
  resolveClientLogAllowedOrigin,
  resolveClientLogRateLimitKey,
  type ClientLogRateLimitDecision,
} from '@/lib/logging/client-log-rate-limit';
import {
  CORRELATION_ID_HEADER,
  isValidCorrelationId,
  normalizeCorrelationId,
} from '@/lib/logging/correlation';

// Browser logs land here (same-origin — CSP connect-src 'self') and are
// re-emitted through the same @repo/logging sink as backend logs. Route handlers
// run on the Node.js runtime by default (required by the sinks, which use
// process.stdout / node:stream); the runtime segment config is intentionally
// omitted because it is incompatible with `cacheComponents`.
//
// Anonymous by design — a browser has no session before login and its errors are
// exactly the ones worth having. Every other limit here therefore has to hold
// against a hostile caller: a rate limit on the way in, then a body-size cap, a
// record cap, server-side re-redaction, and server-authoritative fields.
//
// The rate limit protects the LOG SINK, not this server's CPU. `proxy.ts`'s
// matcher covers this path, so a rejected request has already paid a full
// middleware pass — nonce generation, CSP construction, a `Set-Cookie` — before
// the handler runs. Shedding that too would need a limit in front of Next.
//
// It is charged in TWO PARTS, because the sink is priced in records and a
// request is worth up to `MAX_RECORDS` of them. The request charge runs first
// and needs nothing but headers, so a flood is refused without parsing
// anything; the record charge runs once the batch is parsed, and is what
// actually bounds ingest. Capping requests alone let a caller who packs every
// batch to 100 records buy ~100x the ingest of one who sends them singly.

const MAX_RECORDS = 100;
const MAX_BODY_BYTES = 64 * 1024;
/**
 * The per-record byte budget the two caps above already imply: a maximal legal
 * batch is `MAX_BODY_BYTES` spread over `MAX_RECORDS` records. It is the unit
 * the record charge below converts bytes into — see the charge site.
 */
const RECORD_BYTE_COST = Math.ceil(MAX_BODY_BYTES / MAX_RECORDS);
const SOURCE = 'frontend-client';

/**
 * The catalog check the browser already runs (`isEventName`, client-logger.ts)
 * — but the browser check binds nobody, and this one is what does. The
 * hasOwnProperty guard keeps prototype keys (`constructor`, `toString`) from
 * reading as registered events.
 *
 * Tested against CLIENT_INGESTIBLE_EVENTS, not the whole catalog. The catalog
 * also holds every event only SERVER code emits, and membership in it was the
 * earlier gate — which let an anonymous caller post
 * `server.trust_proxy.degraded`, `server.client_logs.throttled`,
 * `server.error.unhandled`, or any `gateway.*`/`action.*`/`auth.*` record, and
 * so fabricate, during an attack, the very lines an operator reads to diagnose
 * one. `source: 'frontend-client'` still marks them, but that is a convention
 * to remember while reading a dashboard, not a control.
 */
const isIngestibleEvent = (value: unknown): value is ClientLogEvent =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(CLIENT_INGESTIBLE_EVENTS, value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------------------
// Per-record SHAPE bounds. The batch is already capped (64 KiB, 100 records)
// but nothing below that bounded a single record's shape, and the sink is
// where shape hurts: one 60 KiB string is most of a batch in a single value,
// and pathological nesting costs every downstream consumer. These are FLAT,
// GENERIC caps on purpose — per-event schemas were considered and rejected as
// a permanent maintenance tax on every adopter who adds an event. Generous
// enough that no legitimate record (client.error.* with a minified browser
// stack included) comes near them; anything past them leaves a MARK rather than
// vanishing, so a hostile shape costs fidelity, not the whole record. A string
// truncates in place (STRING_TRUNCATION_SUFFIX) and an over-deep subtree is
// replaced whole (TRUNCATED_MARKER), so both still say what they were. The
// field and array caps can only REMOVE, so what they removed is COUNTED and
// reported on the record itself (see `CapLosses`) — without those counts a
// client.error.* record whose `digest` sat past the field cap read exactly like
// a browser that never sent one, and a 100-entry array read exactly like a
// 32-entry one, on the records this route exists to carry.
//
// A FIELD CAP DOES NOT BOUND INDEX CARDINALITY — which is why the record is
// also RESHAPED, not just capped. An index degrades on the AGGREGATE number of
// distinct property names it has ever seen, and every caller-chosen key
// reaches the sink verbatim as one (clef-payload.ts copies every non-reserved
// key through as a top-level property; otlp-payload.ts maps each to an
// attribute). A per-record cap of 32 narrows that per record and bounds the
// total not at all: at the shipped defaults one caller inside every allowance
// sends 100 records x 32 attacker-named fields per request and can spend
// CLIENT_LOG_RECORD_LIMIT_PER_MINUTE on ~384 000 distinct property names a
// minute — ~7.68M app-wide against the shared ceiling. The record allowance is
// sized for VOLUME; nothing in it was ever sized for schema width. Nesting
// every caller-supplied field under one fixed key is what actually bounds it:
// the sink sees a fixed top-level set whatever arrives, and the caps below
// then apply inside `context` unchanged.
// ---------------------------------------------------------------------------

const MAX_RECORD_FIELDS = 32;
const MAX_STRING_LENGTH = 4_096;
const MAX_NESTING_DEPTH = 4;
const MAX_ARRAY_LENGTH = 32;
const TRUNCATED_MARKER = '[Truncated]';
const STRING_TRUNCATION_SUFFIX = '…[truncated]';

/**
 * What the two REMOVING caps took from one record, accumulated as it is bounded
 * and written onto the record as `fieldsDropped` / `arrayEntriesDropped`. The
 * caps that only RESHAPE say so in place — a truncated string wears
 * STRING_TRUNCATION_SUFFIX, an over-deep subtree becomes TRUNCATED_MARKER — so
 * only removal needs counting.
 *
 * REPORTED AT THE TOP LEVEL OF THE RECORD, WHICH IS THE WHOLE POINT. The counts
 * were originally written in place — a `[fieldsDropped]` key on the object they
 * were taken from, a trailing `[+n truncated]` element in the array — and that
 * reads well but does not survive the sink. Under `LOG_SINK=http_otlp` a
 * non-scalar attribute is JSON-stringified and cut at 4 KiB
 * (otlp-payload.ts `sanitizeStringValue`), so the whole of `context` arrives as
 * ONE string and an in-place mark sits at the tail of it: on exactly the wide
 * records these counts exist to describe — a 33-field context of real strings, a
 * 100-entry array of anything non-trivial — the cut lands long before the tail,
 * and the mark is the first thing lost. The Seq/CLEF path kept them
 * (clef-payload.ts leaves `context` structured), so the marks worked on one sink
 * and silently did nothing on the other. As scalar fields of their own they
 * survive both, because no sink truncates a number.
 *
 * SERVER-OWNED, like `source` and the timestamps on the write below: a field an
 * operator reads as the route's own account of what it did must not be one an
 * anonymous caller can write. Nothing is reserved to achieve that here — the
 * reshape nests every caller-supplied field under CONTEXT_FIELD, so a caller
 * cannot reach the top level at all, and these are written after the spread
 * besides.
 *
 * Two fixed property names, added only to records that actually lost something —
 * cardinality is names (see the header above), and this adds two to the app's
 * total however hostile the traffic gets.
 */
interface CapLosses {
  /** Object fields dropped by MAX_RECORD_FIELDS, at any depth. */
  fields: number;
  /** Array entries dropped by MAX_ARRAY_LENGTH, at any depth. */
  arrayEntries: number;
}

/**
 * The record envelope the client logger writes (client-logger.ts buildRecord)
 * — the only caller-supplied keys that stay at the TOP LEVEL of the written
 * record. Kept even past the field cap, whatever position they arrive in: a
 * filler flood must not be able to push `message` or the correlation ids off a
 * record. "Known" here is the envelope, deliberately not a per-event payload
 * list.
 */
const ENVELOPE_FIELDS = new Set([
  'message',
  'event',
  'level',
  'timestamp',
  'source',
  'sessionId',
  'correlationId',
  'requestId',
]);

/**
 * The single key everything that is NOT envelope is nested under, so the set of
 * top-level property names this route can ever put in front of the sink is
 * fixed: the envelope, the server-owned fields, and this one. A caller's own
 * `context` key is not special — it nests inside this one like any other field.
 *
 * The cost is real and deliberate: a browser field is queried as
 * `context.digest`, not `digest`. That is the price of the flat shape not being
 * an unbounded property-name generator pointed at a shared index.
 */
const CONTEXT_FIELD = 'context';

/**
 * Dropped outright rather than nested, because the sink does not treat them as
 * ordinary context: clef-payload.ts lifts `traceId`/`spanId` into CLEF's
 * first-class trace built-ins (`@tr`/`@sp`) and excludes them from the plain
 * property copy, so a caller-supplied value is used ONLY as trace identity.
 * Two failures in one field. A caller could attach a fabricated record to a
 * real distributed trace — the same "fabricate the lines an operator reads
 * during an incident" attack CLIENT_INGESTIBLE_EVENTS exists to close, one
 * field over. And a `traceId` that is not 32-char hex is forwarded verbatim as
 * `@tr`, which Seq rejects with a 400; the sink classifies a non-429 4xx as
 * non-retryable and drops THE WHOLE BATCH to stdout fallback, so one poisoned
 * client record can evict up to 99 unrelated frontend-server records from the
 * dashboard — sustainably, at the default record allowance.
 *
 * Nothing legitimate is lost: a browser record has no server trace context of
 * its own (client-logger.ts buildRecord emits neither), so any value arriving
 * here is by definition not ours. The join key that IS meaningful for a browser
 * record — `correlationId` — is validated and re-asserted on the write below.
 */
const DROPPED_FIELDS = new Set(['traceId', 'spanId']);

/**
 * Stores one bounded field on the accumulator.
 *
 * Plain `bounded[key] = value` is an assignment, and an assignment to the
 * literal key `__proto__` sets the accumulator's PROTOTYPE instead of creating
 * a field — after which the value is invisible to every own-enumerable read
 * that follows (spread, `Object.entries`, `JSON.stringify`). `JSON.parse` does
 * hand `__proto__` back as an ordinary own property, and the sanitizer this
 * runs on top of preserves it the same way (log-redaction.ts
 * `keepSanitizedField`), so the key really does reach this loop intact and
 * this is where it would otherwise disappear. `defineProperty` always creates
 * an own field, so it stays ordinary data under its own name.
 */
const keepBoundedField = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

const boundValue = (value: unknown, depth: number, losses: CapLosses): unknown => {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}${STRING_TRUNCATION_SUFFIX}`
      : value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_NESTING_DEPTH) return TRUNCATED_MARKER;
    // Only the kept entries recurse — the tail is counted, never walked.
    if (value.length > MAX_ARRAY_LENGTH) losses.arrayEntries += value.length - MAX_ARRAY_LENGTH;
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => boundValue(entry, depth + 1, losses));
  }
  if (isPlainObject(value)) {
    if (depth >= MAX_NESTING_DEPTH) return TRUNCATED_MARKER;
    const bounded: Record<string, unknown> = {};
    let kept = 0;
    for (const [key, entry] of Object.entries(value)) {
      if (kept >= MAX_RECORD_FIELDS) {
        // Counting the tail rather than `break`ing costs one pass over an array
        // `Object.entries` has already materialised, and recurses into none of
        // it — the body cap is what bounds how long that tail can be.
        losses.fields += 1;
        continue;
      }
      keepBoundedField(bounded, key, boundValue(entry, depth + 1, losses));
      kept += 1;
    }
    return bounded;
  }
  return value;
};

/**
 * Bounds one record's shape AND fixes its top-level key set: the envelope stays
 * where it is, `DROPPED_FIELDS` go nowhere, and every other caller-supplied
 * field is nested under `CONTEXT_FIELD` up to the cap in arrival order.
 *
 * Returns the `CapLosses` alongside it rather than marking them in place, so
 * the counts can be written where no sink's truncation reaches them — see
 * `CapLosses`. What `DROPPED_FIELDS` removes is deliberately NOT counted there:
 * that is a fixed policy on two named fields, not a cap a record can run into.
 *
 * Runs AFTER redaction, so truncation can never cut a value in a way that hides
 * it from the sanitizer. Nesting deliberately costs no depth budget — context
 * members are bounded from depth 1 exactly as they were when they sat at the
 * top level, so the caps mean the same thing before and after the reshape.
 */
const boundClientLogRecord = (
  record: Record<string, unknown>,
): { bounded: Record<string, unknown>; losses: CapLosses } => {
  const losses: CapLosses = { fields: 0, arrayEntries: 0 };
  const bounded: Record<string, unknown> = {};
  const context: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(record)) {
    if (DROPPED_FIELDS.has(key)) continue;
    if (ENVELOPE_FIELDS.has(key)) {
      keepBoundedField(bounded, key, boundValue(value, 1, losses));
      continue;
    }
    if (kept >= MAX_RECORD_FIELDS) {
      losses.fields += 1;
      continue;
    }
    keepBoundedField(context, key, boundValue(value, 1, losses));
    kept += 1;
  }
  // Omitted rather than written empty: most records carry no free-form context,
  // and an always-present `{}` is noise on every one of them.
  if (kept > 0) bounded[CONTEXT_FIELD] = context;
  return { bounded, losses };
};

/**
 * How far the caller's clock may disagree with ours and still be worth
 * keeping. The browser logger flushes within 5s (20-record threshold or the
 * interval) and pagehide beacons land immediately, so a legitimate record is
 * seconds old plus real clock error — 15 minutes covers a badly-drifted client
 * without letting a caller back- or post-date records into someone else's
 * incident timeline.
 */
const MAX_CLIENT_CLOCK_SKEW_MS = 15 * 60 * 1_000;

/**
 * The caller's `timestamp` claim, re-serialised from the parsed value (derived
 * bytes, never caller-shaped text) — or undefined when it is unparseable or
 * outside the skew bound. Absent is honest; a clamped lie would still be a lie
 * with our name on it.
 */
const boundedClientTimestamp = (value: unknown, nowMs: number): string | undefined => {
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (Math.abs(parsed - nowMs) > MAX_CLIENT_CLOCK_SKEW_MS) return undefined;
  return new Date(parsed).toISOString();
};

/**
 * True when the Origin header names an origin this app answers on.
 *
 * WHAT IT IS COMPARED AGAINST is the operator's choice. By default — and by
 * default it is unset — the comparison is against the Host header: this app's
 * env deliberately carries no self-URL, and behind the proxy chain TRUST_PROXY
 * declares, Host is what the browser addressed. That is exact only while every
 * proxy preserves Host, so a deployment whose proxy rewrites it sets
 * CLIENT_LOG_ALLOWED_ORIGIN instead, and the configured value REPLACES the Host
 * comparison rather than widening it — a request naming the rewritten upstream
 * host is then refused too, which is right: a browser never sends that Origin.
 *
 * Either way the decision rests only on headers a BROWSER writes.
 * `X-Forwarded-Host` would be the obvious third option and is deliberately not
 * consulted: it is caller-written, so honouring it would delete this check
 * rather than repair it. An unparseable Origin (including the literal 'null'
 * from sandboxed frames) fails the match in both modes.
 */
const isAllowedOrigin = (origin: string, host: string | null): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const allowedOrigin = resolveClientLogAllowedOrigin();
  // Origin against ORIGIN when configured — scheme and port included, where a
  // Host comparison can only see host and port. Both sides are already
  // normalised (the browser writes one; config/env.schema.ts parses the other
  // through `URL.origin`), so this is an exact match, never a prefix one.
  if (allowedOrigin !== undefined) return parsed.origin === allowedOrigin;
  if (host === null) return false;
  return parsed.host === host.toLowerCase();
};

/**
 * Turns a rejected charge into the 429, reporting it when the limiter says this
 * one holds the report budget.
 *
 * Reasons and figures only — the bucket key is a caller address. The report
 * fires at most once per window PER (reason, bucket kind, degraded), so each
 * situation an operator has to tell apart gets its own line and its own count:
 * one caller hammering the endpoint (`sharedBucket: false`, low `bucketCount`),
 * every real user dropped by a whole-app ceiling (`sharedBucket: true`), a
 * caller packing batches past the ingest ceiling (`record_budget_exhausted`),
 * and a newcomer refused on the shared window a full key map degraded it into
 * (`degraded: true` — the lever there is the per-client allowance, not the
 * shared one). A full key map is not a rejection by itself — newcomers degrade
 * into the shared bucket and the limiter reports the saturation, once per
 * window, as `server.client_logs.store_saturated`. A single global slot was the earlier
 * design and it defeated the purpose —
 * whichever fired first hid the rest for a whole window while the count silently
 * summed all of them together.
 */
const throttled = (decision: ClientLogRateLimitDecision): NextResponse => {
  if (decision.shouldReport) {
    try {
      // Guarded for the same reason the limiter guards its own degraded-config
      // report: the sink is exactly what a throttle record is about, so it is
      // the thing most likely to be failing when one is written. Unguarded, a
      // sink error turned this 429 into a 500 from the log-ingest route. The
      // count is lost either way — the limiter takes the report slot before
      // returning — but a rejection that cannot be logged must still be a
      // rejection.
      serverLogger.warn(FRONTEND_LOG_EVENTS['server.client_logs.throttled'], {
        reason: decision.reason,
        // Requests per minute for `window_exhausted`, record-equivalents per
        // minute for `record_budget_exhausted` — `reason` says which dimension
        // ran out, and the limiter sends the allowance that bound.
        limitPerMinute: decision.limit,
        rejectedSinceLastReport: decision.rejectedSinceLastReport,
        bucketCount: decision.bucketCount,
        sharedBucket: decision.sharedBucket,
        // True when the key ceiling pushed this caller into the shared bucket:
        // the lever is the per-client allowance, not the shared one.
        degraded: decision.degraded,
      });
    } catch {
      // Nothing left to report through. The 429 below still stands.
    }
  }

  return new NextResponse(null, {
    status: 429,
    headers: { 'Retry-After': String(decision.retryAfterSeconds) },
  });
};

/**
 * Reads the body while enforcing `MAX_BODY_BYTES` ON THE WAY IN, returning
 * `null` the moment the cap is crossed. `request.text()` was the earlier design
 * and it buffered the ENTIRE body before any size check could run: the up-front
 * content-length guard only sees a length the caller chose to declare, so a
 * chunked request with no content-length could stream gigabytes — up to V8's
 * maximum string length — into this process's memory in a single request, on
 * the one anonymous route the app exposes, with no rate limit in a position to
 * bound it. Counting the bytes as they arrive caps the damage at the limit plus
 * one chunk. The byte count is returned alongside the text because the record
 * charge below is priced in bytes as well as records.
 */
const readBodyCapped = async (
  request: NextRequest,
): Promise<{ raw: string; bytes: number } | null> => {
  if (request.body === null) return { raw: '', bytes: 0 };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { raw: Buffer.concat(chunks).toString('utf8'), bytes };
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  // Kill switch FIRST — before the rate limit, before reading anything. Ingest
  // is OFF by default (CLIENT_LOG_INGEST_ENABLED), matching the house posture
  // for optional infrastructure: OpenTelemetry is already wired up and off by
  // default, and an anonymous internet-writable endpoint must be a choice, not
  // a surprise. The answer is 404, not 403: a disabled route does not confirm
  // it exists to whoever is probing it. Instrumentation.ts names the variable
  // at boot so the silence is diagnosable server-side; the browser logger
  // fires and forgets, so the 404 never surfaces to a member. The public flag
  // (NEXT_PUBLIC_LOG_REMOTE) cannot override this — it only decides whether
  // our own bundle posts.
  if (!isClientLogIngestEnabled()) return new NextResponse(null, { status: 404 });

  // Cross-site and non-JSON refusals come BEFORE the rate limit: three header
  // reads are cheaper than the limiter's map work, so an obviously-foreign
  // request never spends it. Be honest about what this buys: it stops other
  // WEBSITES weaponising real visitors' browsers against this endpoint —
  // Sec-Fetch-Site and Origin are browser-controlled, an attacker's page
  // cannot forge them from inside one — and it stops nothing that speaks HTTP
  // directly; curl sends whatever headers it likes. This raises the floor; the
  // rate limit and the caps behind it are the enforcement. Headers that are
  // ABSENT pass (older browsers, non-browser callers) — the checks are strict
  // only about what is present.
  //
  // EVERY REFUSAL HERE IS REPORTED, once per window per reason. These three
  // answer with a bare status and the browser logger fires and forgets, so
  // silence would make them invisible on both sides at once — and the one an
  // operator will actually meet is not an attack at all: `isAllowedOrigin`
  // compares against the HOST HEADER THIS PROCESS RECEIVED unless
  // CLIENT_LOG_ALLOWED_ORIGIN names something else, so a proxy that rewrites
  // Host rather than preserving it fails every real browser request. That is
  // 100% of browser telemetry gone, permanently — this report is what makes it
  // findable, and that variable is what repairs it where the proxy is not the
  // operator's to change. See `reportClientLogRefusal` for why the budget lives
  // in the limiter, and SECURITY.md's deploy checklist for both.
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite !== null && secFetchSite !== 'same-origin') {
    reportClientLogRefusal('cross_site');
    return new NextResponse(null, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin !== null && !isAllowedOrigin(origin, request.headers.get('host'))) {
    reportClientLogRefusal('origin_mismatch');
    return new NextResponse(null, { status: 403 });
  }
  // The client always posts JSON (the beacon Blob and the fetch fallback both
  // declare it), so anything else is not our traffic — refuse it before paying
  // to read a body the parser below would reject anyway.
  const contentType = request.headers.get('content-type');
  if (contentType === null || !contentType.toLowerCase().startsWith('application/json')) {
    reportClientLogRefusal('content_type');
    return new NextResponse(null, { status: 415 });
  }

  // Rate limit next: this route is anonymous and unauthenticated, so the
  // cheapest possible rejection is the point — an over-limit caller must not get
  // us to read, parse, sanitise, or write anything. See
  // lib/logging/client-log-rate-limit.ts for the bucketing and why
  // TRUST_PROXY decides whether buckets are per-client or app-wide.
  const rateLimit = checkClientLogRateLimit(resolveClientLogRateLimitKey(request.headers));
  if (!rateLimit.allowed) return throttled(rateLimit);

  // Reject an oversized declared length without reading anything. This is an
  // optimisation, not the guard: content-length is caller-supplied and a
  // chunked request need not send one, so the enforcement lives in
  // `readBodyCapped`, which counts the bytes as they arrive.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const headerCorrelationId = normalizeCorrelationId(request.headers.get(CORRELATION_ID_HEADER));

  let payload: unknown;
  let bodyBytes = 0;
  try {
    const body = await readBodyCapped(request);
    if (body === null) return new NextResponse(null, { status: 413 });
    bodyBytes = body.bytes;
    payload = JSON.parse(body.raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const records =
    isPlainObject(payload) && Array.isArray(payload.records) ? payload.records : undefined;
  if (!records) {
    return new NextResponse(null, { status: 400 });
  }

  // The batch's real cost, now that it is known — in RECORD-EQUIVALENTS, not
  // records alone. Counting records by themselves reopened the hole the record
  // dimension exists to close, one level down: nothing bounds a single record's
  // size below the body cap, so one maximal ~64 KiB record cost 1 of 12 000
  // while carrying ~100 records' worth of bytes — and the sink is billed in
  // bytes. A batch therefore charges whichever is larger: its accepted record
  // count (`MAX_RECORDS` is the cap the loop below enforces, so records past it
  // are never written and never charged), or its byte size in units of the
  // per-record budget the caps already imply. A maximally packed request
  // charges `MAX_RECORDS` either way, so honestly-sized traffic prices exactly
  // as before. The charge stands even when it is refused: refunding an
  // over-budget batch would let a caller probe the remaining headroom and
  // re-send for free.
  const accepted = records.slice(0, MAX_RECORDS);
  if (rateLimit.ticket !== undefined) {
    const chargedUnits = Math.max(accepted.length, Math.ceil(bodyBytes / RECORD_BYTE_COST));
    const ingest = chargeClientLogRecords(rateLimit.ticket, chargedUnits);
    if (!ingest.allowed) return throttled(ingest);
  }

  // ONE ingest instant for the whole batch. Every record in a batch arrived in
  // the same request, so stamping them with 100 slightly different instants
  // claimed a precision the route does not have — and it re-parsed a string it
  // had just formatted from a `Date`, once per record, on the write path.
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  for (const candidate of accepted) {
    if (!isPlainObject(candidate)) continue;

    // THE EVENT CATALOG IS ENFORCED HERE, not just in the browser. A record
    // whose `event` is not a key of CLIENT_INGESTIBLE_EVENTS is skipped —
    // including a record with no event at all: there is deliberately no "write
    // it at info" fallback, because every legitimate browser record carries a
    // registered client event (the frontend rulebook requires it and the client
    // logger enforces it), so an event-less — or server-named — record on this
    // anonymous route is by definition not ours. Skipped records were still
    // charged above — skipping is not a refund.
    if (!isIngestibleEvent(candidate.event)) continue;
    const event = candidate.event;

    // Re-run redaction server-side — never trust client-side sanitisation.
    const sanitized = sanitizeLogRecord(candidate);

    // A valid per-record correlationId links back to the browser session; fall
    // back to the request header (set by proxy.ts) otherwise.
    const correlationId = isValidCorrelationId(sanitized.correlationId as string | undefined)
      ? (sanitized.correlationId as string)
      : headerCorrelationId;

    // `sessionId` gets the SAME shape check as the correlation ids, which it was
    // the one envelope field to escape: it is neither server-owned nor derived,
    // and it was previously accepted verbatim up to MAX_STRING_LENGTH with
    // arbitrary content, under a name dashboards group and join by. An id that
    // is not id-shaped is not a join key, so it is omitted rather than kept —
    // there is no header fallback here because a session id is the browser's to
    // mint (proxy.ts sets the cookie; the browser echoes it into the record).
    const sessionId = isValidCorrelationId(sanitized.sessionId as string | undefined)
      ? (sanitized.sessionId as string)
      : undefined;

    const { bounded, losses } = boundClientLogRecord(sanitized);

    writeServerLogRecord({
      ...bounded,
      // `event` is RE-ASSERTED from the catalog key the gate above accepted,
      // not taken from the spread. The spread's copy has been through
      // `sanitizeLogRecord`, which replaces any three-segment dot-joined value
      // whose segments are each 8+ characters with `[REDACTED]` — and an event
      // name is three dot-separated segments by construction
      // (FRONTEND_LOG_EVENT_NAME_PATTERN). No name in today's catalog is long
      // enough to trip it, but the first one that is would have written a
      // record whose `level` was derived from an event the record itself no
      // longer names: an unqueryable error line, and a silent one. Same const
      // `level` is derived from, so the two can never disagree.
      event,
      // Severity is SERVER-OWNED, derived from the event via the catalog's
      // level map — the record's own `level` is discarded. Level is the field
      // alerting and paging key on, and this route is anonymous: clamping the
      // caller's number (the earlier design) still let anyone post `fatal` and
      // page the on-call. The map tops out at 50 for client events on purpose;
      // see FRONTEND_LOG_EVENT_LEVELS.
      level: FRONTEND_LOG_EVENT_LEVELS[event],
      // The clock split: `timestamp` — the field sinks index and order by — is
      // OURS, set to the ingest instant; the caller's claim survives only as
      // `clientTimestamp`, and only inside the skew bound (undefined otherwise,
      // which also flattens any `clientTimestamp` the caller wrote itself).
      // `ingestedAt` stays the authoritative arrival time, same instant.
      timestamp: now,
      clientTimestamp: boundedClientTimestamp(sanitized.timestamp, nowMs),
      // Server-authoritative fields override anything the client supplied.
      source: SOURCE,
      ingestedAt: now,
      // Undefined when the caller's value was not id-shaped, which drops the
      // key on serialisation rather than writing junk under a join name.
      sessionId,
      correlationId,
      requestId: correlationId,
      // What the shape caps took, on the record rather than in the tail of a
      // `context` the OTLP sink serialises as one truncatable string — see
      // `CapLosses`. Undefined (and so dropped on serialisation, like the ids
      // above) on the ordinary record that lost nothing, which is all of them.
      fieldsDropped: losses.fields > 0 ? losses.fields : undefined,
      arrayEntriesDropped: losses.arrayEntries > 0 ? losses.arrayEntries : undefined,
    });
  }

  return new NextResponse(null, { status: 204 });
};
