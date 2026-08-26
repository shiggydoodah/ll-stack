// Frontend log event catalog. Mirrors the backend's BACKEND_LOG_EVENTS naming
// convention (apps/backend/src/common/logging/log-events.ts) so logs from the
// browser, the Next server, and the backend share one vocabulary.
//
// Every name is exactly three dot-separated segments matching
// FRONTEND_LOG_EVENT_NAME_PATTERN.
export const FRONTEND_LOG_EVENTS = {
  // Server-side gateway / server-action lifecycle.
  'gateway.request.started': 'gateway.request.started',
  'gateway.call.dispatched': 'gateway.call.dispatched',
  'gateway.call.completed': 'gateway.call.completed',
  'gateway.request.failed': 'gateway.request.failed',
  'gateway.network_error': 'gateway.network_error',
  'gateway.response.successful': 'gateway.response.successful',
  'action.request.called': 'action.request.called',
  'action.request.details': 'action.request.details',
  'action.request.completed': 'action.request.completed',
  'action.request.failed': 'action.request.failed',
  'action.auth.missing': 'action.auth.missing',

  // Auth flow (server actions, logout route, layout guards). Reasons only —
  // never emails, tokens, or cookie values.
  'auth.login.session_missing': 'auth.login.session_missing',
  'auth.register.session_missing': 'auth.register.session_missing',
  'auth.logout.revocation_failed': 'auth.logout.revocation_failed',
  'auth.session.rotated': 'auth.session.rotated',
  'auth.session.rotation_failed': 'auth.session.rotation_failed',
  'session.validation.failed': 'session.validation.failed',
  'user.current.account_missing': 'user.current.account_missing',

  // Server-side error capture (instrumentation.ts onRequestError): an
  // unhandled server error — RSC render, route handler, or server action —
  // recorded with pre-stripping detail (name/message/digest, never a stack).
  // Its `digest` joins it to the client.error.boundary/client.error.expected
  // record for the same failure: the deliberate double record (server = full
  // detail, client = what the member saw). Do not deduplicate.
  'server.error.unhandled': 'server.error.unhandled',

  // The /api/client-logs ingest limit rejected a batch (lib/logging/
  // client-log-rate-limit.ts). Emitted at most once per window PER (reason,
  // bucket kind) on purpose: one record per rejected request would turn a flood
  // of dropped browser logs into a flood of written server logs, while a single
  // global slot let whichever rejection fired first hide the others for a whole
  // window. Because it fires rarely, it carries what is needed to act on it —
  // reason, the allowance in force, how many rejections it stands for, the live
  // bucket count, whether the whole-app bucket was the one that filled, and
  // whether the key ceiling degraded the caller into it.
  // Never the bucket key, which is a caller address.
  //
  // `reason` names which ceiling bound, and each has a different lever:
  // `window_exhausted` (too many requests — raise the request allowance) or
  // `record_budget_exhausted` (too many record-equivalents; the ingest ceiling
  // proper — raise the record allowance). `sharedBucket: true` is the WHOLE-APP
  // ceiling firing — every request spends the shared allowance alongside its
  // own bucket, so with TRUST_PROXY set this record means distributed traffic
  // met the global cap (the `..._SHARED_...` knobs are the lever), and with it
  // unset it means the only allowance there is ran out. A full key map is not a
  // rejection by itself and reports separately
  // (`server.client_logs.store_saturated`), but a caller it degraded into the
  // shared bucket can be refused on that window — that rejection carries
  // `degraded: true`, and its lever is LOWERING the per-client request
  // allowance, not raising the shared one.
  'server.client_logs.throttled': 'server.client_logs.throttled',

  // The per-client key map hit its derived ceiling and a newcomer was DEGRADED
  // into the shared whole-app bucket instead of being given its own. No live
  // bucket is evicted and no one is refused for the map's fullness alone — but
  // degraded newcomers spend the shared allowance, and a refusal they meet
  // there is a `server.client_logs.throttled` record with `degraded: true`.
  // At most once per window, carrying the
  // live bucket count, the ceiling, and how many callers were degraded since
  // the last report. The lever is LOWERING CLIENT_LOG_RATE_LIMIT_PER_MINUTE —
  // the ceiling grows as the allowance shrinks — or wiring a shared store.
  'server.client_logs.store_saturated': 'server.client_logs.store_saturated',

  // The ingest limit could not read the parsed env and fell back to its
  // documented default allowances with no proxy trust. Fires at most once per
  // process. A booted app should never emit this — instrumentation.ts parses the
  // env at boot — so it means the limit is running in a degraded mode where
  // TRUST_PROXY is discarded and every caller shares one bucket.
  'server.client_logs.config_unreadable': 'server.client_logs.config_unreadable',

  // POST /api/client-logs is switched OFF (CLIENT_LOG_INGEST_ENABLED, the
  // default) and answers 404. Emitted once at boot by instrumentation.ts,
  // naming the variable: the off-by-default posture is deliberate (it matches
  // OpenTelemetry shipping wired up and off), but an operator wondering where
  // their browser logs went must find the answer in the server log, not in a
  // support thread. NEXT_PUBLIC_LOG_REMOTE cannot re-open ingestion while this
  // is off — the server flag is authoritative.
  //
  // ITS LEVEL SPLITS BY STATE, and `browserRemoteEnabled` on the record says
  // which: `info` when the browser half is off too (both halves agree, the
  // shipped default, nothing to do), `warn` when NEXT_PUBLIC_LOG_REMOTE is
  // `true` and the bundle is posting batches into a 404. One level for both was
  // wrong either way — `info` alone lost the line under an ordinary
  // LOG_LEVEL=warn, and `warn` alone fired on every boot of every app that
  // never opted in, diluting the tier that carries server.trust_proxy.degraded.
  'server.client_logs.ingest_disabled': 'server.client_logs.ingest_disabled',

  // POST /api/client-logs refused a request BEFORE its rate limit — cross-site
  // fetch metadata, an Origin that does not name this host, or a non-JSON
  // content-type. Those refusals answer with a bare status and the browser
  // logger fires and forgets, so without this record the condition is invisible
  // on BOTH sides: nothing in the browser, nothing on the server.
  //
  // The reason an operator will actually meet is `origin_mismatch`. The Origin
  // check compares against the HOST HEADER THIS PROCESS RECEIVED unless
  // CLIENT_LOG_ALLOWED_ORIGIN names an origin instead, so a reverse proxy that
  // rewrites Host without preserving it (an nginx `proxy_pass` without
  // `proxy_set_header Host $host`) makes every real browser request fail the
  // match — 100% of browser telemetry dropped, permanently. Preserving Host is
  // the repair; that variable is the one for a proxy the operator cannot
  // change. Either way this record is what makes the state findable, and it is
  // the same trap `server.trust_proxy.chain_too_short` exists to close,
  // and it is closed the same way: at most once per window PER REASON, so each
  // condition gets its own line and its own count and a flood of refusals
  // cannot amplify into a flood of records.
  //
  // An `origin_mismatch` also carries WHICH COMPARAND was in force —
  // `originCheck: 'host' | 'allowed_origin'`, and the configured origin itself
  // in the second case. Without it the record is identical in both modes, which
  // leaves the operator unable to separate "my override is not being read" from
  // "my override is being read and is wrong" — and since CLIENT_LOG_ALLOWED_ORIGIN
  // is itself the repair for the first fault, a typo in it reproduces exactly
  // the fault it was reached for.
  //
  // Otherwise reasons and counts only. The configured origin is operator-set and
  // schema-normalised, so it is ours to record; the request's Origin and the Host
  // it would have been matched against are caller-written and never are.
  'server.client_logs.refused': 'server.client_logs.refused',

  // TRUST_PROXY held a form Express can evaluate but a Next route handler
  // cannot (`true`, `loopback`, a CIDR, or a hop count past
  // TRUSTED_PROXY_HOPS_MAX) — there is no socket address here to resolve them
  // against. Resolved to zero trusted hops, which is the safe reading, and
  // reported at boot so the degradation is never silent: an operator reading
  // `TRUST_PROXY=true` in their config would otherwise believe the
  // /api/client-logs limit was bucketing per client.
  'server.trust_proxy.degraded': 'server.trust_proxy.degraded',

  // X-Forwarded-For arrived with FEWER entries than TRUST_PROXY declares hops,
  // so the request did not traverse the topology we were told about and fell to
  // the shared bucket. A caller has no reason to produce this; an over-declared
  // TRUST_PROXY produces it on every request, silently turning per-client
  // bucketing off for the life of the deployment — which is the whole reason it
  // is reported rather than quietly absorbed. At most once per window, carrying
  // the declared depth, the observed chain length, and how many requests it
  // stands for. Never the chain itself, which is caller-supplied.
  'server.trust_proxy.chain_too_short': 'server.trust_proxy.chain_too_short',

  // The X-Forwarded-For entry TRUST_PROXY selected was long enough to exist but
  // was not an IP literal, so it could not be keyed on and the request fell to
  // the shared bucket. Proxies that write a hostname, the RFC 7239 `unknown`
  // token, or an obfuscated identifier produce this on every request — the same
  // permanent, silent collapse of per-client bucketing that
  // `server.trust_proxy.chain_too_short` reports for the other shape of the
  // same misconfiguration, and reported for the same reason: the operator reads
  // their own config as "per-client buckets are on" and nothing contradicts
  // them. At most once per window, on its own slot.
  //
  // Carries the declared depth and the offending entry's LENGTH — enough to
  // tell `unknown` (7) from a hostname from garbage. Never the entry itself,
  // which is caller-supplied.
  'server.trust_proxy.entry_not_an_address': 'server.trust_proxy.entry_not_an_address',

  // Client (browser) events.
  'client.session.start': 'client.session.start',
  'client.error.unhandled': 'client.error.unhandled',
  'client.error.rejection': 'client.error.rejection',
  'client.error.boundary': 'client.error.boundary',
  // The warn-level expected-classification twin of client.error.boundary: a
  // boundary caught a typed ExpectedError (lib/errors) — a deliberate rung-5
  // "page cannot render" throw, not a surprise. Payload is `code` + `scope`.
  'client.error.expected': 'client.error.expected',
} as const;

