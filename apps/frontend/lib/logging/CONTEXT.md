# Context: apps/frontend/lib/logging

## Purpose

- Structured logging for both frontend runtimes (Next server and browser), and
  the correlation ids that join a browser event → a Next request → a backend log
  line.

## Architecture

| File                       | Role                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `log-events.ts`            | `FRONTEND_LOG_EVENTS` — the closed catalog — plus `FRONTEND_LOG_EVENT_LEVELS`, the per-event severity the ingest route writes at, and `CLIENT_INGESTIBLE_EVENTS`, the `client.*` subset that route will accept. Three dot-separated segments, enforced by `FRONTEND_LOG_EVENT_NAME_PATTERN`. Mirrors the backend catalog.                                                      |
| `server-logger.ts`         | `serverLogger.{trace…fatal}` for the Next server. `'server-only'`.                                                                                                                                                                                                                                                                                                             |
| `client-logger.ts`         | `clientLogger` + `installClientLoggerLifecycle()` for the browser. Batches to `/api/client-logs` when `NEXT_PUBLIC_LOG_REMOTE` is on. In dev the console takes everything above the threshold either way; outside dev it takes `warn` and above only while remote is off, only in the browser, and never the two events the browser prints itself (`BROWSER_REPORTED_EVENTS`). |
| `log-emitter.ts`           | `writeServerLogRecord` — the shared sink write.                                                                                                                                                                                                                                                                                                                                |
| `correlation.ts`           | Header/cookie names, id shape, `generateCorrelationId`, `isValidCorrelationId`, `normalizeCorrelationId`.                                                                                                                                                                                                                                                                      |
| `request-context.ts`       | `AsyncLocalStorage` holding `{ correlationId, sessionId }`.                                                                                                                                                                                                                                                                                                                    |
| `levels.ts`                | Numeric level map and threshold check.                                                                                                                                                                                                                                                                                                                                         |
| `request-error.ts`         | Formats what `instrumentation.ts`'s `onRequestError` records.                                                                                                                                                                                                                                                                                                                  |
| `user-env.ts`              | Non-identifying browser environment captured once per session.                                                                                                                                                                                                                                                                                                                 |
| `client-log-rate-limit.ts` | The ingest limit for `POST /api/client-logs`: sliding window over requests AND records, per-client AND whole-app buckets both charged per request, bounded key map, `TRUST_PROXY`-derived bucket key, and the memoised read behind `isClientLogIngestEnabled` (the route's kill switch). `'server-only'`.                                                                      |

## Key Flows

- **Ids:** `proxy.ts` mints/normalises `x-correlation-id` per request and keeps a
  stable `llstack_sid` visitor cookie (rotated on login, cleared on logout). Both
  are forwarded into the request headers; server boundaries load them into
  `AsyncLocalStorage`; the gateway forwards them to the backend as
  `x-request-id`/`x-session-id`, which the backend validates against the same
  shape and stamps on its own lines.
- **Server records** carry `level`, `timestamp`, `message`/`event`, `source:
'frontend-server'`, and the correlation fields — written **last** so caller
  context cannot overwrite them.
- **Browser records** batch to `POST /api/client-logs` — which is OFF by
  default: `CLIENT_LOG_INGEST_ENABLED` gates the route (404 before anything
  else runs; `instrumentation.ts` names the variable at boot as
  `server.client_logs.ingest_disabled`, at `info` when the browser half is off
  too and at `warn` when `NEXT_PUBLIC_LOG_REMOTE=true` is posting into that 404
  — the off-by-default design rests on the line being findable, and one level
  for both states lost either the `LOG_LEVEL=warn` deployment or the warn tier
  itself), and `NEXT_PUBLIC_LOG_REMOTE` gates the browser's own posting. The
  server flag is authoritative. **Remote off does not mean discarded** — the
  client logger writes `warn` and above to the BROWSER console whenever it has no
  remote sink, in every environment, so the default build still surfaces
  `client.error.boundary` / `client.error.expected` (React swallows the throw a
  boundary catches; nothing else reports them). The floor is the fallback's own,
  not the threshold's: the production default `NEXT_PUBLIC_LOG_LEVEL` is `info`,
  so without it a default build printed `client.session.start` into every
  visitor's console on every page load. A floor bounds severity and nothing
  else, so `client.error.unhandled` / `client.error.rejection` — which the
  browser prints itself, and which sit at `error` above any usable floor — are
  excluded from the fallback by name (`BROWSER_REPORTED_EVENTS`); remote posting
  still carries them. The fallback is also guarded on `window`: a client
  component renders on the server too, and `console.error(message, record)` under
  Node is a `util.inspect` blob in a stdout stream that is read one JSON line at a
  time. Dev is deliberately not guarded — that terminal is a person's screen. Both `NEXT_PUBLIC_*` variables are inlined at BUILD time,
  into the server compilation as well as the client one — a runtime-only change
  leaves the bundle as built, and the boot notice reports the value the app was
  BUILT with, over-reporting only where the variable was absent at build and set
  at runtime alone. Once enabled,
  the route refuses cross-site and non-JSON posts on their headers (before the
  rate limit — a floor against other sites weaponising visitors' browsers, not a
  lock against curl; each refusal reported once per window per reason as
  `server.client_logs.refused`, because a proxy that rewrites `Host` fails the
  Origin check on every real request and silence made that invisible —
  `CLIENT_LOG_ALLOWED_ORIGIN` is the escape hatch when that proxy cannot be
  fixed, and it replaces the `Host` comparison rather than widening it),
  rate-limits the caller, skips any record whose `event` is not a
  `CLIENT_INGESTIBLE_EVENTS` key (event-less and server-named alike — charged,
  never written; catalog membership alone let a caller forge `server.*` and
  `gateway.*` records), re-runs `sanitizeLogRecord` server-side, bounds each
  record's shape (32 fields, 4 KiB strings, depth 4, 32-entry arrays — generic
  caps, deliberately not per-event schemas, each accounting for what it took:
  strings truncate in place, an over-deep subtree is replaced whole, and the two
  caps that can only remove report their counts as the top-level
  `fieldsDropped` / `arrayEntriesDropped` — top-level because `context` reaches
  an OTLP sink as one JSON string cut at 4 KiB, which swallows any mark left in
  its tail, so neither a missing field nor a 100-entry array is ever mistaken
  for what the browser actually sent) and **reshapes** it: the envelope
  stays at the top level and every other caller-supplied field is nested under
  `context`, so the set of top-level property names the sink is ever asked to
  index is fixed. A field cap bounds one record's width, not the aggregate name
  cardinality an index actually degrades on — the record allowance is sized for
  volume, and at the shipped defaults a caller inside every allowance could
  mint ~384 000 distinct property names a minute. The cost is that a browser
  field is queried as `context.digest`, not `digest`.
  Then it writes server-owned fields: `event` is re-asserted from the catalog
  key the record was gated on (the sanitizer redacts a dot-joined value whose
  three segments are each 8+ characters, so a long enough event name would
  otherwise be `[REDACTED]` in the very record whose `level` was derived from
  it), `level` comes from `FRONTEND_LOG_EVENT_LEVELS`
  (never the record — no client event maps to fatal, the paging tier),
  `timestamp`/`ingestedAt` are the ingest instant, the caller's clock survives
  only as `clientTimestamp` inside a ±15-minute skew bound, and `source` plus
  the correlation ids are overridden. `traceId`/`spanId` are **dropped
  outright**: the Seq sink reifies them into CLEF's `@tr`/`@sp` trace built-ins
  instead of copying them through as properties, so a caller-supplied value is
  used only as trace identity — enough to graft a forged record onto a real
  trace, and (when it is not 32-char hex) enough to draw the 400 that sends the
  whole sink batch to stdout fallback. A browser record has no server trace
  context to preserve. `sessionId` takes the same `isValidCorrelationId` shape
  check as the correlation ids and is omitted when it fails, rather than kept
  as up to 4 KiB of arbitrary caller text under a name dashboards join on.
