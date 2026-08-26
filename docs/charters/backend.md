# Backend Development Standards

These are the durable conventions for planning, building, and editing features in the backend (`apps/backend`). The goals are: a thin HTTP layer over framework-light services; endpoints that are deliberately guarded, throttled, and contract-documented; access decisions that fail closed; and a service that is observable and testable by default.

The agent-facing companion at `docs/agents/backend.agents.md` distils these rules into a strict checklist for automated enforcement. This charter exists so humans understand _why_ each rule is here.

The backend currently ships the health module plus the platform infrastructure; the auth/users modules land in the next phase and are used as the worked examples throughout this charter. The charter is the reference point: new work follows it in full, and where existing code disagrees with this document, the document wins and the old code is not precedent. Some absences (numeric coverage thresholds, CSRF tokens, shared throttle storage) are deliberate deferred decisions — confirm before "fixing" one.

---

## Stack

- NestJS 11 on Express, bootstrapped in `apps/backend/src/main.ts` / `apps/backend/src/bootstrap/configure-app.ts`
- Prisma + PostgreSQL via the PG driver adapter — `apps/backend/src/prisma/prisma.service.ts`; schema and migration rules live in `docs/charters/database-standards.md`
- OpenAPI via `@nestjs/swagger`, served at `/docs`, extracted by `apps/backend/scripts/extract-openapi.ts`, code-generated into the typed clients in `packages/services` (`pnpm gen:client`)
- `class-validator` + `class-transformer` for DTOs; `zod` for environment validation (`apps/backend/src/config/env.schema.ts`)
- `@nestjs/throttler` behind `AppThrottlerGuard` for rate limiting
- `nestjs-pino` structured logging with PII redaction; OpenTelemetry traces and metrics, opt-in via env
- `@nestjs/schedule` for background schedules, registered dynamically and env-gated
- `helmet` + `cookie-parser`; sessions are opaque tokens in HttpOnly cookies; passwords are Argon2 hashes

Two deliberate absences:

- **No passport / JWT.** Auth is opaque session tokens — 32 random bytes, stored SHA-256-hashed, delivered in an HttpOnly cookie. Why: server-side sessions are revocable the moment a row is deleted, there is no signed-token replay window, and nothing user-readable encodes claims that can drift from the database.
- **No repository layer.** Services call Prisma directly. Why: Prisma is already the data-access abstraction; a second indirection adds boilerplate and hides query shapes from review without buying portability we will ever use.

Per `AGENTS.md`, new major libraries, frameworks, queues, auth providers, or storage providers require explicit approval before they are introduced.

---

## Module Anatomy

One feature, one module, directly under `apps/backend/src/<feature>/`. The canonical file split, illustrated with the auth module:

```txt
src/auth/
  auth.module.ts                # DI wiring; imports kept minimal
  auth.controller.ts            # HTTP surface: routes, guards, mapping
  auth.service.ts               # business logic + Prisma
  auth.types.ts                 # domain types, ports, constants
  auth.errors.ts                # typed domain errors
  login-throttler.guard.ts      # feature-owned throttler guard
  dto/                          # request/response/param DTOs
  CONTEXT.md                    # module map for humans and agents
```

Why:

- **Navigability.** Any contributor (or agent) can predict where a file lives. The `CONTEXT.md` per module is the discovery layer the whole repo relies on.
- **Blast radius.** A feature's guards, errors, and DTOs live with the feature, so a change is reviewable in one place.

Rules:

- Guard placement: cross-cutting guards live in `src/common/guards/` (`api-secret.guard.ts`, `app-throttler.guard.ts`); the auth ladder lives in `src/auth/`; feature-owned guards live in their feature folder, named `<feature>-<action>-throttler.guard.ts` for throttlers (e.g. `auth/login-throttler.guard.ts`).
- No cross-feature imports of another module's service or internals. Share through `src/common`, or define a port (see Layering). A module may import another module's _exported_ guard or service via its module (e.g. an admin feature imports the admin session guard chain for its ladder) — but keep the module graph acyclic; when importing a module would create a cycle, provide the shared guard directly in the consumer's module instead.
- Update the module's `CONTEXT.md` whenever its shape, ownership, or contracts change.

---

## Layering and Separation of Concerns

Three layers, strictly ordered: **controller → service → Prisma**.

| Layer      | Owns                                                                    | Must not                                               |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| Controller | Routing, guards, DTO validation, response mapping, domain-error → HTTP  | Contain business logic or call Prisma                  |
| Service    | Business logic, invariants, Prisma queries, transactions, domain errors | Throw `HttpException` or import from `@nestjs/swagger` |
| Prisma     | Data access (via the global `PrismaService`)                            | Leak raw client errors past the service                |

