# Context: apps/frontend/lib/auth

## Purpose

- The session **binding** token: an HMAC over the session token, proving the
  browser holding the lax session cookie is the one the session was issued to.
- The **idle timeout**. The binding token's expiry is what signs an inactive
  user out, so this directory owns that clock.
- The **rotation schedule**: when `proxy.ts` should next ask the backend to
  re-issue the session token, and what to do with each answer.
- The **`/logout` redirect token**, which is how this app proves one of its own
  redirects into `/logout` is not another site firing the route at a visitor.
- Not `lib/authentication/`, which owns the session cookie itself.

## Architecture

- `constants.ts` — cookie names and the two env-read clocks. No `'server-only'`:
  `config/env.schema.ts` imports both defaults from here.
  - `COOKIE_NAME` — `__Host-bind` in production, `bind_dev` in dev.
    `SameSite=Strict`.
  - `ENTRY_COOKIE_NAME` — `__Host-bind-entry` / `bind_entry_dev`. `SameSite=Lax`.
  - `DEFAULT_IDLE_TIMEOUT_SECONDS = 28_800` (8 hours).
  - `getIdleTimeoutSeconds()` — `AUTH_IDLE_TIMEOUT_SECONDS`, or the default.
  - `DEFAULT_ROTATION_RETRY_SECONDS = 60`, `getRotationRetrySeconds()` —
    `AUTH_ROTATION_RETRY_SECONDS`, or the default.
- `binding.ts` — `'server-only'`. `createBindingToken(sessionToken, rotateAt)`
  and `readBindingToken(sessionToken, token)`, which returns
  `{ expiresAt, rotateAt }` or null. Format is `<hmac>.<expiry>.<rotateAt>`,
  HMAC SHA-256 over `<sessionToken>:<expiry>:<rotateAt>` keyed on
  `BINDING_SECRET`, compared with `timingSafeEqual`.
- `binding-cookies.ts` — `'server-only'`. The only module that knows the cookie
  **pair** exists: `setBindingCookies`, `clearBindingCookies`,
  `readBindingState`, and the `ROTATE_IMMEDIATELY` sentinel.
- `session-rotation.ts` — `'server-only'`. `requestSessionRotation(sessionToken)`
  wraps the gateway call and maps it to `rotated` / `not_due` / `superseded` /
  `signed_out` / `unavailable`.
- `logout-token.ts` — `'server-only'`. `createLogoutToken(sessionToken)`,
  `logoutRedirectPath(sessionToken)`, `verifyLogoutToken(sessionToken, token)`,
  and `LOGOUT_TOKEN_PARAM`. Format is `<hmac>.<expiry>`, HMAC SHA-256 over
  `logout:<sessionToken>:<expiry>` keyed on the same `BINDING_SECRET`, good for
  two minutes. The `logout:` prefix is the domain separator that stops a binding
  token ever verifying as one of these. The session token in the message is what
  makes a harvested token useless: `proxy.ts` mints one for ANY request carrying
  a session cookie without a matching binding, so a token nobody can forge is
  still a token anybody can be given.

## Two cookies, one token

The same token value is written to both cookies. They differ only in `SameSite`,
and each covers what the other cannot:

| Cookie              | SameSite | Sent on                                        |
| ------------------- | -------- | ---------------------------------------------- |
| `COOKIE_NAME`       | Strict   | Same-site requests only, any method            |
| `ENTRY_COOKIE_NAME` | Lax      | Also top-level cross-site GET/HEAD navigations |

`readBindingState` accepts the lax cookie only when `allowEntryCookie` is true,
which `proxy.ts` sets for GET and HEAD. A cross-site POST sends neither cookie,
so admitting the lax one there would not open a CSRF hole by SameSite's own
rules; it is withheld anyway to keep the strict cookie load-bearing on every
state-changing request.

## Clocks this app shares with the backend

| Clock                                 | Owner                          | Default | Means                                   |
| ------------------------------------- | ------------------------------ | ------- | --------------------------------------- |
| `AUTH_SESSION_TTL_SECONDS`            | backend `config/env.schema.ts` | 7 days  | Absolute ceiling on a session           |
| `AUTH_IDLE_TIMEOUT_SECONDS`           | this directory                 | 8 hours | Idle window inside it                   |
| `AUTH_SESSION_ROTATION_GRACE_SECONDS` | backend `config/env.schema.ts` | 60s     | How long a retired token still resolves |
| `AUTH_ROTATION_RETRY_SECONDS`         | this directory                 | 60s     | Back-off after an unanswered rotation   |

Neither app can read the other's env, so both couplings are held by convention
and documented in both `.env.example` files. `AUTH_IDLE_TIMEOUT_SECONDS` MUST
stay below the backend TTL — it is the clock interactive users meet.
`AUTH_ROTATION_RETRY_SECONDS` MUST stay at or below the backend's grace window,
for the reason under Gotchas.

The idle timeout is a CEILING, not an exact window. The roll below fires once the
binding is half spent, so the gap between a browser's last member request and its
lapse runs from half the configured value to all of it. Anything that navigates
picks up the hourly rotation's write and stays near the top of that range.

## The rotation deadline rides inside the binding token

The backend re-issues the session token on an interval it owns. This app is
never told what that interval is; it is told the next deadline in each answer,
and it stores that deadline in the binding token so the following requests know
not to ask.

Inside the HMAC, not in a cookie of its own: a browser that could move the
deadline forward could put off its own rotation indefinitely. `ROTATE_IMMEDIATELY`
(zero) is what a freshly signed-in browser carries — a deadline already passed,
so the first member request asks.

## Key Flows