- **Ingest limit:** the route is anonymous, so it is metered in **two
  dimensions**. Requests are charged first, before the body is read, so an
  over-limit caller gets a 429 + `Retry-After` without us parsing anything;
  records are charged once the batch is parsed (`chargeClientLogRecords`, via the
  ticket the request charge hands back) and are the ingest ceiling proper. A
  request cap alone metered the wrong thing — one request may carry 100 records,
  so a caller packing every batch bought ~100x the ingest of one who does not.
  Both charges stand even when the request is rejected, so malformed bodies and
  over-budget batches are not retryable for free. The record unit is byte-aware:
  the route charges `max(record count, body bytes / (64 KiB / 100))`, so one
  enormous record costs what its bytes carry, not 1.
  Each dimension has **two allowances**, and every request spends **both**:
  when `TRUST_PROXY` names a hop count the caller's own bucket is its address
  and `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` (300) /
  `CLIENT_LOG_RECORD_LIMIT_PER_MINUTE` (12000) apply — and the same request is
  charged against the one shared bucket, held to the `..._SHARED_PER_MINUTE`
  pair (6000 / 240000), the whole-app ceilings a distributed caller meets.
  When no address can be vouched for, the shared pair is the only allowance.
  Per-client XOR shared was the earlier design and it had no global ceiling at
  all once per-client buckets were on (~2 800 buckets x 12 000 units with
  nothing above them); one figure for both roles was an even earlier design and
  it dropped real logs at a few dozen page loads a minute. The schema refuses a
  shared figure below its per-client counterpart. Rejections emit `server.client_logs.throttled`
  at most once per window **per (reason, bucket kind)**, carrying the rejection
  count, bucket count, and whether the shared bucket was the one that filled —
  one global slot let whichever rejection fired first hide the others for a whole
  window while the count silently summed all of them. `reason` names the binding
  dimension: `window_exhausted` or `record_budget_exhausted`. A saturated key map
  is not a rejection — see the degradation bullet below — and reports separately
  as `server.client_logs.store_saturated`.
