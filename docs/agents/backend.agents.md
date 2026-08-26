# Backend Development for Agents

This runbook is the authoritative rule set for building, editing, or planning features in `apps/backend` — endpoints, modules, services, guards, DTOs, gating, throttling, config, observability, and backend tests.

Human-readable rationale lives at `docs/charters/backend.md`. This file is the rule-shaped enforcement layer. If the two ever disagree, the charter is the source of truth — open a PR to reconcile.

The backend ships the health module, the platform infrastructure, and the auth/users/dashboard modules referenced as examples throughout this file — these rules bind on all of them. Backend work is not complete until `pnpm verify:backend` (or `pnpm verify`) passes.

---

## When to Read This File

Read this file before any of:

- adding or changing an endpoint (controller route) in `apps/backend`
- creating a new feature module under `apps/backend/src`
- editing a backend service, guard, interceptor, filter, middleware, or DTO
- adding or changing domain error codes, error responses, or HTTP status mapping
- adding or changing throttling, gating (flags / kill-switches), or auth/session behavior
- adding or changing backend env vars, logging, metrics, or scheduled jobs
- planning any of the above

This file does **not** apply to:

- pure Prisma schema or migration work — that is `docs/agents/database-standards.agents.md`. Service code that calls Prisma follows **both** files.
- frontend work — `docs/agents/frontend.agents.md`
- generated client internals under `packages/services` — never hand-edited

If your task touches none of these, this file does not apply.

---

## Non-Negotiable Rules

### Module structure