- **Mint:** `app/actions/login.ts` and `app/actions/create-user.ts` call
  `setBindingCookies(jar, sessionToken, ROTATE_IMMEDIATELY)` after the session
  cookie is set.
- **Check:** `proxy.ts` calls `readBindingState` before admitting a member route.
  Null redirects to `logoutRedirectPath(sessionToken)`, which revokes the session
  backend-side. Every redirect of ours into `/logout` MUST go through that helper
  and MUST pass the session token the request arrived with — the route refuses a
  cross-site request without a token bound to that cookie, and a redirect chain
  that started at an external link arrives cross-site.
- **Rotate:** on GET and HEAD only, and only once the deadline has passed,
  `proxy.ts` calls `requestSessionRotation`. `rotated` writes the new session
  cookie, re-mints the binding over the new token, and rewrites the forwarded
  `cookie` header so this request's render uses it. `superseded` writes NOTHING.
  `signed_out` redirects to `/logout`. `unavailable` keeps the session and backs
  off `getRotationRetrySeconds()`.
- **Roll:** `setBindingCookies` runs when there is something to record — a
  rotation, a new deadline — or when the binding is past half its idle life. That
  roll is what makes the TTL an idle timeout rather than a fixed session length,
  and it happens on every method, POSTs included.
- **Clear:** `app/(public)/logout/route.ts` calls `clearBindingCookies(jar)`.

## Gotchas

- **`superseded` means write no cookie at all.** Another request rotated the same
  token and holds the successor. A binding minted here would be over the retired
  token, and arriving second it would leave the jar holding a session cookie and a
  binding that no longer agree — a forced sign-out on the next request.
- Rotation is asked for on **safe methods only**. A navigation's response is the
  one a browser is certain to process; a rotation landing anywhere else risks the
  new token never reaching the jar.
- **A rotation call this app could not complete is recovered, not punished** —
  the recovery runs on the first retry that lands AFTER the grace window closes.
  An unused successor proves there was only ever one holder, so the backend
  restores the presented token; inside the window it answers `superseded`, which
  writes nothing, so the proxy re-asks on each navigation until one crosses the
  boundary. `getRotationRetrySeconds()` MUST NOT exceed the backend's grace
  window: past the window only the rotate retry resolves the retired token, so a
  retry deadline still in the future leaves every render's backend call refused
  — a 401 the member layout turns into `/logout`, revoking the family before the
  recovery runs. A POST landing past the window before the next safe-method
  navigation is refused regardless; rotation rides safe methods only.
- **That recovery stops at this app's boundary.** `rotated` rewrites the
  forwarded `cookie` header, so the render behind this request spends the
  successor before the browser has received anything — which is what makes an
  unused successor mean "the rotation call never came back". A response lost
  between here and the browser therefore reads as token reuse backend-side and
  signs the visitor out on `auth.session.reuse_detected`. Leaving the render on
  the retired token would cover that case and would cost more elsewhere; the
  trade is set out in `SECURITY.md` and MUST NOT be changed on one side alone.
- A rotation call that fails **never signs anyone out**. Only a 401 carrying
  `SESSION_INVALID` does. The bare status is not enough — the backend's global
  `ApiSecretGuard` answers 401 on this route too, so a `BACKEND_API_SECRET` that
  is present but wrong would otherwise march every signed-in visitor through
  `/logout` and revoke their session on the way. The gateway caps the call at
  `ROTATE_SESSION_TIMEOUT_MS`, so a hung backend fails open rather than holding
  the navigation open in middleware.
- A lapsed binding **destroys the session**; it does not prompt for re-auth.
  That is deliberate, and it is why the idle timeout must be a length an
  ordinary user never reaches by accident.
- Both cookies carry one expiry, so the pair lapses together. An idle timeout
  cannot be sidestepped by arriving on a navigation.
- `getIdleTimeoutSeconds()` reads `process.env` directly rather than calling
  `getServerEnv()` — `proxy.ts` imports this module on every request and must
  not pull the whole env schema in behind it. `config/env.schema.ts` still owns
  and validates the variable, and `instrumentation.ts` parses it at boot.
- Read per call, never at module scope: `cacheComponents` renders part of this
  app at build time, and a module-scope read bakes the build environment's value
  into the bundle.
- `binding.ts` throws when `BINDING_SECRET` is unset. Callers establishing a
  session MUST clear it rather than leave a half-authenticated browser;
  `proxy.ts`'s roll is on an already-verified request, where a throw is correct.

## Agent Notes

- Adding a third writer of these cookies? Call `setBindingCookies`. MUST NOT
  write `COOKIE_NAME` or `ENTRY_COOKIE_NAME` directly — a writer that sets one
  cookie and not the other breaks cold entry or breaks CSRF, silently.
- MUST NOT pass `allowEntryCookie: true` for any method that changes state.
- Changing `DEFAULT_IDLE_TIMEOUT_SECONDS` means updating `.env.example`, this
  file, and `SECURITY.md` in the same change.
- Adding a fourth field to the binding token? It goes inside the HMAC, and
  `readBindingToken` MUST reject a token that does not carry it — a payload the
  signature does not cover is a payload the browser owns.
- Covered by `binding.test.ts`, `binding-cookies.test.ts`, `constants.test.ts`,
  `session-rotation.test.ts`, `logout-token.test.ts`, the member-route and
  `session rotation` cases in `apps/frontend/proxy.test.ts`, and end to end by
  `apps/testing/tests/auth-session-rotation.spec.ts` (which is why the harness
  has a second run with the backend's rotation interval compressed) and
  `auth-logout.spec.ts` (the cross-site entry the `/logout` token exists for).
- The two env readers live in `constants.ts` and are tested next to it, not in
  the modules that call them.