- Errors surfaced by Next server-side land as `server.error.unhandled` via
  `instrumentation.ts`; the paired client boundary record joins on `digest`. The
  double record is intentional — do not deduplicate.

## Integrations

- `@repo/logging/shared` — `sanitizeLogValue`/`sanitizeLogRecord`,
  `DEFAULT_LOG_LEVEL_BY_ENV`. The browser-safe entrypoint; the Node-only sink
  barrel is `@repo/logging`.
- Env: `LOG_SINK`, `LOG_LEVEL`, `LOG_REMOTE`, `SEQ_*`, `LOG_HTTP_OTLP_ENDPOINT`,
  `NEXT_PUBLIC_LOG_LEVEL`, `NEXT_PUBLIC_LOG_REMOTE`, `CLIENT_LOG_INGEST_ENABLED`,
  `CLIENT_LOG_ALLOWED_ORIGIN`.

## Gotchas

- **Logging must never throw into the caller** — `serverLogger.emit` wraps
  everything in a `try` that swallows. That is also why
  `instrumentation.ts` parses env at boot: otherwise a config refusal would be
  raised here and silently dropped.
- This directory is the one place `no-console` is switched off; everywhere else
  in the app it is an ESLint error.
- Correlation context does not cross a `'use cache'` boundary.
- `correlation.ts`'s id regex must stay in lockstep with the backend's
  `acceptId` (`apps/backend/src/common/utils/request-id.ts`), or forwarded ids
  get discarded and the join key breaks.
- `llstack_sid` is deliberately **not** `httpOnly` — the browser has to read it.
- Throttle counts are in-process, like the backend's: `FRONTEND_INSTANCE_COUNT`
  above 1 is refused at boot in staging/production until a shared store replaces
  the map.
- A dropped batch is a non-event — `client-logger.ts` fires and forgets, so a 429
  never surfaces to the member and is never retried.
- The bucket key strips an appended source port (`1.2.3.4:41237`,
  `[2001:db8::1]:41237`) — Azure App Service and some ALB configs write one, and
  a per-connection port would give one client a fresh allowance every request —
  and an IPv6 zone, then requires what is left to be an **IP literal**. Anything
  else falls to the shared bucket rather than becoming a key, so a caller who can
  write the selected entry cannot spray the map with arbitrary strings. IPv6 keys
  are derived from the parsed groups, never the caller-shaped text — every
  spelling of one address is one key, and `::ffff:` forms collapse onto the IPv4
  address they spell — and they take the client's **/56 network**, not the full
  address: a v6 subscriber holds a whole delegated block, so per-address keys let
  one host pin the map at its ceiling and push every newcomer into the shared
  bucket. Every address key is prefixed `ip:`, keeping the shared sentinel out
  of that namespace by construction.
