# Auth Module

Registration, login, logout, the member's own view of where they are signed in,
and the session machinery every authenticated surface builds on. Simple by
design: name + email + argon2id password + consent, an opaque revocable session
cookie, and nothing else (no email verification, no password reset — those grow
here later).

## Files

| File                                      | Role                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.controller.ts`                      | `POST /auth/register` (201), `/auth/login` (200), `/auth/session/rotate` (200), `/auth/logout` (204), `GET /auth/sessions` (200), `POST /auth/sessions/revoke-all` (200) |
| `auth.service.ts`                         | Prisma-owning logic: argon2id hashing, rehash-on-login, timing-equalized login, opaque token issue/validate/rotate/revoke                                                |
| `auth.errors.ts`                          | `AuthErrorCode` string-literal union + `AuthError`                                                                                                                       |
| `auth.types.ts`                           | Branded `UserId`/`SessionToken`, `Account`, `Session`, `SessionIssued`, `SessionRotation`                                                                                |
| `session-cookie.service.ts`               | Reads/writes/clears the `llstack_session` cookie (httpOnly, lax, TTL from `AUTH_SESSION_TTL_SECONDS`)                                                                    |
| `session.guard.ts`                        | `SessionGuard` — validates the cookie, attaches `req.session`, clears dead cookies                                                                                       |
| `session-request.types.ts`                | `AuthenticatedRequest` shape guards stamp                                                                                                                                |
| `auth-register-throttler.guard.ts`        | 5/hr per IP + 3/hr per email-hash buckets                                                                                                                                |
| `auth-login-throttler.guard.ts`           | 10/min per IP + 5/15min per email-hash buckets                                                                                                                           |
| `auth-session-rotate-throttler.guard.ts`  | 10/min per session-token hash (IP only as an anonymous fallback)                                                                                                         |
| `auth-sessions-revoke-throttler.guard.ts` | 5/15min per signed-in user (IP only as a fallback that nothing legitimate takes)                                                                                         |
| `session-prune.service.ts`                | Interval-registered sweep deleting expired sessions (`SchedulerRegistry`, batched, env-gated)                                                                            |
| `dto/`                                    | Request DTOs + `AccountDto`/`toAccountDto`                                                                                                                               |

## Contracts

- Session tokens: 32 random bytes base64url, surfaced once; only the SHA-256
  hex hash is persisted (`sessions.token_hash`, `hash_version = 1`).
- Passwords are re-hashed on a successful login when the stored value is behind
  the current settings — `users.hash_version` for a change of scheme, and
  `argon2.needsRehash` for a change of `AUTH_ARGON2_*` cost, which the version
  column cannot see. That login is the only moment the plaintext exists, so
  without it a raised cost protects new accounts and nothing else. The write is
  guarded on the hash just verified, and a failure logs
  `auth.login.password_rehash_failed` and leaves the login standing.
- `INVALID_CREDENTIALS` deliberately covers both unknown email and wrong
  password; the unknown-email path burns a dummy argon2 verify so the two are
  timing-indistinguishable (`dummyPasswordHashPromise`).
- Cookie name `llstack_session` is duplicated in
  `apps/frontend/lib/authentication/session-constants.ts` — the two tiers
  cannot share a constant; keep them in lockstep.
- Exported surface for other modules: `AuthService`, `SessionCookieService`,
  `SessionGuard` (import `AuthModule`, never this module's internals).
- `getSession` resolves a token only when the session is unrotated, unrevoked,
  unexpired, AND its owner is not soft-deleted — all of it in the WHERE clause.
  Soft-deleting a user signs them out immediately; it is not left to the session TTL.
- `sessions` rows are hard-deleted once expired (`SessionPruneService`, hourly by
  default). Revoked-but-unexpired rows are left in place deliberately: the row is
  the record of the revocation, and it becomes prunable within the TTL anyway.
- One sweep deletes at most `AUTH_SESSION_PRUNE_MAX_BATCHES` ×
  `AUTH_SESSION_PRUNE_BATCH_SIZE` rows. Rotation multiplies rows per sign-in, so
  shortening `AUTH_SESSION_ROTATE_AFTER_SECONDS` MUST raise that ceiling with it;
  `system.session_prune.completed` warns when a sweep stops on it.
- Route/guard classification is pinned by `test/route-inventory.spec.ts`.

## Rotation and families

A `sessions` row is one TOKEN, not one sign-in. Every token a sign-in has held
shares a `familyId`, which the first token names after itself.

- `POST /auth/session/rotate` answers `rotated` (new token on `Set-Cookie`),
  `not_due`, or `superseded`, plus `nextRotationInSeconds` so the caller can
  schedule instead of poll. A dead session is a 401 carrying `SESSION_INVALID`.
  Callers MUST branch on that code, not on the status: the global `ApiSecretGuard`
  answers 401 on this route too.
- Rotation re-issues after `AUTH_SESSION_ROTATE_AFTER_SECONDS`. The successor
  inherits its family's `expiresAt`, so rotation is not a renewal and
  `AUTH_SESSION_TTL_SECONDS` stays the absolute ceiling.
- The claim is a guarded `updateMany` on `rotatedAt: null, revokedAt: null` inside
  a transaction: of two concurrent callers exactly one rotates, and the loser gets
  `superseded`. A family with two live tokens would leave the browser holding
  whichever cookie arrived last. A zero count is re-read before it is reported —
  `rotatedAt` refusing the write is `superseded`, `revokedAt` refusing it is
  `invalid`, and reporting the second as the first sends the caller on to render a
  page whose every backend call then 401s.
- A superseded token still resolves for `AUTH_SESSION_ROTATION_GRACE_SECONDS`,
  covering a request that was in flight when the rotation landed.
- Presented after that, it revokes the whole family and logs
  `auth.session.reuse_detected` only when the family is still live AND some token
  minted at or after its `rotatedAt` has a non-null `firstUsedAt`. That pair is
  what takes a second holder.
- A superseded token that is already revoked or expired is just a stale cookie and
  raises nothing. Nor does one whose successor was never used: that is a rotation
  whose answer never reached the FRONTEND, so `recoverUndeliveredRotation` clears
  the presented row's `rotatedAt`, revokes the successors nobody received, and logs
  `auth.session.rotation_response_lost`. The family is back to one live token and
  the next `rotateSession` re-runs the rotation that was lost. Un-retiring the
  presented row rather than minting a replacement is what keeps reuse detection
  able to catch a second holder on that next rotation.
- THE RECOVERY DOES NOT COVER A RESPONSE LOST BETWEEN THE FRONTEND AND THE
  BROWSER. `proxy.ts` forwards the successor into its own render, which always
  calls back here, so a successor the frontend received is stamped `firstUsedAt`
  before the browser sees anything — and the retired token presented afterwards
  reads as reuse. That is the cheaper of the two failures: leaving the render on
  the retired token would reduce `firstUsedAt` to "the browser has not come back
  yet", which lets a thief with a copied cookie jar get the victim's live
  successor revoked in silence. See `SECURITY.md`.
- ONLY `rotateSession` reaches that recovery (`resolveSession`'s
  `recoverLostRotation` option). `firstUsedAt: null` proves a successor was never
  PRESENTED, not never DELIVERED — a member render that makes no backend call
  leaves its successor unspent in the jar. Reachable from `getSession`, that gap
  recovers a copied token instead of raising the alarm; everything but the
  rotation retry takes the plain refusal.
- A successor that comes into use INSIDE the recovery transaction — between the
  `firstUsedAt` probe and the read that follows the claim — puts the presented
  row back and takes the reuse path (`reportSessionReuse`), not a quiet refusal.
  A refusal there reaches the caller as `invalid`, which sends the proxy to
  `/logout`, and the family is then revoked under `reason: 'logout'`; there is no
  later presentation to catch it.
- The recovery claims the presented row FIRST, guarded on the exact `rotatedAt`
  that was read, and only then revokes the successors. Revoking first let a
  request holding a stale reading revoke a successor a LATER rotation had already
  delivered — `issuedAt >= rotatedAt` matches every successor minted from that
  instant on. A claim that writes nothing re-reads the row and serves whatever the
  winner left, current or superseded inside its own grace window.
- `resolveSession` stamps `firstUsedAt` on the current row the first time it
  resolves, guarded on the column — one UPDATE per token, not per request.
- `logout` revokes the family, not the presented row, or a token retired minutes
  before the sign-out would still look live enough to raise that alarm. It logs
  `auth.session.family_revoked` with `reason: 'logout'` and nothing else — that
  event already carries the family and the row count.
- NO ROUTE HERE ROTATES ON A PRIVILEGE CHANGE, because nothing in this template
  changes one. `revokeSessionFamily` is the hook — see `docs/charters/backend.md`.
- The caller is `apps/frontend/proxy.ts`, which is the only place in that app that
  runs on every member request and can still write cookies.

## The member's own sessions

- `GET /auth/sessions` (`SessionGuard`) lists live sign-ins, ONE PER FAMILY. A
  live family has exactly one token that is unrotated, unrevoked and unexpired,
  so selecting those rows is the per-sign-in listing in one indexed read. A row
  listing would show a week-old browser as a hundred-odd sessions.
- Ordering rides on `familyId`: it is the root token's `sessionId` and therefore
  a uuidv7, whose leading bytes are a timestamp. Sorting on it descending sorts
  by when each sign-in began, using a column the first query already has.
- `startedAt` comes from a second read of the family roots
  (`sessionId: { in: … }`), because the current token's `issuedAt` is when the
  TOKEN was minted. A family shares one `expiresAt` and the pruner only deletes
  expired rows, so a live family's root is always still there; the fallback to
  the current token's own `issuedAt` covers a state nothing produces and reads
  late rather than absurd.
- `lastSeenAt` is the current token's `firstUsedAt`, which is accurate to within
  one `AUTH_SESSION_ROTATE_AFTER_SECONDS`. The DTO says so; do not present it as
  a live "last request" timestamp.
- Bounded at 20 with `truncated` in the response rather than a cursor contract —
  one person's live sign-ins are few, and the account page should not carry a
  paging contract for it. The listing marks the caller's own entry rather than
  filtering it out.
- NO DEVICE, IP, OR USER-AGENT COLUMN, and none should be added here. Storing
  them is a product decision with a privacy cost, and the template does not make
  it for whoever clones it.
- `POST /auth/sessions/revoke-all` (`SessionGuard`, then
  `AuthSessionsRevokeThrottlerGuard` — the bucket is keyed on the user, who only
  exists once the guard has attached the session) ends every live sign-in.
  `keepCurrent` defaults to FALSE because the route is named revoke-all; the
  account page sends true. When it is false the controller clears the cookie,
  since the caller's own token is among the revoked.
- The revoke is one `updateMany` over every token of every affected family, not
  a loop over `revokeSessionFamily`: same outcome — nothing may end a sign-in row
  by row, a retired ancestor left unrevoked is what reuse detection reads —
  without a query per family. It logs one `auth.session.all_revoked` carrying the
  sign-in and row counts; a `family_revoked` per sign-in would file one decision
  as five.
- `keepCurrent` spares the FAMILY behind the presented session, not its row.
  Sparing one row would leave the caller holding a token whose ancestors were
  just revoked, and its next rotation would read its own family as dead. A
  session id that no longer resolves is refused with `SESSION_INVALID` rather
  than falling through to revoking everything — the caller asked to keep
  something.

## Tests

`test/auth.service.spec.ts` (service contract, including the rotation and
reuse-detection matrix, the rehash-on-login cases, and the session listing and
bulk revoke), `test/auth.integration.spec.ts` (HTTP statuses, cookies,
throttles), `test/session-prune.integration.spec.ts` (sweep behaviour and timer
registration), `apps/testing/tests/auth-sessions.spec.ts` (the account page's
listing and "sign out other sessions", driven through two browser contexts).
Argon2 cost is dialed to spec minimums by `test/helpers/app-module-test-env.ts`,
which is also what the rehash cases compare against.