Why: services stay testable without HTTP scaffolding and reusable from other entry points (schedulers, admin flows); controllers stay small enough that the security surface — guards, validation, status codes — is reviewable at a glance.

Mapping is explicit and named:

- Service maps a Prisma `select` row to a domain view with a pure `to<TypeName>` function, returning types declared in `<feature>.types.ts` (e.g. `toUserProfile` in the users service).
- Controller maps the domain view to a response DTO, and domain errors to HTTP via `to<Feature>HttpException` (e.g. `toAuthHttpException` in `auth.errors.ts`).

### External integrations go behind ports

Anything that talks to the outside world — email, storage, third-party providers — is consumed through a port: an injection token plus an interface, with the adapter chosen in the module's providers (e.g. an `EmailSender` port in the auth module, with a dev sink adapter locally and a real provider adapter in production).

Why: features are testable with capturing doubles instead of live providers; adapters can be swapped (fake → real provider) without touching feature code; and the approval gate for new providers (`AGENTS.md`) has one obvious seam to review.

---

## Strict TypeScript for the Backend

`AGENTS.md` bans `any` repo-wide. For the backend specifically:

- Exported controller and service methods declare explicit return types. The contract chain — DTO → OpenAPI → generated client — is only as honest as the source types.
- Closed value sets are string-literal unions (`type AuthErrorCode = 'EMAIL_ALREADY_REGISTERED' | …`), not TypeScript enums. Unions are exhaustiveness-checked in switches, serialize as plain strings, and need no runtime object.
- Query projections use `satisfies Prisma.<Model>Select` constants so the projection stays type-checked against the schema.
- Switches over closed unions are exhaustive — when a new member is added, the compiler must fail every unhandled switch until it is mapped.
- No non-null assertions (`!`) and no broad casts to silence strictness. If the type system is fighting you, the model is wrong — fix the type, not the symptom.

---

## Domain Errors and HTTP Mapping

Every feature defines its failure modes once, in `<feature>.errors.ts`, as a string-literal code union plus an error class carrying the code:

```typescript
export type AuthErrorCode = 'EMAIL_ALREADY_REGISTERED' | 'INVALID_CREDENTIALS';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
}
```

Services throw domain errors; controllers translate them in one exhaustive switch (`toAuthHttpException`) so every code has exactly one HTTP status, and a newly added code fails compilation until it is mapped.

All error responses flow through the global `HttpExceptionFilter` (`apps/backend/src/common/filters/http-exception.filter.ts`) and share one body shape (`apps/backend/src/common/filters/api-error-response.dto.ts`):

```json
{
  "statusCode": 401,
  "error": "INVALID_CREDENTIALS",
  "message": "INVALID_CREDENTIALS",
  "path": "/auth/login",
  "timestamp": "…",
  "traceId": "…"
}
```

Why one shape: clients and the generated SDK handle every failure uniformly, and the `traceId` lets a user-reported error be joined to logs and traces in one search.

Rules:

- 5xx responses are masked by the filter (`Internal server error`) — internals never reach clients. Keep it that way.
- **Indistinguishable 404s.** For owner-scoped lookups, "does not exist", "soft-deleted", and "not yours" must produce the same 404. Why: a 403-vs-404 split is an existence oracle; it leaks which IDs are real and who owns what. Any user-owned resource lookup must follow this rule.
- Validation failures are the global pipe's 400 with the message array; do not re-implement validation errors per feature.

---

## DTO and Validation Standards

The global `ValidationPipe` is configured in `apps/backend/src/bootstrap/configure-app.ts` with `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` — unknown fields are an error, not a shrug. Never relax it.

Request DTOs are class-validator classes in the module's `dto/` folder — bodies, params (`user-id-param.dto.ts`), and query strings alike:

```typescript
@ApiPropertyOptional()
@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
@ValidateIf((o) => o.displayName !== undefined)
@IsString()
@MaxLength(FREE_TEXT_MAX_LENGTH)
displayName?: string;
```

- Optional fields use `@ValidateIf((o) => o.field !== undefined)` instead of `@IsOptional`. Why: `@IsOptional` also waves through explicit `null`, which then leaks past the boundary as a value no validator examined. `@ValidateIf` keeps "absent" legal and makes `null` fail validation.
- Normalize at the boundary with `@Transform` (trim, lowercase); validate nested objects with `@Type(() => ChildDto)`.
- Every field carries `@ApiProperty` / `@ApiPropertyOptional` with accurate type, format, enum, and nullability — the generated client is only as good as this metadata.