export type FrontendLogEvent = keyof typeof FRONTEND_LOG_EVENTS;

/** The `client.*` slice of the catalog — the events a browser actually emits. */
export type ClientLogEvent = Extract<FrontendLogEvent, `client.${string}`>;

/**
 * The ONLY events POST /api/client-logs will write. Catalog membership alone was
 * the earlier gate and it was far too wide: the catalog also holds the events
 * that only server code emits, so an anonymous caller could post
 * `server.trust_proxy.degraded`, `server.client_logs.throttled`,
 * `server.error.unhandled`, or any `gateway.*`/`action.*`/`auth.*` record —
 * fabricating, during an attack, the exact lines an operator reads to diagnose
 * one. `source: 'frontend-client'` marked them, but that is a convention to
 * remember while reading a dashboard, not a control; the route already treats
 * `level`, `timestamp`, `source`, and `ingestedAt` as too dangerous to accept
 * from a caller, and `event` is the field that decides what a record MEANS.
 *
 * Derived from the catalog rather than listed freehand: `ClientLogEvent` picks
 * up any new `client.*` name automatically, and this `Record` then refuses to
 * compile until it is enumerated here — the same "a new event MUST land here in
 * the same change" property {@link FRONTEND_LOG_EVENT_LEVELS} has.
 *
 * A browser event that is NOT `client.*`-named would need this set widened
 * deliberately. Nothing in the bundle emits one — `LoggingProvider.tsx` and
 * `ErrorScreen.tsx` (both in `components/`) are the only client emitters — and
 * the naming convention exists so the untrusted tier is identifiable by name
 * alone.
 */
