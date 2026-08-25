# Context: apps/frontend

## Purpose

- The member-facing Next.js App Router app, and the BFF in front of the backend:
  the browser never talks to `apps/backend` directly.
- Read/edit here for pages, layouts, server actions, the gateway layer, auth
  cookies, CSP/security headers, client + server logging, and frontend env.

## Architecture

- **App Router** (`app/`) — route groups `(public)/(guest)` and `(members)`,
  plus `api/client-logs`. Server Components by default. See `app/CONTEXT.md`.
- **`proxy.ts`** — the Next proxy (middleware equivalent). Mints the per-request
  CSP nonce and correlation/session ids, applies security headers, fast-path
  redirects guest↔member routes on cookie presence, and rolls the
  session-binding cookie.
- **`lib/`** — all non-route server code: `gateway/` (the only way to call the
  backend), `actions/` (`actionWrapper`), `authentication/`, `auth/` (binding
  token), `logging/`, `errors/`, `cache/`, `routes.ts`, `constants/`.
- **`components/`** — app-shared components. Route-specific ones live in that
  route's `_components/`.
- **`config/`** — zod env schemas (`serverEnvSchema` / `publicEnvSchema`) and
  the cached `getServerEnv()`.
- **`instrumentation.ts`** — `register()` parses server env at boot;
  `onRequestError` ships every server-side error to the shared log sink.
- Styling: Tailwind v4 through `@repo/ui`. `app/globals.css` imports
  `@repo/ui/styles.css` + the `default` theme; `<html data-theme="default">`.

## Key Flows

**Request:** browser → `proxy.ts` (nonce, CSP, correlation/session ids,
guest/member redirects, binding cookie) → layout guard (`validateSession()`) →
page → `lib/gateway/*` → backend (with `x-api-secret`, session cookie, and
`x-request-id`/`x-session-id`).

**Mutation:** form → server action wrapped in `actionWrapper` → re-validate
input with the strict action zod schema → gateway call → `redirect()` or a
`FormSubmitResult` error.

**Auth:** register/login actions read the backend's `Set-Cookie`, re-issue
`llstack_session` locally, mint the `__Host-bind` binding cookie, rotate the
`llstack_sid` log session id, and redirect to `/dashboard`. Logout is a **GET
route handler** (`/logout`) so any redirect can trigger it; it revokes
best-effort and always clears all three cookies.

**Logging:** browser (`clientLogger`) → `POST /api/client-logs` → shared sink;
Next server (`serverLogger`) → shared sink directly. All three tiers join on
`correlationId`/`requestId` and `sessionId`, and the gateway also records the
backend's `x-trace-id`.

## Integrations

- `@repo/services` — generated clients, imported **only** from `lib/gateway/*`.
- `@repo/ui` — every primitive/component. `@repo/logging/shared` — redaction and
  level defaults. `@repo/schema` — shared zod primitives for form schemas.
- Env: `BACKEND_INTERNAL_URL`, `BACKEND_API_SECRET`, `BINDING_SECRET`,
  `SESSION_SECRET` (reserved), `LOG_*`, `NEXT_PUBLIC_*`, `DEV_MODE`.

## Gotchas

- `next.config.ts` sets `cacheComponents: true`, `output: 'standalone'`,
  `transpilePackages: ['@repo/ui','@repo/services','@repo/logging']`, and
  `typescript.ignoreBuildErrors: true` — types are gated by `pnpm typecheck`
  (native tsc), not by `next build`. `useTypeScriptCli: false` is required by
  this repo's TypeScript aliasing.
- The CSP is asserted byte-for-byte in `proxy.test.ts`. `'strict-dynamic'` must
  never be added while `cacheComponents` is on — it blocks the prerendered
  bootstrap scripts and the app never hydrates.
- The root layout reads `headers()` inside a `Suspense` boundary purely to opt
  into dynamic rendering so the nonce reaches Next's scripts.
- Layouts that guard set `export const instant = false`, otherwise the static
  shell paints before the redirect resolves and the user sees a visible hop.
- `AsyncLocalStorage` request context does **not** cross a `'use cache'`
  boundary — cached gateway reads are intentionally correlation-blind.
- `no-console` is an ESLint error everywhere except `lib/logging/**`.
- `SESSION_COOKIE_NAME` (`llstack_session`) is duplicated in
  `apps/backend/src/auth/session-cookie.service.ts`; keep them in lockstep.

## Agent Notes

- **Read `docs/agents/frontend.agents.md` before any change here.** Compose from
  `@repo/ui` primitives (catalog: `packages/ui/COMPONENTS.md`); a net-new
  primitive needs separate review.
- Never call `@repo/services` outside `lib/gateway/`; never skip `actionWrapper`
  on a server action; always re-validate action input server-side.
- Tailwind v4 CSS-variable shorthand only: `bg-(--ui-background)`, never
  `bg-[var(--ui-background)]` (ESLint error). `const` arrow functions in `.tsx`.
- Not complete until `pnpm verify:frontend` passes.