Response DTOs are plain `@ApiProperty`-decorated classes, **hand-mapped** from domain views. There is no `ClassSerializerInterceptor` and we do not add one. Why: explicit mapping is an allowlist — a new column added to a Prisma model never reaches the wire until someone deliberately maps it. Serializer-based filtering is a denylist that fails open.

---

## API Contract Discipline

The OpenAPI document is a product: `packages/services` generates the typed clients the frontend consumes from it.

- Every endpoint documents its success status **and every reachable error status** — 401/403 produced by its guards, 404, 409, and 429 where a throttler applies — typed with `ApiErrorResponseDto` (e.g. `@ApiTooManyRequestsResponse({ description: …, type: ApiErrorResponseDto })`).
- **The 500 belongs to no route, which is why controllers forget it.** `HttpExceptionFilter` masks any unhandled failure to 500, so one is reachable everywhere without a single route declaring it. Controllers publish it at class level through `@ApiInternalErrorResponse()`. A handler that cannot throw is not an exemption: an omitted status and an impossible one read identically to whoever generates a client, so a route like `/health` publishes the status and says in the description what is _not_ one (a database outage there is a 200 carrying `status: "degraded"`, not a 500).
- Operation IDs are stable and explicit (see the `operationIdFactory` in `apps/backend/src/bootstrap/configure-app.ts`). Renaming one is a breaking client change.
- Any contract change — route, DTO field, status, security metadata — regenerates the `packages/services` output with `pnpm gen:client <domain>` and commits it. That commit may land in the same PR as the contract change and any other backend/frontend work; an optional `--dry-run` smoke test (output lands in a git-ignored `.temp/` dir) can sanity-check generation first. This restates the `AGENTS.md` non-negotiable.
- Generated output under `packages/services` is never hand-edited; new tags require the manifest and export updates described in `packages/services/CONTEXT.md`.
- `admin-internal` endpoints are never exposed to client generation.

Why: an undocumented status code is a silent client-codegen drift — the SDK's error handling lies to its callers until someone hits the gap in production.

---

## Auth, Sessions, and the Guard Ladder

Session model: login verifies the Argon2 password hash, mints 32 random bytes, stores only the SHA-256 hash, and sets the raw token in an HttpOnly, SameSite cookie. `SessionGuard` resolves the cookie back to a session row on every request.

Argon2 cost can move and a stored hash cannot follow it on its own, so `login` re-hashes on the way through when `users.hash_version` names an older scheme or `argon2.needsRehash` says the digest's embedded cost no longer matches `AUTH_ARGON2_*`. A successful login is the only moment the plaintext exists, so without this, raising the cost protects accounts created afterwards and leaves everyone else where they were. The write is guarded on the hash just verified, and a failure is logged rather than thrown — the credential check has already passed, and a database hiccup should not turn a correct sign-in into a 500.

### Rotation and token families

A `sessions` row is one token. Every token a sign-in has held shares a `familyId`, and `POST /auth/session/rotate` re-issues the current one after `AUTH_SESSION_ROTATE_AFTER_SECONDS`, keeping the old row and marking it superseded.

The retired row is what earns the rotation. A token that has been rotated away should exist in exactly one place, because the browser it was issued to replaced it and moved on. Presenting it again therefore takes a second holder, so it revokes every token in that family and logs `auth.session.reuse_detected`. Without rotation there is no comparable signal anywhere in the stack, since a copied cookie is byte-identical to the real one and stays valid for the full TTL.

That argument has one hole, and `firstUsedAt` plugs it. When the rotation commits but its answer never reaches the frontend, the browser is left holding the retired token through no fault of its own, and there is still only one holder. The successor gives that case away, because a token nobody has ever presented is a token nobody received. So the alarm needs both halves: the retired token presented late, and something minted after it already in use.

The other half is a rotation to undo. The first shape of this refused the token instead, which ended the session every time an aborted rotation call dropped a response, because the successor is unrecoverable once its response is gone: only the hash is stored. So `recoverUndeliveredRotation` clears the presented row's `rotatedAt`, revokes the successors nobody received, logs `auth.session.rotation_response_lost`, and lets the next `rotateSession` run the rotation that was lost.

