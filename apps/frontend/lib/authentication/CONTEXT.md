# Context: apps/frontend/lib/authentication

## Purpose

- The session cookie: reading it, re-issuing it from the backend's `Set-Cookie`,
  clearing it, and validating it against the backend.
- Not the same as `lib/auth/`, which owns the separate **binding** token and the
  idle timeout that expires it. → `../auth/CONTEXT.md`

## Architecture

- `session-constants.ts` — `SESSION_COOKIE_NAME = 'llstack_session'`.
- `set-cookie.ts` — no `'server-only'` and nothing request-scoped, because
  `proxy.ts` imports it too and middleware has no `next/headers`.
  `parseSetCookieHeader`, `splitSetCookieString` (splitting a joined header
  safely around `Expires=` commas), and `readSessionSetCookie(header)`.
- `session-cookie.ts` — `'server-only'`.
  - `setSessionCookieFromUpstream(header)` — reads the session cookie out of the
    backend's `Set-Cookie` via `set-cookie.ts` and re-sets it on this app's jar
    with `httpOnly: true` and `secure` in production.
  - `getSession()` — the raw cookie value or `null`. Presence only, no network.
  - `clearSessionCookie()`.
- `get-server-session.ts` — `validateSession()` (aliased `getServerSession`):
  `React.cache` around a `cache: 'no-store'` call to `getCurrentUserForSession`.
  Returns `{ account } | null`. Null ONLY when the backend refused the session
  (401 + `SESSION_INVALID`); THROWS on a 5xx, a 429, or a bare 401, so an
  outage reaches the error boundary instead of the `/logout` redirect.

## Key Flows

- **Login/register:** action → gateway → backend `Set-Cookie` →
  `setSessionCookieFromUpstream` → `getSession()` → `setBindingCookies()` →
  redirect.
- **Guarding:** `(members)`/`(guest)` layouts and the dashboard page all call
  `validateSession()`; `React.cache` dedupes them within one render pass.
- **Logout:** `/logout` route handler 403s every cross-site request that is not a
  top-level navigation carrying a token this server minted for the session cookie
  the request arrives with (`logoutRedirectPath(sessionToken)` in
  `lib/auth/logout-token.ts`) before any await, then revokes via the gateway
  (best-effort) and calls `clearSessionCookie()` plus `clearBindingCookies()` and
  the log-session cookie. It reads the cookie name from `session-constants.ts`
  rather than the jar helpers here, so the guard pulls in nothing that touches
  cookies.
- **Rotation:** `proxy.ts` replaces this cookie mid-session when the backend
  re-issues the token, reading the same `Set-Cookie` through `set-cookie.ts`.
  Login and rotation are the two paths that write it, and they parse identically
  on purpose. → `../auth/CONTEXT.md`
- **Idle timeout:** the session cookie outlives the binding cookies by design
  (7 days against 8 hours). The binding pair lapsing is what ends an idle
  session, and it does so through `/logout` — see `../auth/CONTEXT.md`.

## Integrations

- `lib/gateway/users.ts` supplies the validated read; `lib/actions/action-wrapper`
  uses `getSession()` for `'light'` and `validateSession()` for `'full'`.
- The cookie name is duplicated in
  `apps/backend/src/auth/session-cookie.service.ts` — the two tiers cannot share
  a constant, so keep them in lockstep.
- The backend's `Max-Age` comes from the session's own `expiresAt`, not from
  `AUTH_SESSION_TTL_SECONDS`: a rotated session inherits its family's expiry, so
  a rotation must not push the cookie a full TTL further out than the row it
  stands for.

## Gotchas

- `cache: 'no-store'` is deliberate: **auth checks never come from a cache.**
  `React.cache` only dedupes within a single render pass.
- `getSession()` is presence, not proof. Anything that needs proof must call
  `validateSession()`.
- A stale/invalid session is sent to `/logout`, never straight to `/login` —
  otherwise the browser keeps a cookie nothing clears. The idle timeout takes
  the same route, and for the same reason.

## Agent Notes

- Do not add a "cached session" helper. If you need the account for display, use
  `getCurrentUserCached` from the gateway instead.
- Covered by `session-cookie.test.ts`.
