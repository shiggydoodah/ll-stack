# Context: apps/frontend/lib/authentication

## Purpose

- The session cookie: reading it, re-issuing it from the backend's `Set-Cookie`,
  clearing it, and validating it against the backend.
- Not the same as `lib/auth/`, which owns the separate **binding** token.

## Architecture

- `session-constants.ts` — `SESSION_COOKIE_NAME = 'llstack_session'`.
- `session-cookie.ts` — `'server-only'`.
  - `setSessionCookieFromUpstream(header)` — parses the backend's `Set-Cookie`
    (splitting a joined header safely around `Expires=` commas), picks the
    session cookie, and re-sets it on this app's jar with `httpOnly: true` and
    `secure` in production.
  - `getSession()` — the raw cookie value or `null`. Presence only, no network.
  - `clearSessionCookie()`.
- `get-server-session.ts` — `validateSession()` (aliased `getServerSession`):
  `React.cache` around a `cache: 'no-store'` call to `getCurrentUserForSession`.
  Returns `{ account } | null`.

## Key Flows

- **Login/register:** action → gateway → backend `Set-Cookie` →
  `setSessionCookieFromUpstream` → `getSession()` → mint binding cookie →
  redirect.
- **Guarding:** `(members)`/`(guest)` layouts and the dashboard page all call
  `validateSession()`; `React.cache` dedupes them within one render pass.
- **Logout:** `/logout` route handler revokes via the gateway (best-effort) then
  `clearSessionCookie()` plus the binding and log-session cookies.

## Integrations

- `lib/gateway/users.ts` supplies the validated read; `lib/actions/action-wrapper`
  uses `getSession()` for `'light'` and `validateSession()` for `'full'`.
- The cookie name is duplicated in
  `apps/backend/src/auth/session-cookie.service.ts` — the two tiers cannot share
  a constant, so keep them in lockstep.

## Gotchas

- `cache: 'no-store'` is deliberate: **auth checks never come from a cache.**
  `React.cache` only dedupes within a single render pass.
- `getSession()` is presence, not proof. Anything that needs proof must call
  `validateSession()`.
- A stale/invalid session is sent to `/logout`, never straight to `/login` —
  otherwise the browser keeps a cookie nothing clears.

## Agent Notes

- Do not add a "cached session" helper. If you need the account for display, use
  `getCurrentUserCached` from the gateway instead.
- Covered by `session-cookie.test.ts`.