Read "never reaches the frontend" literally. `proxy.ts` rewrites the forwarded cookie header on a rotation, and the render behind it always calls back here, so a successor the frontend received is a successor that has been spent by the time the browser sees anything. Recovery therefore covers a rotation call the frontend could not complete, and a response dropped between the frontend and the browser looks like delivery — that browser is signed out on its next rotation and raises `auth.session.reuse_detected`. Leaving the render on the retired token would close that case and would reduce `firstUsedAt` to "the browser has not come back yet", which lets a thief with a copied cookie jar have the victim's live successor revoked in silence; the false alarm is the cheaper of the two.

Only `rotateSession` reaches it, because `firstUsedAt: null` proves a successor was never presented rather than never delivered. A member page that renders without calling the backend leaves its successor unspent in the jar until the next navigation, and while every authenticated request could reach the recovery, a copied token presented inside that window was restored instead of raising the alarm. The rotation retry is the request that asked for the answer that went missing, so it is the one caller with a reason to undo it; `getSession` refuses quietly and waits for that retry.

The claim runs before the revoke, and it is guarded on the exact `rotatedAt` the caller read. Two requests can both arrive holding a reading from before either wrote, and `issuedAt >= rotatedAt` matches every successor minted from that instant onward — including one a later rotation has already delivered. Claiming first means a request whose reading has gone stale writes nothing at all, and it takes the row lock on the presented row before either request touches a successor, so the two serialise the same way round. The loser re-reads instead of guessing: the winner has already put the family back, and that is the answer both requests wanted.

Restoring the earlier token rather than issuing a fresh one is the part that matters. The family goes back to one live token, so a second holder that kept a copy is caught by the next rotation exactly as it would have been by the first, and the alarm above is untouched. The recovery only runs when something asks for it, though, and only a rotate call can: the frontend's `AUTH_ROTATION_RETRY_SECONDS` is what puts that ask on the far side of the grace window, and a request that arrives in between on any other route is refused.

A successor that comes into use between the probe that chose recovery and the transaction that carries it out puts the presented row back as it was and raises the alarm rather than refusing quietly. There is nothing later to catch it: the caller is `rotateSession`, its `invalid` sends the proxy to `/logout`, and that revokes the family under `reason: 'logout'` — a real second holder filed as somebody clicking Sign out.

The grace window (`AUTH_SESSION_ROTATION_GRACE_SECONDS`) exists because a request can already be in flight when the rotation lands, and signing that request's owner out would make rotation worse than the problem it fixes. Inside the window a stolen token also still works. Keep it short enough to stay a race window rather than a second session lifetime; boot refuses a value at or above the rotation interval, which would disable reuse detection entirely.

Rotation is not a renewal. The successor inherits its family's `expiresAt`, so `AUTH_SESSION_TTL_SECONDS` stays the absolute ceiling on a sign-in and one prune sweep clears the whole lineage.

That lineage is the reason the pruner has a knob it did not need before. A sign-in now owns up to `AUTH_SESSION_TTL_SECONDS / AUTH_SESSION_ROTATE_AFTER_SECONDS` rows instead of one, all expiring at the same instant, and superseded rows cannot be dropped early because reuse detection reads them. `AUTH_SESSION_PRUNE_MAX_BATCHES` is what has to move when the rotation interval does; leave it fixed and shortening the interval quietly outruns the sweep, which then reports the batch ceiling on every tick while the table grows.

Nothing in this repo rotates on a privilege change, because nothing here changes a privilege: `UserRole` is set at registration and no endpoint alters it. When you add one, end that user's sessions in the same transaction, and copy the shape of `AuthService.revokeSessionFamily`. A token minted under the old role otherwise stays live until its next rotation.

### The member's own sessions

`GET /auth/sessions` lists the live sign-ins on an account and `POST /auth/sessions/revoke-all` ends them, sparing the caller's when asked. Without those two, somebody who suspects their cookie has been copied has nothing to press, and a password-change endpoint would have nothing to call — changing a password while the thief's session stays live achieves nothing.

The listing is per family. A row is one token, so a browser signed in for a week owns a hundred-odd of them and a row listing would show one visitor as a hundred sessions. A live family has exactly one token that is unrotated, unrevoked and unexpired, so selecting those rows gives one entry per sign-in in a single indexed read.

`startedAt` is read from the family's first token. The current token was minted at the last rotation, so its `issuedAt` answers a different question, and `familyId` is the first token's `sessionId`, which makes the second read a plain `sessionId: { in: … }`. `lastSeenAt` is the current token's `firstUsedAt`, which lags an active browser by up to one rotation interval, and the DTO says so rather than presenting it as a live timestamp.

Nothing here records a device, an address, or a user agent. Those columns are what would make a row recognisable at a glance, and they are also a location history the account never asked anyone to keep. Storing them is a product decision, so the template leaves it open.

