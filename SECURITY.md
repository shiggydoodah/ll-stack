# Security Policy

LL Stack is a boilerplate, not a deployed service. There is no hosted instance to
attack and no released version to patch — the security surface is whatever you get
when someone starts a repo from this template and builds on it. That shapes
everything below.

## Supported versions

`main` only. There are no tags, releases, or maintenance branches, so a fix lands on
`main` and downstream repos pick it up themselves. A repo created with **Use this
template** shares no history with this one, so there is nothing to rebase onto —
cherry-pick the fixing commit, or re-copy the affected files by hand.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: open the **Security** tab on this
repository and choose **Report a vulnerability**. That keeps the report private until
a fix exists. Please don't open a public issue for anything exploitable.

Include what you'd want if you were fixing it: the affected path, what an attacker
gains, and the smallest reproduction you have. A failing test or a `curl` is worth
more than a description.

This is a spare-time project — expect an acknowledgement within about a week, not
within a day. There is no bounty.

## What counts

In scope: anything that would still be a flaw after someone follows the deployment
guidance below. Auth and session handling (`apps/backend/src/auth`, `apps/frontend/lib/auth`),
the API-secret and route guards, the gateway boundary in `apps/frontend/lib/gateway`,
input validation and the Zod schemas, log redaction in `packages/logging`, the
generated client boundary, and the Dockerfiles.

## What doesn't

These look alarming in a grep and are all deliberate. Please don't report them:

- **The committed dev credentials.** `dev-backend-api-secret`, `dev-admin-api-key`,
  `dev-session-secret-…` and `dev-binding-secret-…` are published placeholders that
  exist so a fresh clone boots. Both env schemas refuse those exact strings — and any
  secret under 32 characters — when `NODE_ENV` is `staging` or `production`, so they
  cannot silently become live keys. They must stay byte-identical across the three
  `.env.example` files or every backend call 401s.
- **`docker-compose.yml` running Postgres with `synchronous_commit=off` and Seq with
  `SEQ_FIRSTRUN_NOAUTHENTICATION`.** Local throwaway containers. Both are commented in
  the file as things to remove before any non-local deployment.
- **Swagger at `/docs`.** On in development only. Enabling it in a deployed environment
  puts the whole `/docs*` tree behind `ADMIN_API_KEY`.
- **The seed script's local-only guard.** It refuses any non-localhost `DATABASE_URL`
  before a Prisma client is constructed. That's the intended behaviour, not a bypassable
  check.

## Known limitations

Real gaps, documented rather than hidden. They are the template's edges, not secrets:

- **Rate limiting is in-memory.** Throttle state lives in one process, so it does not
  hold across instances. Both apps refuse to boot in staging or production with their
  instance count above 1 — `BACKEND_INSTANCE_COUNT` and `FRONTEND_INSTANCE_COUNT` —
  until a shared store (Redis or equivalent) is wired in. That refusal is the
  mitigation; the shared store is yours to add. Note what the refusal can and cannot
  check: it reads a number you declare, not one it observes. On a host where you set
  the replica count it holds. On a serverless or auto-scaling platform (Vercel, Lambda,
  Cloud Run with min-instances above 1) the platform decides, `1` is simply untrue, and
  the guard proves nothing — there the shared store is required, not optional.