- A bucket is an **address, not a person**: NAT and CGNAT put many members behind
  one, and a tab in an error storm flushes on 20 buffered records rather than the
  idle 5s cadence. That is what sizes the 300/min default; when the limit fires on
  real users, raising it is the intended response. For IPv6 the same holds one
  level up — a bucket is a /56 network, which can group neighbouring /64s.
- The limiter's memory is `live buckets x request allowance`, so the key ceiling is
  derived from `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` rather than fixed, with headroom
  reserved for the shared bucket's own (larger) allowance. Raising the per-client
  allowance shrinks the map (2800 keys at 300, 1400 at 600); the schema caps it at
  600 so the two always fit. The **record** allowances do not enter this at all —
  records are charged onto entries that already exist — but each entry now carries
  its record count alongside its timestamp, which is why the entry budget halved
  to 900k. The fallback allowances and that reserve are **imported from
  `config/env.schema.ts`**, not restated — they used to be a second copy of the
  same numbers under a comment promising they matched.
- The **key ceiling governs admission only**, and counts **per-client buckets
  alone** — every `bucketCount` figure does too. The shared bucket is exempt
  outright: one fixed key, no cardinality, budgeted for outside the derived
  ceiling — and now that every request charges it, it is effectively always
  live, so counting it would permanently spend a derived slot on a bucket the
  reserve already pays for. Making it win a per-client slot once dropped every
  unvouched-for caller app-wide. A per-client newcomer refused a slot is **degraded into that
  same shared bucket** rather than 429'd: failing closed starved every legitimate
  newcomer while a multi-network spray kept the map pinned, and the sprayer —
  the only party holding enough distinct /56s to reach the ceiling — was never
  the one paying. No live bucket is evicted, and the condition reports once per
  window as `server.client_logs.store_saturated`; degraded newcomers do spend the
  shared allowance, and a refusal they meet there carries `degraded: true` on the
  decision and the throttle record — map pressure, not an untrusted topology.
  The lever is _lowering_ the
  request allowance, since the map shrinks as the allowance grows — there is no
  knob that raises the ceiling directly.
- `bucketCount` is swept before it is reported. Buckets are otherwise only
  reclaimed when the map saturates, so the figure was the count of every address
  seen since boot — never "low" on an app that has been up a while, which is
  exactly the reading the throttle record invites.
- An **over-declared `TRUST_PROXY`** cannot be caught at boot but is not silent:
  a chain shorter than the declared depth can only fall back to the shared bucket,
  so `resolveClientLogRateLimitKey` reports it once per window as
  `server.trust_proxy.chain_too_short` with the declared depth and observed
  length. Never the chain itself, which is caller-supplied.
- The config memo caches **success only**. Caching the fail-closed fallback meant
  one early failure discarded `TRUST_PROXY` for the life of the process; it is
  re-attempted instead, on a hold-down (`CLIENT_LOG_RATE_CONFIG_RETRY_MS`) so the
  degraded mode neither sticks for the process lifetime nor re-runs a full env
  parse per request, and reported once as `server.client_logs.config_unreadable`.

## Agent Notes

- A new log line means a new entry in `FRONTEND_LOG_EVENTS` **in the same
  change**. A new `client.*` event needs two more with it —
  `CLIENT_INGESTIBLE_EVENTS` (or the ingest route silently drops every record
  carrying it) and `FRONTEND_LOG_EVENT_LEVELS` (the level the route writes it
  at) — and the `Record<ClientLogEvent, …>` type on both makes either omission a
  compile error. Never map a client-postable event to 60/fatal, the paging tier.
  A server-only event needs neither: it is not ingestible, and `serverLogger`
  takes its severity from the method called.
- Log reasons, booleans, enums, and ids. Never emails, tokens, cookie values, or
  raw request/response bodies.
- Covered by `correlation.test.ts`, `request-error.test.ts`,
  `client-log-rate-limit.test.ts`, and `app/api/client-logs/route.test.ts`.
- `checkClientLogRateLimit` takes `nowMs` explicitly so the window is testable
  without fake timers; `resetClientLogRateLimit()` is the test-only seam that
  clears counting state between suites.