export const CLIENT_INGESTIBLE_EVENTS: Record<ClientLogEvent, true> = {
  'client.session.start': true,
  'client.error.unhandled': true,
  'client.error.rejection': true,
  'client.error.boundary': true,
  'client.error.expected': true,
};

/**
 * The severity a record is WRITTEN at when it arrives through
 * POST /api/client-logs. Severity there is SERVER-OWNED: the route discards the
 * caller's `level` field and derives it from the event, because level is the
 * field alerting and paging key on and the ingest route is anonymous — trusting
 * a caller-chosen number meant anyone with `curl` could post `fatal` and page
 * the on-call. Its keys are {@link CLIENT_INGESTIBLE_EVENTS}, not the whole
 * catalog: the route refuses everything else, so a level for a server event
 * would be unreachable by construction — and severity for a server-emitted
 * record is chosen at the call site by which `serverLogger` method is used,
 * never looked up here. TypeScript keeps this total over the ingestible set: a
 * new `client.*` event MUST land here in the same change.
 *
 * Values are the pino-compatible numeric scale from `levels.ts` (10 trace …
 * 60 fatal). Each event carries the severity its legitimate emitter uses, with
 * one deliberate exception: `client.error.boundary` is 50 (error) even though
 * the global boundary emits it locally at fatal — 60 is the paging tier, and a
 * record any browser can write must never be able to carry it. The `scope`
 * field still distinguishes a global boundary for dashboards.
 */
export const FRONTEND_LOG_EVENT_LEVELS: Record<ClientLogEvent, number> = {
  'client.session.start': 30,
  'client.error.unhandled': 50,
  'client.error.rejection': 50,
  'client.error.boundary': 50,
  'client.error.expected': 40,
};

export const FRONTEND_LOG_EVENT_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+){2}$/;