- MUST create one module per feature directly under `apps/backend/src/<feature>/`, following the standard file split: `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `.types.ts`, `<feature>.errors.ts`, `dto/`, optional `<feature>-<action>-throttler.guard.ts`, `CONTEXT.md`.
- MUST update the module's `CONTEXT.md` when its shape, ownership, or contracts change.
- MUST NOT import another feature's internals. Share via `src/common` or a port (injection token + interface in `.types.ts`); keep the module graph acyclic.
- MUST NOT introduce a repository/DAO layer between services and Prisma.

### Layering

- Controllers MUST contain only routing, guards, DTO validation, response mapping, and domain-error → HTTP mapping. No business logic, no Prisma calls.
- Services MUST own business logic and Prisma calls; MUST NOT throw `HttpException` or import from `@nestjs/swagger`.
- Controllers MUST map domain errors through an exhaustive `to<Feature>HttpException` switch over the code union.
- Responses MUST be hand-mapped via pure `to<TypeName>` functions; MUST NOT return Prisma rows from controllers; MUST NOT add `ClassSerializerInterceptor`.
- External providers (email, storage) MUST sit behind a port with the adapter bound in the module.

### TypeScript

- MUST NOT use `any` (repo-wide, `AGENTS.md`).
- MUST declare explicit return types on exported controller and service methods.
- Closed value sets — including error codes — MUST be string-literal unions. MUST NOT add TypeScript enums for closed value sets.
- MUST use `satisfies Prisma.<Model>Select` for query projection constants.
- MUST NOT use non-null assertions or broad casts to silence strict checks.

### DTOs and validation

- Request bodies, params, and query strings MUST be validated through class-validator DTO classes in the module's `dto/` folder.
- Optional fields MUST use `@ValidateIf((o) => o.field !== undefined)` plus validators; MUST NOT use `@IsOptional` (it admits explicit `null`).
- MUST normalize at the boundary with `@Transform` and validate nested DTOs with `@Type`.
- MUST NOT weaken the global ValidationPipe (`transform`, `whitelist`, `forbidNonWhitelisted`).
- Every DTO field MUST carry `@ApiProperty` / `@ApiPropertyOptional` with accurate type, format, enum, and nullability.

### API contract

- Every endpoint MUST have a stable explicit operationId and document its success status plus **every reachable error status** — including 401/403 from its guards, 404, 409, and 429 — typed with `ApiErrorResponseDto`.
- **The 500 is nobody's status, so every controller publishes it.** `HttpExceptionFilter` normalizes any unhandled failure — a global guard's, an interceptor's, a service's, a controller's — to 500, so one is reachable from every route without any of them declaring it. Every controller MUST therefore carry a **class-level** `@ApiInternalErrorResponse()` (`src/common/filters/api-internal-error-response.decorator.ts`). Class level, not per route, is what stops a new route on an existing controller from forgetting it.
  - MUST NOT omit it on the grounds that a handler cannot throw: an omission and a deliberate absence are indistinguishable in a published contract. A route whose own body has no throwing path (`/health`) still publishes the status and uses the decorator's `note` to say what is **not** a 500 — a database outage on `/health` is a 200 carrying `status: "degraded"`.
- A contract change MUST regenerate the affected client(s) with `pnpm gen:client <domain>…` and commit the output — it may ship in the same PR as the contract change and any other backend/frontend work (see **Client generation** below).
- MUST NOT hand-edit generated output under `packages/services`; new tags follow `packages/services/CONTEXT.md`.
- MUST NOT expose `admin-internal` endpoints to client generation.

### Client generation

The frontend consumes the backend only through generated `@repo/services` clients.

- Any contract change MUST regenerate the affected client(s) with `pnpm gen:client [<domain>…]` and commit the output. It may ship in the same PR as the contract change, alongside any other backend or frontend work that consumes it — PRs are not required to isolate generated output into its own PR.
- **Optional smoke test** with `pnpm gen:client --dry-run <domain>`: it generates into a git-ignored `.temp/services-gen/` dir so you can confirm the contract generates cleanly without touching tracked files first. A brand-new domain has no committed `hey-api.ts` runtime config yet, so its generated imports stay unresolved until the manifest + exports entry (see below) is added — that is expected for a smoke test.
- MUST NOT hand-edit generated output under `packages/services`; a new tag needs a manifest + exports entry per `packages/services/CONTEXT.md`.
- **Exception — tags in `IGNORED_TAGS` need no client generation at all.** `IGNORED_TAGS` in `packages/services/scripts/domain-manifest.ts` lists backend tags that must never be generated or exported — surfaces with no in-repo consumer. MUST NOT move such a tag into `DOMAIN_MANIFEST` for consistency's sake — that ships a client for an API with no in-repo caller, which reads as a supported internal contract.
- **This is enforced, not just documented.** `pnpm --filter @repo/services check:drift` (`packages/services/scripts/check-client-drift.ts`, wired into `pnpm verify` and `pnpm verify:backend`) hashes the currently-served OpenAPI document per domain the same way `gen:client` does and fails, naming the domain and the `pnpm gen:client <domain>` to run, when it disagrees with the committed `.source-hash`. A skipped generation reds the build instead of surfacing when a reviewer diffs a dry run by hand.

| Command                               | Purpose                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm gen:client`                     | Regenerate all domains.                                                                                                     |
| `pnpm gen:client <domain>…`           | Regenerate only the named domain(s).                                                                                        |
| `pnpm gen:client --list`              | Pick domains from an interactive multi-select list.                                                                         |
| `pnpm gen:client --dry-run <domain>…` | Optional smoke test into git-ignored `.temp/` (no tracked-file impact); does not replace committing the regenerated output. |
| `pnpm gen:client --force …`           | Ignore the per-domain source-hash cache.                                                                                    |

### Errors

- New domain errors MUST live in `<feature>.errors.ts` as a string-literal `<Feature>ErrorCode` union plus a `<Feature>Error` class carrying `code`.
- Error responses MUST flow through the global `HttpExceptionFilter` shape `{ statusCode, error, message, path, timestamp, traceId }`; MUST NOT invent ad-hoc error bodies.
- MUST NOT surface internals in 5xx responses — the filter masks them; keep it that way.
- Owner-scoped lookups MUST return one indistinguishable 404 for nonexistent, soft-deleted, and not-owned rows.

### Auth and gating

