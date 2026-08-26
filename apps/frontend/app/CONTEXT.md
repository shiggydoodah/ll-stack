# Context: apps/frontend/app

## Purpose

- The App Router tree: route groups, layouts, pages, error boundaries, the
  logout route handler, the client-log ingest endpoint, and the shared server
  actions.

## Architecture

```
app/
  layout.tsx            root shell: <html data-theme>, LoggingProvider, nonce boundary
  error.tsx             root error boundary        global-error.tsx  root-layout failures
  not-found.tsx         404 screen                 globals.css       @repo/ui styles + theme
  (public)/
    error.tsx           public-group boundary
    logout/route.ts     GET handler: refuse cross-site, revoke, clear auth cookies, redirect
    (guest)/
      layout.tsx        redirects a signed-in visitor to /dashboard (instant = false)
      page.tsx          marketing/home
      login/            page.tsx + LoginForm.tsx + loginSchema.ts
      create-account/   page.tsx + CreateAccountForm.tsx + createAccountSchema.ts
      _components/      AuthShell.tsx (group-local)
  (members)/
    layout.tsx          validates the session, then renders the member shell (MemberSidebar)
    error.tsx           members-group boundary
    dashboard/
      page.tsx          validateSession + getDashboard
      _components/      UsersPanel.tsx
    account/
      page.tsx          validateSession + listSessions
      _components/      SessionsPanel.tsx
  actions/              shared server actions: login.ts, create-user.ts,
                        revoke-other-sessions.ts
  api/client-logs/      POST route handler: browser log ingest
```

- Component placement rule: shared across routes → `@/components`; used by one
  route → that route's `_components/`. `MemberSidebar` sits in `@/components`
  because the `(members)` layout mounts it for every member route; each page
  renders its own `<header>` and `<main>` inside that shell.
- The sidebar is a client component for one reason: the active nav item comes
  from `usePathname`, and a layout cannot pass it down — it does not know which
  child route rendered.
- Form schemas live beside their route (`loginSchema.ts`,
  `createAccountSchema.ts`); the action re-parses with the strict action schema
  before calling the gateway.

## Key Flows

- **Guarding is layered:** `proxy.ts` does a cheap cookie-presence redirect
  before any HTML is served; the group layout does the authoritative
  `validateSession()` check. `(members)` failure goes to `/logout` (a real
  revoke + cookie clear), never straight to `/login` with a stale cookie.
- **Error boundaries ladder:** page throws → nearest group `error.tsx`
  (`ErrorScreen`) → root `error.tsx` → `global-error.tsx`. A deliberate "this
  page cannot render" throw uses `ExpectedError` with a registered code
  (`lib/errors/`), because production strips the message and only `digest`
  survives.
- **Client logs:** browser batches → `POST /api/client-logs` (same-origin, CSP
  `connect-src 'self'`) → rate limit → re-sanitised server-side → shared sink.
  Body is capped (64 KiB, counted while the body streams in, 100 records) and
  server-authoritative fields override client values. The route is anonymous by
  design, so the limit (`lib/logging/client-log-rate-limit.ts`) meters it in two
  dimensions and answers 429 + `Retry-After`: the **request** charge runs before
  the body is read, so a flood costs us no parsing; the **record** charge runs
  once the batch is parsed and is the ingest ceiling proper — priced in
  byte-aware units, because a request is worth up to 100 records and a record's
  bytes are unbounded below the body cap.

## Integrations

- Server actions call `lib/gateway/*`; pages call gateways or
  `lib/authentication/get-server-session`.
- `@repo/ui` for every primitive; `@repo/ui` form integration for the auth forms.
- `lib/routes.ts` is the route registry — never inline a path string.

## Gotchas

- Guarding layouts must keep `export const instant = false`, otherwise the
  cached static shell paints the wrong UI first.
- Member pages re-call `validateSession()`; `React.cache` dedupes it with the
  layout's call, so there is no extra round trip.
- A server action that changes what a member page shows calls `refresh()` from
  `next/cache`. The account page's session read is uncached, so there is no cache
  entry to invalidate — the client router is what holds the old rows.
- `/logout` is a GET route handler on purpose (any link or redirect can reach
  it) and revokes best-effort — a backend outage must never trap the browser
  with a cookie it cannot clear.
- `/logout` refuses EVERY cross-site request with a 403 before touching any
  cookie, so no other site can force a sign-out — subresource or top-level
  navigation alike.
- The one exception is this app's own redirect, which says so with a token.
  Browsers compute `Sec-Fetch-Site` across the whole redirect chain, so the
  proxy's own redirect from `/dashboard` carries `cross-site` whenever the
  visitor arrived from an external link. Every redirect of ours into `/logout`
  therefore goes through `logoutRedirectPath(sessionToken)`
  (`lib/auth/logout-token.ts`), which appends a short-lived HMAC signed over that
  session cookie, and the route checks it against the cookie the request arrives
  with. MUST NOT redirect here with a bare path, and MUST NOT drop the session
  token from the mint — an unbound token verifies for every visitor, and this app
  hands one to anyone who asks `/dashboard` without a valid binding.
- That exception covers TOP-LEVEL NAVIGATIONS ONLY. A cross-site subresource is
  refused whether it carries a token or not: the token rides in a query string
  that the address bar, the browser history, and every access log in front of the
  app retain for its two-minute life, and one read out of a log would otherwise
  re-arm `<img src="/logout?t=…">`. Our own redirect is always a navigation.
- `none` (typed address, bookmark), `same-origin`, `same-site`, and an absent
  header all still sign the visitor out — the sidebar's own Sign out link
  included.
- `app/api/client-logs/route.ts` deliberately omits a `runtime` segment config;
  it is incompatible with `cacheComponents`, and route handlers already default
  to the Node runtime the sinks need.
- The root layout's `NonceBoundary` (`await headers()`) is what opts the tree
  into dynamic rendering so the CSP nonce is injected — do not remove it.
- `app/dev/**` is a local-only experimental surface excluded from review; it
  does not exist yet in this repo.

## Agent Notes

- New page: decide the route group (guest vs members), add the path to
  `lib/routes.ts`, and let the group layout do the auth check. A member path MUST
  go in `memberPageRoutes` — `proxy.ts` reads that object to decide what gets the
  binding check, the idle roll, and rotation, and a member page it does not
  recognise looks fine until a session outlives one of them.
- New server action: put it in `app/actions/` if shared, beside its route if
  not; always wrap in `actionWrapper` with a deliberate `auth` mode.
- Auth error copy stays deliberately generic — never disclose whether an account
  exists.
