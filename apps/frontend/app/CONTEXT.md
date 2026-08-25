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
    logout/route.ts     GET handler: revoke + clear all auth cookies + redirect
    (guest)/
      layout.tsx        redirects a signed-in visitor to /dashboard (instant = false)
      page.tsx          marketing/home
      login/            page.tsx + LoginForm.tsx + loginSchema.ts
      create-account/   page.tsx + CreateAccountForm.tsx + createAccountSchema.ts
      _components/      AuthShell.tsx (group-local)
  (members)/
    layout.tsx          validates the session; failure redirects to /logout (instant = false)
    error.tsx           members-group boundary
    dashboard/
      page.tsx          validateSession + getDashboard
      _components/      DashboardSidebar.tsx, UsersPanel.tsx
  actions/              shared server actions: login.ts, create-user.ts
  api/client-logs/      POST route handler: browser log ingest
```

- Component placement rule: shared across routes → `@/components`; used by one
  route → that route's `_components/`.
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
  `connect-src 'self'`) → re-sanitised server-side → shared sink. Body is capped
  (64 KiB, 100 records) and server-authoritative fields override client values.

## Integrations

- Server actions call `lib/gateway/*`; pages call gateways or
  `lib/authentication/get-server-session`.
- `@repo/ui` for every primitive; `@repo/ui` form integration for the auth forms.
- `lib/routes.ts` is the route registry — never inline a path string.

## Gotchas

- Guarding layouts must keep `export const instant = false`, otherwise the
  cached static shell paints the wrong UI first.
- The dashboard page re-calls `validateSession()`; `React.cache` dedupes it with
  the layout's call, so there is no extra round trip.
- `/logout` is a GET route handler on purpose (any link or redirect can reach
  it) and revokes best-effort — a backend outage must never trap the browser
  with a cookie it cannot clear.
- `app/api/client-logs/route.ts` deliberately omits a `runtime` segment config;
  it is incompatible with `cacheComponents`, and route handlers already default
  to the Node runtime the sinks need.
- The root layout's `NonceBoundary` (`await headers()`) is what opts the tree
  into dynamic rendering so the CSP nonce is injected — do not remove it.
- `app/dev/**` is a local-only experimental surface excluded from review; it
  does not exist yet in this repo.

## Agent Notes

- New page: decide the route group (guest vs members), add the path to
  `lib/routes.ts`, and let the group layout do the auth check.
- New server action: put it in `app/actions/` if shared, beside its route if
  not; always wrap in `actionWrapper` with a deliberate `auth` mode.
- Auth error copy stays deliberately generic — never disclose whether an account
  exists.