- Every route MUST be deliberately placed on the guard ladder — choose the strongest guard the data warrants:

  | Endpoint type                        | Guard                                               |
  | ------------------------------------ | --------------------------------------------------- |
  | Deliberately public (health)         | `@SkipApiSecret()` + justification comment          |
  | Internal, pre-auth (register, login) | global `ApiSecretGuard` (default) + named throttler |
  | Requires login                       | `SessionGuard`                                      |
  | Requires verified email              | `VerifiedSessionGuard`                              |
  | Admin internal (`/admin/internal`)   | `AdminApiKeyGuard`                                  |

- MUST NOT use `@SkipApiSecret()` except on deliberately public endpoints, with a justification comment.
- **The route inventory snapshot is the enforcement, and changing it is a security review.** `apps/backend/test/route-inventory.spec.ts` records every registered route, whether it carries `SkipApiSecret`, and the names of its `@UseGuards`. Opening an unauthenticated route therefore requires editing a checked-in snapshot. Any PR whose diff touches that snapshot MUST state in its description which route changed classification and why. Without this the rules above are aspirational — enforced only by a reviewer noticing.
- Capability-gated actions MUST check Gate A (kill-switch + flag, via the flag module's `isKilled` / `isEnabled`) before Gate B (the feature's relational access checks) before any relational lookup — no exceptions.
- MUST NOT read feature flag or kill-switch state directly from the database in feature code — only through the flag module.
- Gate decisions MUST fail closed (any error → deny); new flags and capabilities MUST default off.
- Relational access checks (ownership, linkage) MUST live in the query's WHERE clause, not fetch-then-filter.
- Secret comparisons MUST be constant-time (see `api-secret.guard.ts`); MUST NOT compare secret material with `===`.
- A `sessions` row is one TOKEN, not one sign-in: rotation supersedes a row and inserts its successor with the same `familyId`. Anything that ends a session MUST act on the family (`revokeSessionFamily`), not on the presented row — a retired ancestor left unrevoked is what the reuse alarm reads.
- A superseded token presented outside `AUTH_SESSION_ROTATION_GRACE_SECONDS` MUST revoke the family and log `auth.session.reuse_detected` ONLY when its family is still live AND some token in that family minted at or after its `rotatedAt` carries a non-null `firstUsedAt`. An already-revoked or expired row is a stale cookie after a sign-out and MUST raise nothing. An alarm on either is noise on a normal path, and a noisy alarm gets muted.
- A live family whose successors were NEVER used is a rotation whose answer never reached the FRONTEND, and MUST be recovered rather than refused (`recoverUndeliveredRotation`: clear the presented row's `rotatedAt`, revoke the undelivered successors, log `auth.session.rotation_response_lost`). Refusing it ends the session on an aborted rotation call, because the successor's raw value existed only in the response that was lost. MUST restore the presented token rather than mint a replacement — a fresh token settles the family in favour of whoever asked first, while restoring it lets the next rotation catch a second holder the way the lost one would have.
- The recovery covers the FRONTEND not receiving the answer, NOT the browser not receiving the response. `proxy.ts` forwards the successor into its own render, which always calls back here, so a successor the frontend received is stamped before the browser sees anything and a response dropped after that reads as reuse. MUST NOT "fix" this by having the render keep the retired token: that reduces `firstUsedAt` to "the browser has not come back yet", and a thief holding a copied cookie jar then gets the victim's live successor revoked with no alarm. Docs that describe the recovery MUST say frontend, not browser.
- A successor that comes into use INSIDE the recovery transaction MUST restore the presented row's `rotatedAt` and take the reuse path (`reportSessionReuse`), NOT return a quiet refusal. A refusal reaches `rotateSession` as `invalid`, which sends the proxy to `/logout`, and the family is then revoked under `reason: 'logout'` — the one event operators are told to page on, filed as an ordinary sign-out. There is no later presentation to catch it.
- Recovery MUST be reachable ONLY from `rotateSession` (`resolveSession`'s `recoverLostRotation` option). `firstUsedAt: null` proves a successor was never PRESENTED, not that it was never DELIVERED, and only the frontend's forwarding closes that gap today — a member page added there that renders without calling the backend would leave its successor unspent in the jar until the next navigation. Reachable from `getSession`, that gap recovers a COPIED token instead of firing `auth.session.reuse_detected`. Every other caller MUST take the plain refusal.
- Recovery MUST claim the presented row BEFORE revoking any successor, with `updateMany` guarded on the exact `rotatedAt` value that was read (`{ sessionId, rotatedAt, revokedAt: null }`). Revoking first lets a request holding a stale reading revoke a successor a LATER rotation already delivered, because `issuedAt >= rotatedAt` matches every successor minted from that instant onward. A claim that writes nothing MUST re-read the row and serve whatever the winner left (current, or superseded inside its own grace window) rather than returning `invalid` — the racer is holding a token that is now fine.
- A rotation claim that writes nothing MUST re-read the row before reporting the outcome. `rotatedAt` refusing the write is `superseded`; `revokedAt` refusing it is `invalid`. Reporting the second as the first tells the caller to carry on with a session that has just ended.
- Any path that resolves a live current token MUST stamp `firstUsedAt` once, guarded on the column so it costs one UPDATE per token rather than one per request. Reuse detection reads it; a successor that is never marked used makes its parent's late presentation indistinguishable from a lost rotation response.
- A rotation MUST claim its predecessor with a guarded `updateMany` on `rotatedAt: null, revokedAt: null` inside the transaction that creates the successor. Two live tokens in one family leaves the browser holding whichever cookie arrived last.
- Shortening `AUTH_SESSION_ROTATE_AFTER_SECONDS` MUST come with a matching rise in `AUTH_SESSION_PRUNE_MAX_BATCHES`. Rotation turns one sign-in into up to `AUTH_SESSION_TTL_SECONDS / AUTH_SESSION_ROTATE_AFTER_SECONDS` rows that all expire together, superseded rows cannot be pruned early (reuse detection reads them), and a sweep that stops on its batch ceiling every tick means the table is growing.
- A successor MUST inherit its family's `expiresAt`. Rotation is not renewal; `AUTH_SESSION_TTL_SECONDS` is the absolute ceiling and the whole family must stay prunable in one sweep.
- Any endpoint that changes what a user may do MUST end that user's sessions in the same transaction. There is no such endpoint today — nothing here changes `UserRole` — so this binds on the first one added.
- A listing of a member's own sign-ins MUST return one entry per FAMILY, not one per `sessions` row: a row is one token, so a week-old browser is a hundred-odd of them and a row listing reads as a hundred sessions. MUST NOT add a device, address, or user-agent column to make a row recognisable — that is a location history, and whether to keep one is the cloner's decision, not the template's.
- Bulk session revocation MUST be one guarded write across every token of every affected family, and MUST log ONE event carrying the counts. A loop over `revokeSessionFamily` spends a query per sign-in and files one decision as many.
- Sparing a session from a bulk revoke MUST spare its whole FAMILY. Leaving the ancestors revoked makes the spared token's next rotation read its own family as dead. A `keepSessionId` that no longer resolves MUST be refused, NOT treated as "keep nothing" — the caller asked to keep something.
- `login` MUST re-hash a verified password whose stored `hashVersion` names an older scheme OR whose embedded argon2 parameters no longer match `AUTH_ARGON2_*` (`argon2.needsRehash`). Both checks, not one: `needsRehash` cannot see a change of scheme and the version column does not move when only the cost does. The update MUST be guarded on the hash just verified, and a failure MUST be logged and swallowed — the credential check has already passed, so an escaping write error turns a correct sign-in into a 500.

### Throttling

- Every new endpoint MUST have a recorded throttle decision: a named guard, or an explicit statement that the global 60 req/min default suffices.
- State-changing or abuse-prone endpoints MUST get a named guard extending `AppThrottlerGuard` with explicit bucket name (kebab `<feature>-<action>`), limit, TTL, and tracker; storage keys are `<bucket>:<tracker>`.
- Distinct abuse vectors MUST get independent buckets (e.g. a login throttler: per-IP and per-email-hash).
- Trackers: session `userId` when authenticated; IP when anonymous; hashed identifier (never raw email) for pre-auth identity flows.
- Throttled endpoints MUST send `Retry-After` on 429 and document it via `@ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })`.

### Prisma usage in services

Schema and migration rules are in `docs/agents/database-standards.agents.md`. These rules govern usage:

- Every read MUST use an explicit `select` projection constant; MUST NOT fetch implicit full rows.
- Authorization scope (owner / visibility) MUST be in the query's WHERE clause; MUST NOT fetch-then-filter in JS.
- Every query touching a soft-deletable model MUST filter `deletedAt: null` explicitly.
- Multi-row or multi-step writes MUST use `$transaction`.
- MUST map known Prisma errors (`P2002`, `P2025`) to typed domain errors in the service; raw Prisma errors MUST NOT escape to controllers. Inspect the constraint target only when the model has multiple unique constraints.
- List endpoints MUST use keyset/cursor pagination with a bounded `take`; MUST NOT use offset pagination.
- IDs MUST be generated at the service layer with `uuidv7()` on every create/upsert.
- MUST NOT use `$queryRawUnsafe` or string-built SQL; raw SQL only as parameterized `$queryRaw` tagged templates with a justifying comment.
- MUST NOT issue per-row queries in loops — batch with `in` filters or nested selects; new filter/sort shapes need a supporting index.

### Config and env

- New env vars MUST be declared in `apps/backend/src/config/env.schema.ts` with a type, default policy, and production fail-closed refinement where safety-relevant; MUST NOT read undeclared env vars.
- DI-managed code MUST read config via typed `ConfigService<Env>`; `process.env` only in pre-DI paths (`main.ts`, telemetry init).
- MUST NOT hardcode secrets or give secrets production defaults; new behavior toggles MUST default off.

### Logging and observability

- MUST log through the structured pino logger using event names registered in `BACKEND_LOG_EVENTS` (`src/common/logging/log-events.ts`); MUST NOT use `console.log`.
- MUST NOT log credentials, tokens, cookies, auth headers, signed URLs, or PII; introducing a new sensitive field MUST extend the redaction config in the same change — the field name goes in `SENSITIVE_KEYWORDS` (`packages/logging/src/log-redaction.ts`), the deep sanitizer installed as `formatters.log` in `src/common/logging/logger.config.ts`. `DEFAULT_REDACT_PATHS` in that same file is pino's exact-path layer and matches only at the position written, so it is a second layer, never the only one. The extension MUST be pinned by a test that runs the real sanitizer.
- Security denials (gate rejections, throttle blocks, guard failures) MUST be logged with event + reason — never request payloads.
- New metrics MUST use coarse, low-cardinality attributes (enums, opaque IDs); MUST NOT include user IDs, emails, or free text.
- Scheduled/background jobs MUST be idempotent, env-gated, bounded (batched), and registered dynamically via `SchedulerRegistry` — MUST NOT use `@Cron`/`@Interval` decorators (see `app.module.ts`).

### Testing

- New or changed endpoint work MUST include unit/contract specs for service logic AND an integration spec (`test/*.integration.spec.ts`) asserting the endpoint contract against the real test database.
- Coverage MUST include the scenario matrix: happy path, **every typed error code**, authz rejection (without required session/verification/role), and — where a named throttler exists — 429 with `Retry-After`.
- Integration specs MUST go through the fail-closed `test/helpers/test-database-url.ts` helper and clean up via `deleteMany` in `beforeEach`; MUST NOT target a non-`*_test` database.
- MUST NOT weaken, skip, or delete existing tests, lint rules, or types to make work pass (`AGENTS.md`).

### Workflow

- Non-trivial backend work MUST start with the planning checklist below, answered in writing.
- PRs with backend scope MUST include the Backend Change-Impact Standard and Backend Verification Matrix sections from `docs/charters/pr-writing.md`.
- Backend work is not complete until `pnpm verify:backend` (or `pnpm verify`) passes.

---

## Checklist — Planning a Backend Feature

- [ ] Contract impact listed: endpoints, DTOs, statuses; if the client needs regenerating, plan the `pnpm gen:client <domain>` run and commit its output alongside this work.
- [ ] Guard ladder chosen per endpoint (table above) and justified.
- [ ] Gate A capability string(s) named; Gate B relational checks identified; order confirmed (A → B → relational work).
- [ ] Throttle decision per endpoint: named guard (bucket/limit/TTL/tracker) or documented global default.
- [ ] Error model drafted: `<Feature>ErrorCode` members + HTTP statuses.
- [ ] Data impact: schema changes? → `docs/agents/database-standards.agents.md` applies; query shapes + supporting indexes identified.
- [ ] Test plan covers the scenario matrix: happy path, every error code, authz, throttle.
- [ ] Rollout posture: behind a default-off flag?
- [ ] Observability: log events to register; metrics (low-cardinality) if any.
- [ ] New dependencies? → approval required + `docs/agents/dependency-management.agents.md`.

---

## Checklist — Adding or Changing an Endpoint

- [ ] Route on the correct guard(s); `@SkipApiSecret()` only with a justification comment.
- [ ] Capability-gated? Gate A before Gate B before relational work.
- [ ] Request/param/query DTOs with class-validator; optionals via `@ValidateIf(… !== undefined)`.
- [ ] Response DTO hand-mapped; no Prisma rows returned.
- [ ] Throttle decision implemented; 429 typed if a named guard applies.
- [ ] Every reachable status documented with types; stable operationId.
- [ ] Controller publishes its 500 — class-level `@ApiInternalErrorResponse()`.
- [ ] Service throws typed domain errors; controller maps them exhaustively.
- [ ] Queries: explicit `select`, authz scope in WHERE, `deletedAt: null`, `$transaction` for multi-step writes, cursor pagination.
- [ ] Unit specs + integration spec added per the scenario matrix.
- [ ] Contract changed? → `pnpm gen:client <domain>` regenerated and the output committed (same PR is fine).
- [ ] Module `CONTEXT.md` updated if shape or contracts changed.
- [ ] `pnpm verify:backend` passes.

---

## Checklist — Adding a New Feature Module

- [ ] Folder at `apps/backend/src/<feature>/` with the standard file split.
- [ ] Module registered in `AppModule`.
- [ ] `<feature>.errors.ts` with a string-literal code union + error class.
- [ ] No cross-feature imports; external providers behind ports.
- [ ] `CONTEXT.md` created for the module.
- [ ] App boots (DI wiring resolves) — covered by tests or a local boot.
- [ ] Planning and endpoint checklists applied to its routes.
- [ ] `pnpm verify:backend` passes.

---

## Validation Commands

```bash
pnpm verify:backend                  # prisma:lint + lint + build + typecheck + test (backend-filtered)
pnpm --filter @repo/backend test     # targeted: unit + integration (needs the test Postgres)
pnpm --filter @repo/backend typecheck
pnpm --filter @repo/backend lint
pnpm gen:client --dry-run <domain>   # optional smoke-test generation into git-ignored .temp/ (no tracked-file impact)
pnpm gen:client [<domain>…]          # regenerate client — commit alongside the contract change, same PR is fine
pnpm verify                          # full repo chain before reporting complete
```

Do not weaken validation, lint rules, types, or tests to make backend work pass. If a rule blocks a legitimate exception, document the exception in the charter via PR — do not delete the rule.

---

## Cross-References

- Human-readable charter: `docs/charters/backend.md`
- Repo-wide non-negotiables: `AGENTS.md`
- Schema and migration rules: `docs/agents/database-standards.agents.md` (charter: `docs/charters/database-standards.md`)
- PR requirements (Change-Impact Standard, Verification Matrix): `docs/charters/pr-writing.md`
- Backend source map: `apps/backend/src/CONTEXT.md`
- Generated clients: `packages/services/CONTEXT.md`
- Dependency changes: `docs/agents/dependency-management.agents.md`
