# Auth Module

Registration, login, logout, and the session machinery every authenticated
surface builds on. Simple by design: name + email + argon2id password + consent,
an opaque revocable session cookie, and nothing else (no email verification, no
password reset — those grow here later).

## Files

| File                               | Role                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `auth.controller.ts`               | `POST /auth/register` (201), `POST /auth/login` (200), `POST /auth/logout` (204) + `toAuthHttpException` |
| `auth.service.ts`                  | Prisma-owning logic: argon2id hashing, timing-equalized login, opaque token issue/validate/revoke        |
| `auth.errors.ts`                   | `AuthErrorCode` string-literal union + `AuthError`                                                       |
| `auth.types.ts`                    | Branded `UserId`/`SessionToken`, `Account`, `Session`, `SessionIssued`                                   |
| `session-cookie.service.ts`        | Reads/writes/clears the `llstack_session` cookie (httpOnly, lax, TTL from `AUTH_SESSION_TTL_SECONDS`)    |
| `session.guard.ts`                 | `SessionGuard` — validates the cookie, attaches `req.session`, clears dead cookies                       |
| `session-request.types.ts`         | `AuthenticatedRequest` shape guards stamp                                                                |
| `auth-register-throttler.guard.ts` | 5/hr per IP + 3/hr per email-hash buckets                                                                |
| `auth-login-throttler.guard.ts`    | 10/min per IP + 5/15min per email-hash buckets                                                           |
| `dto/`                             | Request DTOs + `AccountDto`/`toAccountDto`                                                               |

## Contracts

- Session tokens: 32 random bytes base64url, surfaced once; only the SHA-256
  hex hash is persisted (`sessions.token_hash`, `hash_version = 1`).
- `INVALID_CREDENTIALS` deliberately covers both unknown email and wrong
  password; the unknown-email path burns a dummy argon2 verify so the two are
  timing-indistinguishable (`dummyPasswordHashPromise`).
- Cookie name `llstack_session` is duplicated in
  `apps/frontend/lib/authentication/session-constants.ts` — the two tiers
  cannot share a constant; keep them in lockstep.
- Exported surface for other modules: `AuthService`, `SessionCookieService`,
  `SessionGuard` (import `AuthModule`, never this module's internals).
- Route/guard classification is pinned by `test/route-inventory.spec.ts`.

## Tests

`test/auth.service.spec.ts` (service contract), `test/auth.integration.spec.ts`
(HTTP statuses, cookies, throttles). Argon2 cost is dialed to spec minimums by
`test/helpers/app-module-test-env.ts`.