The revoke is one guarded write across every token of every affected family. Nothing may end a sign-in row by row, because a retired ancestor left unrevoked is what reuse detection reads, and a loop over `revokeSessionFamily` would spend a query per sign-in to reach the same place. One `auth.session.all_revoked` carries the counts; a `family_revoked` per sign-in would file one decision as five.

`keepCurrent` defaults to false, matching the route's name, and the account page sends true. Sparing a sign-in spares its family rather than its row: leave the ancestors revoked and the caller's next rotation reads its own family as dead.

Every route is placed deliberately on the guard ladder — pick the **strongest guard the endpoint's data warrants**:

| Endpoint type                        | Guard                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| Deliberately public (health)         | `@SkipApiSecret()` + a justification comment                    |
| Internal, pre-auth (register, login) | Global `ApiSecretGuard` (default) + a named throttler           |
| Requires login                       | `SessionGuard` (`src/auth/session.guard.ts`)                    |
| Requires verified email              | `VerifiedSessionGuard` (`src/auth/verified-session.guard.ts`)   |
| Admin internal (`/admin/internal`)   | `AdminApiKeyGuard` (`src/common/guards/admin-api-key.guard.ts`) |

Rules:

- The global `ApiSecretGuard` (`apps/backend/src/common/guards/api-secret.guard.ts`) rejects requests without the `x-api-secret` header using a constant-time comparison. `@SkipApiSecret()` is the only opt-out, reserved for deliberately public endpoints, and always carries a comment saying why.
- Guards establish invariants; services **re-check fail-closed invariants where a time-of-check/time-of-use window exists** — when the state a guard verified (an account's role, an active session, an undeleted row) can change between the guard running and the service writing, the service re-verifies it inside the write path rather than trusting the stale check.
- Secrets are compared in constant time (hash both sides, `crypto.timingSafeEqual`) — never `===` on secret material.

Why a ladder instead of ad-hoc checks: authorization strength becomes a single reviewable line on the route, and "which endpoints can an unverified account reach?" is answerable by grep.

---

## Gated Capabilities — Gate A and Gate B

Access to gated features is decided in a canonical order. Gate A is the in-memory capability gate served by the flag module (`apps/backend/src/flag/`); Gate B is any relational access check a feature needs (ownership, linkage, account state):

```txt
GATE A   not kill-switched  AND  feature flag on
         fail closed; rejected BEFORE any relational work
GATE B   the feature's relational access checks (ownership, account state)
         — WHERE-clause enforced

Proceed only if A AND B pass, in that order, before any DB lookup.
```

Why the order matters: Gate A is a pure in-memory decision (kill-switch snapshot → flag snapshot). Checking it first means a kill-switched or disabled capability is rejected **before any relational lookup can leak existence or relationship information** — and before we spend a query on it.

Rules:

- The **capability string is the single vocabulary** across kill-switches and flags (`auth.signup` style). One key, every check.
- Gate A is **fail-closed and total**: unknown flag → off, unknown capability → killed, any thrown error → deny. New flags and capabilities default **off**.
- Features never read flag or kill-switch state directly from the database — only through the flag module's `isKilled` / `isEnabled` (synchronous, TTL-cached, fail-closed). Relational access checks stay in the owning feature's WHERE clauses, never fetch-then-filter.
- Gate decisions are logged with event + reason (`kill_switch` / `flag_off`) — never payloads.

---

## Throttling

Every endpoint gets a **deliberate throttle decision**, recorded in the work's plan: either the global default is explicitly deemed sufficient, or the endpoint gets a named guard.

- The global `AppThrottlerGuard` (`apps/backend/src/common/guards/app-throttler.guard.ts`) applies 60 req/min per IP to everything and sets a `Retry-After` header on 429.
- State-changing or abuse-prone endpoints get a **named feature guard** extending `AppThrottlerGuard`, declaring explicit bucket name, limit, TTL, and tracker. Bucket names are kebab `<feature>-<action>`; storage keys are `<bucket>:<tracker>`.

The auth-phase guards set the precedent shape:

| Guard                          | Buckets                                    | Limits                      |
| ------------------------------ | ------------------------------------------ | --------------------------- |
| `LoginThrottlerGuard`          | per-IP **and** per-email-hash, independent | 10/min IP; 5/15 min email   |
| `SignupThrottlerGuard`         | per-IP                                     | 5/15 min                    |
| `ForgotPasswordThrottlerGuard` | per-IP and per-email-hash                  | 3/15 min IP; 5/15 min email |

Rules:

- **Independent buckets per abuse vector.** Login throttles IP and email separately — the email bucket is keyed alone so rotating IPs does not buy more guesses against one account.
- Tracker selection: authenticated endpoints key on the session `userId`; anonymous endpoints key on IP; pre-auth identity flows (login, password reset) additionally key on a **hashed** identifier — never the raw email.
- Throttled endpoints document 429 in OpenAPI, typed: `@ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })`, and send `Retry-After`.
- Throttle storage is in-process, so the env schema refuses `BACKEND_INSTANCE_COUNT > 1` and refuses `RATE_LIMITING_ENABLED=false` in staging/production. Single-instance is a known, enforced constraint until shared storage lands.

Why per-endpoint decisions: a single global number is either too loose for login or too tight for reads. Making the decision explicit in planning means "we forgot to think about abuse" stops being a failure mode.

---

## Prisma in the Service Layer

Schema, migration, and model rules live in `docs/charters/database-standards.md` and `docs/agents/database-standards.agents.md`. This section governs how services **use** Prisma.

### Explicit selects, always

Every read declares a projection constant; full rows are never fetched implicitly:

```typescript
const USER_PROFILE_SELECT = {
  userId: true,
  email: true,
  role: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;
```

Why: it bounds what can leak (new sensitive columns don't silently join responses), keeps payloads lean, and makes the query's cost visible in review.

### Authorization lives in the WHERE clause

Owner and access scoping is part of the query — `where: { userId, deletedAt: null }` — never a fetch-then-filter in JS. Why: filtering after the fetch reads rows the caller was never allowed to see; one bug between fetch and filter is a data leak. The database is the enforcement point.

### Soft-delete filters are explicit

There is no global soft-delete middleware. Every query touching a soft-deletable model carries `deletedAt: null` explicitly (and tests assert soft-deleted rows are invisible). Why: implicit middleware hides the rule and breaks the moment someone needs deleted rows (support tooling, admin); explicitness keeps every query auditable.

### Transactions for multi-step writes

Any write spanning multiple rows or tables runs in `this.prisma.$transaction(async (tx) => { … })` — e.g. superseding an active password-reset token while minting its replacement under a user-row lock. Mid-write failures must not strand partial state.

### Prisma errors become domain errors

Known Prisma errors (`P2002` unique violation, `P2025` not found) are caught **in the service** and mapped to typed domain errors — e.g. mapping `P2002` on the user email constraint to `EMAIL_ALREADY_REGISTERED`. Inspect the constraint target only when the model has more than one unique constraint; otherwise the code check suffices. Raw Prisma errors never escape to controllers.

### Keyset pagination, bounded reads

List endpoints paginate by cursor (keyset), never offset — cursors encode the `createdAt` + id boundary. Every list query has a bounded `take`. Why: offset pagination degrades linearly and skews under concurrent inserts; unbounded reads are a self-inflicted denial of service.

### Concurrency and idempotency

The database arbitrates races. Uniqueness and "exactly one active row" invariants are unique constraints (partial indexes where soft-delete applies), and the service treats `P2002` as the domain conflict signal — not a read-then-write check that races between the read and the write. IDs are `uuidv7()` generated at the service layer on every create.

---

## Query Security and Performance

- **Parameterized or nothing.** Prisma's named query methods are the default. Raw SQL is exceptional: only `$queryRaw` tagged templates (which parameterize interpolations), only with a comment justifying why the named API can't express it. `$queryRawUnsafe` and string-concatenated SQL are banned.
- **No N+1.** Never `await` a query per row in a loop — batch with `in` filters or nested selects. The review question for any loop is "how many queries does this issue?"
- **Index awareness.** A new filter or sort shape needs a supporting index — see Indexing Standards in `docs/charters/database-standards.md`. A query that works in dev against 100 rows is not evidence it works against 10 million.
- **The slow-query log is the feedback loop.** `PrismaService` logs queries over `LOG_SLOW_QUERY_THRESHOLD_MS` (default 500 ms). Treat its output as a defect to fix, not noise to filter.

---

## Observability

Logging is structured (`nestjs-pino`), configured in `apps/backend/src/common/logging/logger.config.ts`.

- Log events use names registered in `BACKEND_LOG_EVENTS` (`apps/backend/src/common/logging/log-events.ts`) — greppable vocabulary, not freeform strings. `console.log` does not exist in backend code.
- **Redaction is maintained, not assumed.** Two layers, and it matters which one you extend. `sanitizeLogRecord` (`packages/logging/src/log-redaction.ts`, installed as `formatters.log`) walks the record and redacts by **field name** at any depth — its `SENSITIVE_KEYWORDS` is where a new sensitive field belongs. `DEFAULT_REDACT_PATHS` in `logger.config.ts` is pino's path-matched layer covering auth headers, cookies, API secrets, admin keys, and request/response bodies — exact positions only. Introducing a new sensitive field means extending redaction in the same change, and proving it with a test against the sanitizer rather than by reading a list. Credentials, tokens, and PII are never logged.
- **Log decisions, not payloads.** Security denials — gate rejections, throttle blocks, guard failures — log event + reason. The body that was denied is exactly what must not be logged.
- Correlation: `RequestIdMiddleware` attaches/echoes `x-request-id`; `TraceIdInterceptor` and the exception filter surface `traceId` on responses and error bodies. Every log line is joinable to a request and a trace.
- Metrics and traces are OpenTelemetry, opt-in via env, with **cardinality guardrails**: metric attributes are coarse enums and opaque IDs only — never user IDs, emails, or free text (`apps/backend/src/common/telemetry/metrics.ts`).
- `/health` is the unauthenticated readiness probe (DB ping + version + uptime). Anything new a deployment depends on belongs in its checks.
- Slow queries log at the `LOG_SLOW_QUERY_THRESHOLD_MS` threshold (see Query Security and Performance).

Why: when something breaks at 3am, the question is "what happened to request X?" — structured events with correlation IDs answer it; prose logs and leaked tokens both fail you, in different ways.

---

## Configuration and Environment

`apps/backend/src/config/env.schema.ts` is the single source of truth for environment configuration, validated with zod **before** the app boots.

- Every new env var lands in the schema with a type, a default policy, and — where it guards safety — a production fail-closed refinement. Existing refinements set the bar: staging/production refuse `RATE_LIMITING_ENABLED=false` and refuse `BACKEND_INSTANCE_COUNT > 1`.
- Secrets never get production defaults. A missing secret fails the boot, loudly, at parse time — not at first use.
- Inside DI-managed code, configuration is read through the typed `ConfigService<Env>`. Direct `process.env` reads are reserved for pre-DI paths (`main.ts` bootstrap, telemetry init).
- New behavior toggles default **off**.

Why fail-closed at boot: a misconfigured instance that refuses to start is an incident you notice in deploy; one that starts permissive is an incident you notice in the news.

---

## Security Baseline

The cross-cutting floor, consolidated. Each rule's full treatment lives in its owning section:

- **Validate at the boundary** — whitelisted DTOs, `forbidNonWhitelisted` (DTO and Validation Standards).
- **Strong guard by default** — every route placed deliberately on the ladder; `@SkipApiSecret()` is justified or absent (Guard Ladder).
- **Fail closed** — gates, env refinements, and the test-database guard all deny on uncertainty (Gated Capabilities; Configuration).
- **Constant-time comparison** for secret material (`ApiSecretGuard` precedent).
- **Hash at rest** — session tokens SHA-256, passwords Argon2, one-time tokens hashed; see Sensitive Data Rules in `docs/charters/database-standards.md`.
- **Least exposure** — explicit selects in, hand-mapped DTOs out; nothing reaches the wire by accident (Prisma in the Service Layer; DTO Standards).
- **No existence oracles** — indistinguishable 404s for owner-scoped resources (Domain Errors).
- **Abuse is budgeted** — per-endpoint throttle decisions, independent buckets per vector (Throttling).
- **Secrets in env schema only** — never in code, never logged, redaction maintained (Configuration; Observability).
- **Transport hardening** — helmet on, cookies HttpOnly + SameSite, `TRUST_PROXY` explicit. CSRF tokens are deliberately not implemented today; the cookie posture plus the `x-api-secret` header is the current mitigation — confirm before changing this posture.

---

## Testing Backend Work

This section is the backend testing standard. The repo-wide testing charter (`docs/charters/testing.md`) is TBD; when it lands, it owns cross-cutting policy and this section defers to it.

Three layers, as configured in `apps/backend/jest.config.cjs`:

| Layer           | Location                             | Database                          |
| --------------- | ------------------------------------ | --------------------------------- |
| Unit / contract | `src/**/*.spec.ts`, `test/*.spec.ts` | None — pure logic, guards, config |
| Integration     | `test/*.integration.spec.ts`         | Real Postgres `llstack_test`      |
| Bootstrap e2e   | `test/app.e2e-spec.ts`               | Mocked Prisma; asserts app wiring |

Integration specs run against a real database on purpose — Prisma mocks cannot exercise constraints, transactions, or `P2002` mapping. The harness is non-negotiable: the fail-closed `apps/backend/test/helpers/test-database-url.ts` helper (refuses any database not named `*_test`), `maxWorkers: 1`, and `deleteMany` cleanup in `beforeEach`.

### Required coverage for new work

Every new or changed endpoint ships with tests covering the **scenario matrix**:

- the happy path;
- **every typed error code** the service can throw, each producing its mapped status;
- authorization behavior — the request is rejected without the required session / verification / role;
- throttle behavior where a named guard exists — 429 with `Retry-After`;
- an integration spec asserting the endpoint contract (status, body shape) against the real test database, including that soft-deleted rows are invisible where applicable.

Coverage is scenario-based and review-enforced — there is deliberately no numeric coverage threshold. "Comprehensive" means the matrix is complete, not that a percentage was hit by accident.

The verify ladder runs lint → build → typecheck → test against Node 24 + Postgres 16. Tests that pass locally but need an unmigrated schema will fail against a fresh database — run migrations against the test DB (`pnpm migrate`) before integration work.

Per `AGENTS.md`: never weaken, skip, or delete tests, lint rules, or types to make work pass.

---

## Planning Backend Work

Every non-trivial backend task starts with a written plan. The plan answers, explicitly:

1. **Contract impact** — endpoints, DTOs, and statuses touched; does the client need regenerating with `pnpm gen:client <domain>` (committed alongside this work — same PR is fine)?
2. **Guard ladder** — which guard each endpoint gets, and why that strength.
3. **Gating** — Gate A capability strings; Gate B relational checks; confirmed order A → B → relational work.
4. **Throttling** — named guard (bucket/limit/TTL/tracker) or an explicit "global default suffices".
5. **Data impact** — schema changes (→ database standards apply); query shapes and their supporting indexes.
6. **Error model** — the `<Feature>ErrorCode` members and their HTTP statuses.
7. **Test plan** — the scenario matrix, named.
8. **Rollout posture** — behind a default-off flag?
9. **Observability** — log events to register; metrics, if any, with low-cardinality attributes.
10. **Dependencies** — anything new needs approval first (`docs/charters/dependency-management.md`).

Why: these are exactly the questions the PR will be reviewed against — `docs/charters/pr-writing.md` § Backend Change-Impact Standard and § Backend Verification Matrix. A plan that answers them up front turns review findings into design decisions.

The canonical checklist form of this plan lives in `docs/agents/backend.agents.md` and applies to humans as much as agents.

---

## Background Work and Scheduling

`ScheduleModule` is global, but schedules are **registered dynamically via `SchedulerRegistry` inside env-gated services** — not `@Cron`/`@Interval` decorators at import time (see the note in `apps/backend/src/app.module.ts`). Future recurring jobs — expired-token cleanup, digest emails — follow the same pattern.

Why: decorator schedules run wherever the module loads — tests, one-off scripts, OpenAPI extraction. Dynamic, env-gated registration means a job runs only where it is explicitly enabled.

Rules for any scheduled or background job:

- **Idempotent** — safe to run twice; a crashed run leaves state the next run can finish.
- **Env-gated** — off by default, enabled per environment through the env schema.
- **Bounded** — batch with limits; no unbounded table scans.
- **Observable** — structured log events for start, finish, and failure, with counts.

---

## Definition of Done

Backend work is complete when all of these hold:

| Check                                                                                               | Where defined                                                    |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Scenario-matrix tests written and passing                                                           | Testing Backend Work                                             |
| Every endpoint's OpenAPI metadata complete (statuses, types, operationId)                           | API Contract Discipline                                          |
| Contract changed → client regenerated with `pnpm gen:client` and output committed (same PR is fine) | API Contract Discipline                                          |
| Touched module `CONTEXT.md` updated                                                                 | Module Anatomy                                                   |
| `pnpm verify:backend` (or `pnpm verify`) passes                                                     | `AGENTS.md` Validation                                           |
| Commit and PR follow the writing charters                                                           | `docs/charters/commit-writing.md`, `docs/charters/pr-writing.md` |
| New dependencies were approved and follow the dependency charter                                    | `docs/charters/dependency-management.md`                         |

Some absences in this charter are deliberate deferred decisions (no CSRF tokens, no numeric coverage threshold, in-process throttle storage) — confirm before "fixing" one.

---

For agents working on backend features, the rule-shaped checklist at `docs/agents/backend.agents.md` is the authoritative source — this charter exists for human readers.