- **`/api/client-logs` is unauthenticated, and its rate limit is per process.** It is
  also **off by default**: `CLIENT_LOG_INGEST_ENABLED` must be set to `true` before the
  route exists at all (it answers 404 while disabled, before any other handling, and
  the boot log names the variable as `server.client_logs.ingest_disabled` — at `info`
  while the browser half is off too, and at `warn` when `NEXT_PUBLIC_LOG_REMOTE=true`
  is posting batches into that 404, so a `LOG_LEVEL=warn` deployment keeps the line
  that explains the silence in the one case where something is actually wrong). The same
  posture as OpenTelemetry here — wired up and off until you choose it. The browser
  half, `NEXT_PUBLIC_LOG_REMOTE`, also defaults off; the server flag is authoritative
  and the public flag cannot re-open ingestion. `NEXT_PUBLIC_*` is inlined at
  **build** time — into the server compilation as well as the client one — so that
  half has to be set when you build and a change to it needs a rebuild. The boot
  notice therefore reports the value the app was BUILT with, and over-reports in one
  shape only; the deploy checklist (item 11) says which, and how to tell. With remote
  posting off the browser logger writes `warn` and above to the DevTools console
  rather than discarding those records, so an error boundary in a default production
  build still leaves evidence somewhere — bar `client.error.unhandled` and
  `client.error.rejection`, left out of that path because the browser prints those
  itself. Below that floor a build with no remote sink drops the record — the
  production default threshold is `info`, and an unfloored fallback would print a
  structured record into every visitor's console on every page load.

  Once enabled, the route has to be anonymous — a browser has no session before login
  and those errors are the ones worth having — so it is capped instead: a rate limit
  checked before the body is read, cross-site refusals ahead of even that
  (`Sec-Fetch-Site`/`Origin`/content-type — these stop other websites weaponising real
  visitors' browsers, not `curl`; a floor, not a lock), body size (64 KiB, counted
  while the body streams in — an over-cap request is cut off, never buffered whole and
  then measured), record count (100 per request), per-record shape caps (field count,
  string length, nesting depth, array length — generic, deliberately not per-event
  schemas, and each accounts for what it took: strings truncate in place, an over-deep
  subtree is replaced whole, and the two caps that can only remove report their counts
  on the record itself as `fieldsDropped` / `arrayEntriesDropped` — top-level, where no
  sink's own truncation can reach them — rather than vanishing),
  server-side re-redaction, a server-side event check (a record
  whose `event` is not one of the `client.*` names in `CLIENT_INGESTIBLE_EVENTS` is
  never written — the full catalog was the earlier gate, and it let an anonymous
  caller forge `server.*`, `gateway.*`, and `auth.*` records, including this
  limiter's own alarms),
  and server-authoritative fields: `source`, `ingestedAt`, `timestamp`, and `level` —
  severity is derived from the event, never taken from the record, and no client
  event maps to `fatal`, so an attacker cannot post the paging tier. The
  caller's clock survives only as `clientTimestamp`, bounded to ±15 minutes of ours.

  **The record is reshaped, not only capped, because a per-record field cap does not
  bound index cardinality.** Every caller-chosen key used to reach the sink as a
  top-level property name of its own, and an index degrades on the aggregate number of
  distinct names it has ever seen — a cap of 32 per record narrows that per record and
  bounds the total not at all, since the record allowance behind it is sized for volume.
  At the shipped defaults one caller inside every allowance can mint roughly 384 000
  distinct property names a minute (about 7.68M app-wide). So only the envelope keys
  stay at the top level; every other caller-supplied field nests under a single fixed
  `context` key, and the shape caps apply inside it unchanged. Query browser fields as
  `context.<name>`.

  **`traceId` and `spanId` are dropped outright.** They are not ordinary context to the
  sink: the Seq path reifies them into CLEF's `@tr`/`@sp` trace built-ins and excludes
  them from the property copy, so a caller-supplied value is used _only_ as trace
  identity. That is enough to attach a fabricated record to a real distributed trace,
  and a value that is not 32-char hex draws a Seq `400`, which the sink treats as
  non-retryable and answers by sending the entire batch to stdout fallback — up to 99
  unrelated server records vanish from your dashboard per poisoned client record, for as
  long as the caller keeps it up. A browser record carries no server trace context of its
  own, so nothing legitimate is lost. `sessionId` is shape-checked like the correlation
  ids and omitted when it fails, rather than kept as up to 4 KiB of arbitrary caller text
  under a name dashboards group and join by.

  The limit meters **two dimensions**, because a request is not the unit a log sink is
  priced in: one request may legally carry 100 records, so a request cap alone let a
  caller who packs every batch buy roughly a hundred times the ingest of one who does
  not. Requests are charged before the body is read (cheap shedding, and it bounds the
  limiter's memory); records are charged once the batch is parsed, and are the ingest
  ceiling proper — in byte-aware units, so one enormous record is charged as the
  several records' worth of bytes it actually carries rather than as one. Neither
  charge is refunded on rejection: a malformed or oversized body still costs the
  request it arrived on (though only that — it is refused before the record charge),
  and a refused over-budget batch keeps its record charge, so the remaining headroom
  cannot be probed for free.

  Each dimension has two allowances, **and both are charged on every request**. With
  `TRUST_PROXY` set to your hop count, each client IP gets its own bucket and
  `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` (300 requests) and
  `CLIENT_LOG_RECORD_LIMIT_PER_MINUTE` (12 000 records) apply — and the same request
  also spends the shared bucket, held to `CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE`
  (6 000) and `CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE` (240 000), the whole-app
  ceilings. Per-client XOR shared was the earlier design, and it left no global
  ceiling at all once per-client buckets were on: a distributed caller with fresh
  addresses multiplied the per-client allowance out to ~33.6M record-units/min with
  nothing above it. Now the per-client bucket stops one abuser and the shared bucket
  stops all of them together. Without `TRUST_PROXY` — the default — no address can be
  trusted, and the shared pair is the only allowance.

  Four edges remain. Counts live in one process, so `FRONTEND_INSTANCE_COUNT` above 1
  is refused in staging and production for the reason above. While the shared bucket is
  in force, one abuser can spend the app-wide allowance — set `TRUST_PROXY` to get
  per-client buckets. A bucket is an address, not a person: behind corporate NAT or
  mobile CGNAT many members share one, so a per-client limit can throttle real users —
  and for IPv6 the bucket is the client's /56 network rather than a single address,
  because a v6 subscriber holds a whole delegated block: keying finer would let one
  host mint a bucket per request and pin the key map, while keying this coarse can
  group v6 neighbours the way NAT already groups v4 members.
  And the number of per-client buckets is itself bounded: 2 800 at the default request
  allowance, shrinking as you raise that allowance. Past it a client with no bucket is
  served from the shared whole-app bucket instead of getting its own — no live bucket
  is evicted and no one is refused for the map's fullness alone, though degraded
  newcomers spend the shared allowance and are refused once it is gone — and the
  condition is reported once per window as
  `server.client_logs.store_saturated`. Raising `CLIENT_LOG_RATE_LIMIT_PER_MINUTE`
  shrinks the map further, so lowering it (or wiring the shared store) is the lever; the
  record allowances do not affect it either way. See `apps/frontend/.env.example` for
  the exact figures. The whole-app bucket is exempt from that ceiling, so an
  unvouched-for caller always has a bucket to land in — though while the map is
  pinned, degraded newcomers share that bucket's allowance.

  The `server.client_logs.throttled` record says which situation you are in:
  `sharedBucket` separates the app-wide ceiling from one caller — with `TRUST_PROXY`
  set, a `sharedBucket: true` record means the GLOBAL ceiling fired on distributed
  traffic, and the `..._SHARED_...` knobs are the lever — `reason` separates
  a spent request window (`window_exhausted` — raise the request allowance) from a
  spent ingest budget (`record_budget_exhausted` — raise the record allowance), and
  `degraded` marks a shared-bucket rejection whose caller was pushed there by a full
  key map — there the lever is lowering `CLIENT_LOG_RATE_LIMIT_PER_MINUTE` (or wiring
  the shared store), not raising the shared allowance. A full key map is not a
  rejection by itself: it reports separately as `server.client_logs.store_saturated`,
  with the same lever.

  What the limit does NOT do is shed load. `proxy.ts` matches this path, so a rejected
  request has already paid a full middleware pass before the handler runs. It protects
  your log sink, not this server's CPU.

- **`/logout` changes state on a GET.** Any link or redirect can reach it, which is
  what lets `proxy.ts` and the layout guards sign a browser out with a plain redirect,
  and it means another site can fire the route at a visitor and revoke their session.
  The handler refuses every cross-site request with a 403 before it touches a cookie.

  `Sec-Fetch-Site` cannot make that call on its own, because browsers compute it over
  the request's whole URL list: the proxy's own redirect from `/dashboard` to
  `/logout` inherits the `cross-site` an emailed link arrived with, so refusing on
  that header alone stranded the visitor holding a session cookie only this route can
  clear. So the app identifies its own redirect. Every redirect of ours into `/logout`
  carries a short-lived HMAC minted under `BINDING_SECRET`
  (`lib/auth/logout-token.ts`), and a cross-site request presenting a valid one is our
  own hop, and only when it is also a top-level navigation. Nothing else cross-site is
  served. `<img src>`, `<iframe>` and `fetch()` are refused whether they carry a token
  or not: it rides in a query string, so the address bar, the browser history, and
  every access log in front of the app hold a copy of it for two minutes, and one read
  out of a log must not turn `<img src="/logout?t=…">` back on.

  **The session cookie is inside the signed message**, and that is what the guard
  rests on. "Only this server can mint one" is true and is not the bar an attacker has
  to clear, because they never need to mint one — the app hands them out. The proxy
  answers any request for a member page carrying a session cookie it cannot match a
  binding to with a 307 to `/logout?t=…`, so
  `curl -H 'Cookie: llstack_session=anything' /dashboard` reads a live token out of the
  `Location` header with no account and no browser.

  Signed over the cookie value, a harvested token verifies only against the session it
  was minted for, which no other origin can read. The session cookie is `SameSite=Lax`,
  so the browser sends it on exactly the request being checked.

  It is bound to a session, not to a user or a device, because `/logout` runs for
  lapsed and absent sessions too. One that leaks inside its two-minute life can sign
  out the single session it names, exactly as an in-app link already does. Chrome and
  Firefox have sent fetch metadata for years and Safari since 16.4; an older browser
  sends nothing and is let through, because refusing an absent header would break a
  bookmarked `/logout` for those visitors. The worst a gap there costs is an unwanted
  sign-out, which is why that trade is acceptable here and would not be on a route that
  destroys data.

- **An idle session ends in a full sign-out.**
  `AUTH_SESSION_TTL_SECONDS` (backend, 7 days) is the ceiling on a session's life;
  `AUTH_IDLE_TIMEOUT_SECONDS` (frontend, 8 hours) is an idle window inside it,
  carried in the binding cookies and rolled forward by `proxy.ts` on member
  requests. A browser that stops touching member routes lapses, and the proxy sends it
  to `/logout`, which revokes the session backend-side. There is no re-authentication
  prompt: the session is destroyed and the user signs in again. Keep the idle window
  below the backend TTL — neither app can read the other's env to check.

- **A stolen session cookie still works for one rotation interval.**
  The session token is re-issued every `AUTH_SESSION_ROTATE_AFTER_SECONDS` (1 hour by
  default) while the browser is active, and the token it replaces is kept and marked
  superseded. Presenting a superseded token more than
  `AUTH_SESSION_ROTATION_GRACE_SECONDS` (60 seconds) after it was retired, when a token
  minted after it has already been used, takes a second holder of it — so it revokes
  every token in that sign-in and logs
  `auth.session.reuse_detected`. **Wire an alert to that event.** It is the only signal
  this stack produces that names a specific compromised session. None of it stops the
  first hour, though. A thief who copies a live cookie has until the next rotation, and
  inside the grace window they are indistinguishable from a slow request. Shorten the
  interval to shorten that window, at the cost of one extra row per sign-in per
  interval.

- **A rotation whose response never reaches this app is recovered.**
  The rotation commits and the answer carrying the new token is lost on the way back: a
  gateway timeout, an aborted call, a `Set-Cookie` that could not be read. The browser
  goes on presenting the token that was just retired, which from the outside is
  identical to a copied cookie. The successor separates them, because a successor
  nobody has ever presented is a successor nobody received. On the retry the backend
  restores the presented token, revokes the successor no one got, and logs
  `auth.session.rotation_response_lost`; the next rotation simply runs again.

  The first shape of this refused the token instead, and that ended the session every
  time, on nothing worse than a rotation call that timed out. The successor is
  unrecoverable once its response is gone, so there was nothing else to fall back to. Restoring the
  earlier token rather than issuing a fresh one is what keeps the alarm intact: the
  family goes back to one live token, and a second holder that kept a copy is caught by
  the next rotation exactly as it would have been by the lost one.

  Only `POST /auth/session/rotate` can trigger it, and the gap that closes is why. A
  successor that was never presented may still have been delivered, and the only reason
  that is ruled out here is that every member render in this app calls the backend. Add
  a member page that does not and its successor sits unspent in the jar until the next
  navigation, which can be minutes; reachable from every authenticated request, that
  gap restores a copied token instead of firing `auth.session.reuse_detected`.
  Confining it to the rotation retry, which is the request that asked for the answer
  that went missing, leaves everything else on the plain refusal.

  The retry rides the next safe-method navigation, and `AUTH_ROTATION_RETRY_SECONDS`
  (frontend) decides how soon that navigation asks. Keep it at or below
  `AUTH_SESSION_ROTATION_GRACE_SECONDS` (backend): a retry inside the grace window is
  answered `superseded` and simply asks again on the following navigation, while the
  window keeps every ordinary request on the retired token answered. Set the retry
  above the grace window and there is a stretch in which navigations do not ask yet
  and every render's own backend call is refused — a 401 the member layout turns into
  `/logout`, which revokes the family before the recovery ever runs.

  What this does not cover is a state-changing request that lands after the grace
  window and before the next navigation. The proxy only asks to rotate on GET and
  HEAD, so a server action arriving in that gap is refused whatever the retry is set
  to, and the visitor signs in again.

  Nor does it cover a response lost between this app and the browser, and that one ends
  in the alarm. `proxy.ts` rewrites the forwarded cookie header on a rotation, so the
  render behind it spends the successor before the browser has seen anything. A
  response dropped after that point leaves a used successor and a browser still holding
  the retired token, which is the reuse condition exactly. The visitor is signed out and
  `auth.session.reuse_detected` fires with nothing stolen.

  That trade is deliberate. Letting the render keep the retired token would recover the
  case, and it would also weaken `firstUsedAt` to "the browser has not come back yet" —
  enough for a thief holding a copied cookie jar to have the victim's live successor
  revoked and the stolen token restored, with no alarm at all. Rotation runs about once
  an hour per browser and the window is the moment between the render's backend call and
  the response headers landing, so the false alarm should be rare. If you see
  `auth.session.reuse_detected` at a steady low rate with nothing else pointing at
  theft, rule this out first.

- **Two requests racing a rotation can cost a session, cleanly.**
  The proxy writes the session and binding cookies on separate outcomes, and two
  in-flight requests finish in whichever order the network delivers. A rotate call that
  timed out beside a sibling's that succeeded, or a long-dwelled form POST rolling the
  binding beside a navigation that rotated, can land its write second and leave the jar
  holding the new session cookie under a binding minted over the retired token. The next
  member request fails the binding check and goes through `/logout` — a forced re-login,
  with windows milliseconds wide and nothing leaked. Re-asserting the old session cookie
  alongside the binding would close that gap and turn the same race into a false
  `auth.session.reuse_detected`, so the clean sign-out is the failure this design keeps.

- **Nothing here rotates a session on a privilege change,**
  because nothing here changes a privilege: `UserRole` is set at registration and no
  endpoint alters it. Once you add one, end that user's sessions in the same
  transaction — a token minted under the old role otherwise stays live until its next
  rotation. `AuthService.revokeSessionFamily` is the shape to copy.

- **A member can end their other sessions, and that is the whole self-service story.**
  `/account` lists the live sign-ins and `POST /auth/sessions/revoke-all` ends every one
  but the caller's, which is what somebody reaches for when they think a cookie of
  theirs has been copied. It works on the family, so a copied token's whole lineage
  goes with it.

  The listing carries no device name, IP, or user agent, because nothing here stores
  one. Rows read as "signed in since Tuesday", which is enough to spot a sign-in you
  did not make and not enough to say where from. Adding those columns is a product
  decision with a privacy cost, so the template leaves it to you.

  `lastSeenAt` is stamped when a sign-in's token is re-issued, so it lags an active
  browser by up to `AUTH_SESSION_ROTATE_AFTER_SECONDS`. A thief's session can therefore
  read as idle for the best part of an hour.

  A revoked sign-in is not signed out the instant it is revoked: the browser holding it
  finds out on its next request to the backend. Nothing here pushes.

- **A revoke-all from a stolen session locks the owner out**, the same way a sign-out
  from one does. Whoever holds a live session can end every other one, and this route
  makes that one request instead of many. It is throttled per account (5 per 15
  minutes) and it logs `auth.session.all_revoked` with the counts, so the action is
  visible; it is not prevented, because the session making it is by definition
  authenticated.

- **Password hashes are upgraded on the next successful login and not before.**
  Raising `AUTH_ARGON2_*` changes nothing for accounts that already exist until each
  owner signs in — the plaintext is not stored, so that login is the only moment a row
  can be re-hashed. Watch `auth.login.password_rehashed` fall to zero after a change to
  know the population has turned over; the tail is however long your least active
  members take to come back, and there is no way to shorten it. `users.hash_version`
  carries a change of scheme, which the argon2 cost check cannot see on its own.

- **Auth is a worked example, not a finished identity system.** No email verification,
  password reset, account lockout, MFA, or roles. Build them before you ship anything
  real.

## Before you deploy

The repo fails closed on most of this, but the checks only fire when `NODE_ENV` is
set correctly — that variable is required with no default precisely because every
other guard keys off it.

1. Generate real secrets: `openssl rand -base64 32` for `BACKEND_API_SECRET`,
   `ADMIN_API_KEY`, `SESSION_SECRET`, and `BINDING_SECRET`.
2. Set `NODE_ENV=production`. Without it the dev-credential refusal never runs.
3. Decide the idle timeout. `AUTH_IDLE_TIMEOUT_SECONDS` (frontend, default 8 hours)
   is how long a signed-in browser may go untouched before it is signed out, and it
   fires long before the backend's `AUTH_SESSION_TTL_SECONDS` (7 days). Lapsing
   revokes the session rather than prompting for a password, so a short window costs
   your users real work. Keep it below the backend TTL; nothing at boot can check
   that, because the two values live in different apps.
4. Decide the rotation interval, and the prune budget with it.
   `AUTH_SESSION_ROTATE_AFTER_SECONDS` (backend, default 1 hour) is how long a copied
   session cookie stays useful, and every interval costs one extra `sessions` row per
   active sign-in until that sign-in expires. Superseded rows are what reuse detection
   reads, so none of them can be dropped early; they go when the family expires, all at
   once. One prune sweep deletes at most `AUTH_SESSION_PRUNE_MAX_BATCHES` ×
   `AUTH_SESSION_PRUNE_BATCH_SIZE` rows, 100,000 an hour at the defaults, and that
   ceiling is what has to keep up. Shorten the interval and raise the ceiling with it.
   `system.session_prune.completed` warns when a sweep stops on the ceiling; on every
   tick, that means rows are arriving faster than they are deleted and the table is
   growing.

   Alert on `auth.session.reuse_detected`; a stack that detects token theft and tells
   nobody is the same as one that does not. It has one known false positive — a
   rotation response lost between the app and the browser, described above — so treat a
   steady low rate of it as a signal to check delivery before assuming theft. Do not
   alert on `auth.session.rotation_response_lost`: that is a rotation the app itself
   never received an answer to, which the backend recovers from by restoring the token
   it retired. It is a rate to watch rather than an incident to page on.

   Keep `AUTH_ROTATION_RETRY_SECONDS` (frontend, default 60) at or below
   `AUTH_SESSION_ROTATION_GRACE_SECONDS` (backend, default 60). The retry must come due
   while the grace window is still answering requests on the retired token; a retry
   inside the window is answered `superseded` and asks again on the next navigation,
   which is what carries it across the boundary into the recovery above. Set it above
   the window and the requests in between are refused instead, signing the visitor out
   before the retry ever fires. Neither app can read the other's env to check.

5. Set `TRUST_PROXY` deliberately to the number of proxy hops you actually run — in
   **both** apps; the frontend reads it too, for the `/api/client-logs` limit.
   Over-trusting lets clients spoof `X-Forwarded-For` and evade per-IP throttling;
   under-trusting collapses every client into one bucket. So does over-declaring the
   count: entries are read from the right, so a chain shorter than the depth you declare
   can only fall back to the shared bucket, silently turning per-client bucketing off
   while your config reads as though it were on. Nothing at boot can check that, so the
   frontend reports it at request time as `server.trust_proxy.chain_too_short` — watch
   for it after any change to your proxy topology. Use a hop count, not `true`:
   Express can resolve `true`, `loopback`, and CIDR forms against the socket address,
   but a Next route handler has none, so the frontend resolves them to zero hops and
   logs `server.trust_proxy.degraded` at boot. That is safe — every caller in one
   bucket — but it is not what you asked for.
6. Make sure the frontend is reachable **only** through the proxies `TRUST_PROXY`
   declares. A hop count is spoof-resistant while every request really traverses that
   chain: a caller can prepend `X-Forwarded-For` entries but cannot displace the ones
   your proxies appended after them. A request that arrives without traversing the
   chain — a container port reachable inside the cluster, an SSRF pivot, a proxy that
   forwards the header verbatim instead of appending — inverts that, and the caller
   writes the entry the limit keys on. The limiter bounds the damage (keys must be IP
   literals, and the key map is capped, degrading newcomers to the shared bucket) but it cannot make the address
   true. If you cannot guarantee the network path, leave `TRUST_PROXY` unset and take
   the shared bucket.
7. Set `FRONTEND_ORIGIN` and `FRONTEND_PUBLIC_URL` to your real origins.
8. Leave `OPENAPI_DOCS_ENABLED` off unless you want `/docs` behind the admin key.
9. Strip the local-only settings out of `docker-compose.yml` if you derive a
   deployment from it.
10. Keep the backend unreachable from the public internet. The whole design assumes
    the Next.js server is the only thing that can talk to it.
11. Decide whether to enable browser-log ingest at all. `CLIENT_LOG_INGEST_ENABLED`
    defaults to off and `POST /api/client-logs` answers 404 until you set it — with
    `NEXT_PUBLIC_LOG_REMOTE` for the browser half. If you don't need remote browser
    logs, leave both off and items 12–16 don't apply. If you do, **set
    `NEXT_PUBLIC_LOG_REMOTE` at BUILD time**: it is a `NEXT_PUBLIC_*` variable, so
    Next inlines it during `next build`, and setting it only in the runtime
    environment — build once, configure per environment, the ordinary container
    flow — leaves the shipped bundle posting nothing. Changing it later needs a
    rebuild, not a restart. Set it that way and the boot notice is accurate about
    the bundle: `NEXT_PUBLIC_*` is inlined into the server compilation too, so
    `browserRemoteEnabled: true` on `server.client_logs.ingest_disabled` is the
    value the bundle was BUILT with, and a `warn` there means real browser batches
    are going into a 404. Believe it — don't rebuild first. The notice over-reports
    in exactly one case: the variable absent at build and set only in the runtime
    environment. Nothing was inlined, so the server falls back to reading its own
    env and says `true` while the bundle sends nothing — and that deployment is
    already misconfigured, because a `NEXT_PUBLIC_*` set only at runtime never
    reaches a browser. To confirm which you have, search the built server JS for
    `process.env.NEXT_PUBLIC_LOG_REMOTE`: a match anywhere under `.next/server` means
    it was NOT inlined, and no match means it was. Search the `.js` files only — the
    `.js.map` files carry the original source either way, so they always match. Whatever the cause, the browser
    will never tell you a batch was rejected — the client logger fires and forgets, so
    a record it posts into a 404, a 403, or a 429 is dropped with nothing in the
    visitor's console either. Every one of those is accounted for on the server
    instead: `server.client_logs.ingest_disabled` at boot,
    `server.client_logs.refused` (item 13), and `server.client_logs.throttled`. Those
    three records are the whole diagnostic story; watch them, not the browser.
12. If you enable it, put an edge/WAF rate-limit rule on `/api/client-logs`, sized
    ABOVE the in-app limits so real traffic never meets it. The app cannot shed this
    load itself: `proxy.ts`'s matcher covers the path, so even a request the in-app
    limiter rejects has already paid a full middleware pass — nonce generation, CSP
    construction, a `Set-Cookie` — before the handler runs. Shedding that work needs
    a limit in FRONT of Next: a CDN rule, a WAF, or a reverse-proxy `limit_req`. The
    in-app limit protects your log sink; only an edge limit protects your server.
13. Make sure every proxy in front of Next PRESERVES the `Host` header — or set
    `CLIENT_LOG_ALLOWED_ORIGIN`. The route refuses a request whose `Origin` does not
    name the host this process received — a browser-controlled check, so it stops
    other websites weaponising real visitors' browsers — and it compares against
    `Host` by default because this app deliberately carries no configured self-URL.
    A proxy that rewrites `Host` to its upstream (an nginx `proxy_pass` without
    `proxy_set_header Host $host`) therefore fails EVERY real browser request: 100%
    of browser telemetry dropped, permanently. It is not silent — the app writes
    `server.client_logs.refused` with `reason: 'origin_mismatch'`, once per window
    — so watch for that record the day you enable ingest. It names the comparand it
    refused against too: `originCheck: 'host'` means no override is in force, and
    `originCheck: 'allowed_origin'` means one is, with `allowedOrigin` carrying the
    normalised value actually being compared. Read that field first if you have set
    the variable and the refusals continue — it separates "my override isn't being
    read" from "my override is wrong", two states that otherwise look identical and
    both of which drop everything. Preserving `Host` is the
    better repair. Where the proxy is not yours to change, set
    `CLIENT_LOG_ALLOWED_ORIGIN` to the origin browsers actually address the app on
    (`https://app.example.com` — scheme, host, and port only; a path or query is
    refused at boot) and it REPLACES the `Host` comparison for every request. That
    is safe where trusting `X-Forwarded-Host` would not be: you set it, and the
    caller cannot. Do not "fix" it with `X-Forwarded-Host` — that header is
    caller-written, and honouring it would delete the check rather than repair it.
    Two limits to read before you reach for it. It does **not** make `Origin`
    mandatory — a request carrying no `Origin` at all is still admitted, exactly as
    it is under the `Host` comparison, so this repairs the comparison rather than
    tightening it; the rate limit and the shape caps are what bound a caller
    speaking HTTP directly. And it holds **one** origin, not a list, so an app
    genuinely served on several (apex plus `www`, per-tenant domains) would lose
    browser telemetry from every origin but the one named — that deployment wants
    the `Host` fix, not this.
14. Put a hard spending quota and a billing alert on whatever the log sink is
    (Datadog, Seq, CloudWatch, …). The in-app ceilings bound records per minute, but
    your bill is monthly and the limiter is in-process — a quota at the provider is
    the only bound that survives every failure mode on the path to it.
15. Route `source: 'frontend-client'` records to their own dataset/stream/index at
    the sink, separate from server logs. They are the only records an anonymous
    caller can write; keeping them apart means retention, quota, and access rules can
    treat them as the untrusted tier they are, and a flood cannot crowd out server
    logs.
16. A process rule no code can enforce: **never alert on client logs alone, and never
    cite them as evidence.** `source: 'frontend-client'` records are
    attacker-writable by design — any browser, any `curl`, no session. Only the
    `client.*` events are ingestible, so a caller can no longer forge a `server.*`
    or `gateway.*` record, but everything inside a `client.*` one is still theirs
    to choose. They are leads, not proof: corroborate against server-side records
    (joined on `digest` / correlation ids) before paging anyone or concluding
    anything. Write this into your alerting guidelines the day you enable ingest.
