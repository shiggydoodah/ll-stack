# Frontend Development for Agents

This runbook is the authoritative rule set for building or changing anything in `apps/frontend` — components, pages, styling, server actions, gateways, forms, auth, logging, and env. Read it before any frontend work.

Human-readable rationale lives at `docs/charters/frontend.md`. This file is the rule-shaped enforcement layer. If the two ever disagree, the charter is the source of truth — open a PR to reconcile.

The frontend app map is `apps/frontend/CONTEXT.md`; the shared UI package map is `packages/ui/CONTEXT.md`. Frontend work is not complete until `pnpm verify:frontend` (or `pnpm verify`) passes.

---

## When to Read This File

Read this file before any of:

- building or changing a React component in `apps/frontend`
- adding a page or route that renders UI
- styling or restyling anything in `apps/frontend`
- deciding where a new component should live
- adding or changing a server action, or anything that calls the backend
- adding or changing a gateway in `apps/frontend/lib/gateway/`
- building or changing a form, a zod schema, or validation behavior
- adding or changing auth, session handling, or a guarded route/layout
- adding or changing frontend logging or env vars

This file does **not** apply to:

- backend work (`apps/backend`) — that is `docs/agents/backend.agents.md`
- authoring components **inside** the shared UI package — that workflow lives in `packages/ui/CONTEXT.md`
- generated client internals under `packages/services` — never hand-edited
- `apps/frontend/app/dev/**` — local-only surface, excluded from production standards

If your task touches none of the above, this file does not apply.

---

## Non-Negotiable Rules

### Build on `@repo/ui`

- MUST compose UI from the existing primitives and components in `@repo/ui` (`packages/ui`). They are the building blocks for all UI.
- MUST NOT hand-roll a component when `@repo/ui` already ships an equivalent (button, input, dialog, card, badge, etc.). Search first — scan the catalog at `packages/ui/COMPONENTS.md` (what ships + how to import + key props), then see "Where a Component Lives".
- Import from the correct entrypoint:

  | Need                                             | Import from             |
  | ------------------------------------------------ | ----------------------- |
  | Primitives (Button, Card, Avatar, Badge, Input…) | `@repo/ui/primitives`   |
  | Icons                                            | `@repo/ui/icons`        |
  | Hooks                                            | `@repo/ui/hooks`        |
  | Form integration (TanStack Form)                 | `@repo/ui/integrations` |
  | Providers                                        | `@repo/ui/providers`    |
  | `cn` + form helpers                              | `@repo/ui` (barrel)     |

- In **server components**, MUST import from the subpath entrypoints (`@repo/ui/primitives`, `@repo/ui/icons`, …). MUST NOT import from the top-level `@repo/ui` barrel in a server component — it re-exports client hooks and TanStack Form, so it is not RSC-safe.

### Styling

- MUST NOT use inline styles (`style={{ … }}`). Use Tailwind classes.
- MUST build every `className` with Tailwind v4 classes via the `cn` utility from `@repo/ui`.
- MUST use the Tailwind v4 CSS-variable shorthand: `bg-(--ui-background)`, `text-(--ui-foreground)`, `border-(--ui-border)`. MUST NOT write `bg-[var(--ui-background)]` — ESLint flags it. (See `AGENTS.md` § Tailwind.)
- MUST use `--ui-*` and `brand-*` tokens, never raw hex values. (Token rules: `packages/ui/CONTEXT.md`.)
- In `.tsx` files, MUST use `const` arrow functions, never `function` declarations. (See `AGENTS.md` § React / JSX.)

### Implementing from Design References

When a design reference exists (a mock, a screenshot, a sketch), it governs **layout, structure, hierarchy, and interaction**; `@repo/ui` **always** governs the **look** — tokens, primitives, spacing, type. When the two diverge, our system wins: close-enough built from our tokens and primitives beats pixel-perfect built from the reference.

- MUST map reference styling onto our system, never copy it. MUST NOT copy a raw hex, an arbitrary-value Tailwind class (`bg-[#cc1f1f]`, `w-[37px]`), an inline style, or a Google Font out of a reference. (Reinforces "Styling".)
- MUST NOT add or change `--ui-*` / `brand-*` tokens, theme values, or any `@repo/ui` style or primitive to make a reference — or a new component — match. Build only from what already exists. If a design genuinely cannot be expressed with the current tokens and primitives, STOP and flag it for approval **before** changing anything — never adjust the design system to fit a picture. (See "Need a New `@repo/ui` Component".)
- A reference is **not a contract**. It may show fields, copy, entities, or data shaped differently from — or absent in — our codebase. MUST build against the **existing** models, components, and routes (`pageRoutes.*`), adapting the reference to fit. MUST NOT invent backend fields, endpoints, or routes to match it — a missing field or endpoint is a backend contract change awaiting client regeneration (see "Gateways and Backend Calls"), not something faked on the frontend.
- When a reference element has no clear equivalent, looks structurally out of place, or you are unsure how it maps — STOP and flag it for clarification rather than guessing. Do not invent a primitive or token to fill the gap (see "Need a New `@repo/ui` Component").

### Responsiveness and Accessibility

- Every page MUST be a **single responsive layout** — one component tree that adapts with Tailwind's responsive prefixes. MUST NOT build separate desktop and mobile component trees.
- UI MUST work well across mobile, tablet, and desktop widths — verify at common breakpoints; nothing clipped, overflowing, or unreachable on a small screen.
- Accessibility is not optional:
  - Prefer `@repo/ui` primitives — they bake in focus management, ARIA, and keyboard behaviour; hand-rolled equivalents quietly lose these (see "Build on `@repo/ui`").
  - Use semantic HTML (real `button` / `a` / `nav` / headings / landmarks), keep everything keyboard-operable with a visible focus state, and give icons, inputs, and images accessible names or `alt` text.
  - Every rendered form control (`input` / `select` / `textarea`, and the `Input` / `Select` / `Textarea` / `Checkbox` / `Radio` primitives) MUST carry an `id` — a control the browser cannot identify is skipped for autofill and reported under DevTools > Issues. Inside a `Field`, wrap the control in `<FieldControl>` and the id is injected from the field `name`; standalone, pass a descriptive `id` (plus a `name` where the value is meaningful). Where a component can mount more than once on a page, scope the id to something stable and unique — an entity id (`` `user-note-${userId}` ``) or `useId()` — never a fixed string. A `no-restricted-syntax` ESLint rule enforces this.
  - Use `--ui-*` / `brand-*` tokens for colour and contrast (they are theme- and contrast-aware); do not hardcode colours that bypass them.

### Where a Component Lives

Every component belongs to exactly one of three tiers.

| Tier           | Lives in                                    | Use when                                                                                                                       |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Global UI      | `@repo/ui` (`packages/ui`)                  | App-agnostic, reusable in any app/project. **See "Need a New `@repo/ui` Component" — do not build inline.**                    |
| App-shared     | `@/components` (`apps/frontend/components`) | Reusable across this app; an app-specific recipe built from `@repo/ui`. Add the export to `apps/frontend/components/index.ts`. |
| Page / feature | the route's `_components/` dir              | Used by only one page or feature.                                                                                              |

- Before creating anything, MUST search `@repo/ui` (primitives + components barrels), `@/components`, and peer `_components/` directories for an existing component that fits. Reuse it — or lift an existing one — before writing new code.
- A component in `@/components` MUST be reusable across the app — not coupled to a single page or feature.
- A component scoped to one page/feature MUST live in that route's `_components/` dir, built from `@repo/ui` (and from `@/components` where they fit).
- When a `_components/` component starts getting reused across the app, promote it to `@/components`.

### Need a New `@repo/ui` Component (STOP — flag first)

If you need a building block that belongs in `@repo/ui` (app-agnostic, reusable anywhere) but does not exist yet:

- MUST NOT build it inline in the frontend "to extract later".
- MUST stop and flag it for approval before implementing.
- It is built, reviewed, and tested **separately** in `packages/ui` — including a variant render test — before the frontend consumes it. Follow "How to add a new component" in `packages/ui/CONTEXT.md` and the scaffold prompt at `docs/templates/fe-new-ui-component.prompt.md`.
- Once it ships in `@repo/ui`, import and use it from the frontend.

### Server Actions

- Every server action MUST be wrapped in `actionWrapper(actionName, fn, options)` from `apps/frontend/lib/actions/action-wrapper.ts`, with an explicit `actionName` matching the export (e.g. `'loginAction'`).
- Every action MUST declare a deliberate auth mode:

  | Mode                | Check                                                    | Use when                                                                    |
  | ------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
  | `'none'`            | No session check                                         | Public entry points (login, register, password reset, email verification)   |
  | `'light'` (default) | Session cookie present, not validated                    | Authenticated flows where the gateway call validates the session anyway     |
  | `'full'`            | Session validated via `/users/me`; exposes `auth.userId` | The action needs the user's identity, or must not run for a revoked session |

- Mutating actions MUST re-validate their input inside the action with the strict zod action schema (`safeParse`) before any gateway call. MUST NOT rely on client-side validation.
- Form-facing actions MUST return `FormSubmitResult` (from `@repo/ui`) on failure — `{ ok: false, error: { api: '…' } }` for form-level errors, field-name keys for field errors — and redirect (or `revalidatePath` + return) on success.
- The `details` option MUST be a PII-free projection (`{ hasEmail: !!values.email }`). MUST NOT put emails, names, passwords, tokens, or any submitted values in `details`.
- MUST NOT call `@repo/services` generated clients or `fetch` the backend directly from an action, component, or hook — backend calls go through a gateway only.
- Placement: actions shared across routes live in `app/actions/`; actions owned by one route are co-located as `actions.ts` / `_actions.ts` (exemplars: `app/actions/login.ts`, `app/(public)/verify-email/actions.ts`).

### Gateways and Backend Calls

- Gateways MUST live in `apps/frontend/lib/gateway/<domain>.ts` — one file per backend domain — and start with `import 'server-only'`.
- Every backend call MUST go through `gatewayWrapper` (`lib/gateway/gateway-wrapper.ts`), which owns session/correlation headers, lifecycle logging, and normalization — MUST NOT re-implement any of those in a gateway function.
- Gateways MUST declare `type ThrowOnError = false` and type their `options` param from the generated client (`Options<XData, ThrowOnError>`) — MUST NOT re-declare the request shape by hand.
- A gateway MUST either return the `ServiceResult<T, E>` envelope (callers MUST handle the `ok: false` branch at the call site) or unwrap to a domain value. Unwrapping MUST validate the payload shape and log a registered event on drift rather than assume it — the `parseCurrentUser` precedent in `lib/gateway/users.ts`. Unwrap only when no caller can act on the difference between failure modes.
- Callers branching on a specific backend failure MUST use `errorCode(result.error)` (`lib/gateway/error-code.ts`) or `result.status` — MUST NOT branch on `result.message`.
- Gateways MUST NOT contain feature logic, user-facing copy, or redirects — mapping a status to a member-facing message is the server action's job.
- `withAuth` defaults to true (session cookie injected). `{ withAuth: false }` MUST be set explicitly for (a) genuinely public endpoints and (b) calls that supply the cookie themselves via `buildSessionCookieHeader` (the cached path, where `cookies()` is unavailable). Case (b) MUST pass its own session header — `withAuth: false` means "the wrapper is not resolving the session", not "this call is unauthenticated".
- The `logContext` string MUST follow the `` `[${SERVICE_NAME}] <operation>` `` pattern used by the existing gateways.
- Cached reads MUST follow the cached-gateway pattern (worked example: `getCurrentUserCached` in `lib/gateway/users.ts`): `'use cache'` + `cacheLife(cacheLifeProfiles.<profile>)` (`lib/cache/life.ts`) + `cacheTag(cacheTags.<entity>(id))` (`lib/cache/tags.ts`); session-scoped reads compose `withSessionCache` (`lib/cache/utils.ts`). MUST NOT call request-scoped APIs (cookies, request context) inside `'use cache'`.
- Auth decisions MUST NOT read from a cached gateway — `validateSession` uses the uncached path with `cache: 'no-store'`. Cached reads are for display only.
- Mutations MUST invalidate what they made stale (`revalidatePath` or the matching cache tag).
- MUST NOT hand-edit generated output under `packages/services` — it is regenerated from the backend contract via `pnpm gen:client`, which may ship in the same PR as the backend contract change and the frontend work that consumes it. A missing endpoint or field is a backend contract change awaiting client regeneration, not a hand-rolled `fetch`.

### Forms and Validation

- Forms MUST be built with the `@repo/ui` TanStack Form integration: `useAppForm`, `Form`, the bound field components (`form.TextField`, `form.PasswordField`, `form.SelectField`, …), `form.Errors`, and `form.SubmitButton`. MUST NOT hand-roll form state, submission plumbing, or error display.
- Zod schemas MUST be co-located with the route that owns them (`app/(public)/login/loginSchema.ts` pattern), with types via `z.infer`. Field building blocks (email, password, tokens, username) MUST come from `@repo/schema`, not be redefined.
- Forms MUST keep the dual-schema pattern: a user-facing schema for client validation (lenient where strictness produces hostile messages) and a strict `<name>SchemaAction` schema re-parsed inside the server action. MUST NOT validate only on the client.
- Client validators MUST be derived with `makeZodFormValidator(schema)` (form-level, `onSubmit`) and `makeBlurValidator(fieldSchema)` (per-field, `onBlur`) from `@repo/ui` — not hand-written.
- Server errors MUST be surfaced via the `FormSubmitResult` contract (`error.api` = form-level; field-name keys = field errors), rendered by `<form.Errors />` — no ad-hoc error state.

### Auth and Guarded Routes

- Pages MUST live in the route group matching their access level, guarded by the group's layout:

  | Route group        | Layout guard        | Required account state                                  |
  | ------------------ | ------------------- | ------------------------------------------------------- |
  | `(public)`         | none                | —                                                       |
  | `(public)/(guest)` | `validateSession()` | **No** session — a session-holder goes to the dashboard |
  | `(members)`        | `validateSession()` | Session + verified email                                |

- Guest entry points (home, login, create-account) MUST live in `(public)/(guest)` so a signed-in member is redirected to the dashboard; the rest of `(public)` (terms, privacy, verify-email, password reset) stays session-agnostic. The guard is two layers and both MUST stay: `proxy.ts` fast-paths the redirect on session-cookie **presence** before the static shell is served (otherwise the shell paints and the redirect arrives as a visible flash), and the `(guest)` layout redirects on a **validated** session as the authoritative check (it also covers proxy-exempt requests such as prefetches). The proxy check is a routing optimisation — MUST NOT be relied on for protection.

- A new protected area MUST get a route group with a server-component layout guard that calls `validateSession()` (`lib/authentication/get-server-session.ts`) and fails closed: invalid/missing session → log `session.validation.failed` + redirect to logout; valid session in the wrong state → redirect to that state's home (verify-email / dashboard). Use `app/(members)/layout.tsx` as the template. `validateSession()` returns null ONLY when the backend refused the session (401 + `SESSION_INVALID`); it THROWS on a 5xx, a 429, or a bare 401 (a wrong `x-api-secret`). Guards MUST let that throw reach the error boundary — catching it into the logout redirect turns a backend outage into a mass sign-out.
- MUST NOT add a `middleware.ts` route guard — guarding is layout-based, deliberately. The presence-only cookie fast-paths in `proxy.ts` (guest pages → dashboard; member paths → login) are routing optimisations that beat the static shell, not guards — MUST NOT rely on them for protection or remove the layout checks they front-run.
- MUST NOT implement role, permission, or capability checks in the frontend — the backend enforces (Gate A/B, ownership). The frontend branches only on account state (`emailVerifiedAt`, `role`).
- The session cookie MUST only be touched through the helpers in `lib/authentication/session-cookie.ts` (`setSessionCookieFromUpstream`, `getSession`, `clearSessionCookie`). MUST NOT read, parse, or mint session material anywhere else.
- The session-**binding** cookies MUST only be touched through `lib/auth/binding-cookies.ts` (`setBindingCookies`, `clearBindingCookies`, `readBindingState`). There are TWO cookies holding one token (strict + lax); a writer that sets one and not the other breaks either cold entry or CSRF, silently. MUST NOT write `COOKIE_NAME` or `ENTRY_COOKIE_NAME` directly, and MUST NOT pass `allowEntryCookie: true` for a method that changes state. See `apps/frontend/lib/auth/CONTEXT.md`.
- A route handler that CHANGES STATE on GET MUST refuse a cross-site request with a 403 before any await, so a rejected request mutates nothing. `app/(public)/logout/route.ts` is the reference. It MUST refuse EVERY `sec-fetch-site: cross-site` request except a top-level navigation (`sec-fetch-mode: navigate` AND `sec-fetch-dest: document`) carrying a token this server minted FOR THE SESSION COOKIE THE REQUEST ARRIVES WITH. Both halves are load-bearing: `<a target="_blank">`, `window.open`, and an attacker's 302 are navigations, so exempting navigations alone hands the route back to any site — and a token alone re-opens `<img>`/`<iframe>`/`fetch()`, because the token sits in a query string that the address bar, the browser history, and every access log in front of the app retain. `none` (typed address, bookmark), `same-origin`, `same-site`, and an absent header MUST all be served, or a direct navigation to the route breaks.
- `Sec-Fetch-Site` is computed over the request's WHOLE URL list, so an in-app redirect inherits the value the original cross-site navigation carried. Every redirect into `/logout` MUST therefore go through `logoutRedirectPath(sessionToken)` (`lib/auth/logout-token.ts`), which appends the short-lived HMAC the route accepts as proof of its own hop. MUST NOT redirect there with a bare `pageRoutes.public.logout`. A same-origin `<Link>` needs no token.
- The logout token MUST stay bound to the session cookie it was minted for, and `verifyLogoutToken` MUST be given the cookie off the request being judged. An unbound token is a bearer token this app gives away: `proxy.ts` mints one for any request carrying a session cookie without a matching binding, so anyone can harvest a live one with curl and replay it at a visitor via `window.open`. MUST NOT widen the signed message to anything the presenting browser does not have to prove it holds.
- The binding token's expiry IS the idle timeout (`AUTH_IDLE_TIMEOUT_SECONDS`, default 8h). Any code path that admits a member request MUST be able to roll the cookies (`proxy.ts` does this for all methods, writing when it has something to record or when the binding is past half its life) — a path that verifies but can never roll re-introduces the fixed-length session this replaced. Changing the default MUST update `apps/frontend/.env.example`, `lib/auth/CONTEXT.md`, and `SECURITY.md` in the same change.
- The binding token carries the session-**rotation** deadline as well as the idle expiry, and both are inside the HMAC. Any new field MUST go inside the HMAC too, and `readBindingToken` MUST reject a token that lacks it — a payload the signature does not cover is a payload the browser controls, and this one decides when the session token is next re-issued.
- Session rotation MUST be driven from `proxy.ts` and nowhere else, on safe methods only, and only once the binding's deadline has passed. It cannot move into a page or layout: `validateSession()` runs during RSC render, which cannot set cookies, so a rotation there would retire the browser's token without replacing it.
- The `superseded` outcome MUST write no cookie of any kind. Another request holds the successor; a binding minted on this one is over the retired token and, arriving second, leaves the jar self-inconsistent and forces a sign-out on the next request.
- A rotation call that fails MUST leave the session intact and back off (`getRotationRetrySeconds()`). ONLY a 401 whose body carries `error: 'SESSION_INVALID'` may sign a browser out. MUST NOT branch on the bare status: the backend's global `ApiSecretGuard` answers 401 on that route too, so a wrong `BACKEND_API_SECRET` would sign out every signed-in visitor and revoke each session on the way. MUST NOT treat a timeout, a 5xx, or a missing `Set-Cookie` as a dead session either.
- `AUTH_ROTATION_RETRY_SECONDS` MUST stay at or below the backend's `AUTH_SESSION_ROTATION_GRACE_SECONDS`. A retry inside the grace window is answered `superseded`, writes nothing, and re-asks on the next safe-method navigation; the first retry past the window is the one the backend recovers. Past the window ONLY the rotate retry resolves the retired token — a retry deadline set beyond the window leaves ordinary requests refused (401 → `/logout` → family revoked) before the retry fires. Neither app can read the other's env, so a change to either MUST update both `.env.example` files.
- The `rotated` outcome MUST keep rewriting the forwarded `cookie` header (`rewriteSessionCookie`). Beyond this request's own render, it is what gives the backend's `firstUsedAt` its meaning: because the render spends the successor, an unused successor proves the rotation call never came back. Dropping the rewrite reduces that signal to "the browser has not come back yet" and lets a thief with a copied cookie jar have the victim's live successor revoked silently. The cost is a false `auth.session.reuse_detected` when a response is lost between here and the browser, which `SECURITY.md` states.

### Logging

- Server code MUST log through `serverLogger` (`lib/logging/server-logger.ts`); browser code through the client logger (`lib/logging/client-logger.ts`). MUST NOT use `console.log` in frontend code.
- Log events MUST use names registered in `FRONTEND_LOG_EVENTS` (`lib/logging/log-events.ts`), following `segment.topic.detail` naming. A new event MUST be added to the catalog in the same change that emits it.
- MUST NOT log credentials, tokens, cookies, emails, submitted form values, or payloads. Log decisions and shapes (event + reason + status), not data. Introducing a new sensitive field MUST extend redaction (`packages/logging/src/log-redaction.ts`) in the same change.
- **Server-side** records MUST NOT carry error stacks — sanitize to name + message (+ `digest`), the `sanitizeActionError` precedent (stacks can embed file paths or interpolated values). The catch-all `request-error.ts` capture is stricter still — name + `digest` only, no message — because it records arbitrary unhandled errors whose messages can embed values the shared redaction cannot catch. **Browser-emitted** `client.error.*` records MAY carry the minified browser stack — a deliberate, documented exception (high debugging value, low sensitivity, still redacted at the sink).
- The wrappers already emit action/gateway lifecycle events — MUST NOT duplicate them; add log lines only for domain-meaningful decisions.

### Error Handling

Rationale and architecture: `docs/charters/frontend.md` § Error Handling. The ladder decides how every frontend failure surfaces — always use the **lowest rung that fits**:

| #   | Situation                                                                | Mechanism                                                               |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | Form mutation fails                                                      | `FormSubmitResult` via `actionWrapper` → `<form.Errors />`              |
| 2   | Data action fails (a toggle, a dismissal…)                               | `lib/actions/data-action-failure.ts` mappers → toast                    |
| 3   | Subject missing / hidden / blocked                                       | `notFound()` → route `not-found.tsx`                                    |
| 4   | Partial read fails, page still useful                                    | inline `LoadError` / `EmptyStatePanel` degrade                          |
| 5   | Page cannot render meaningfully (critical read failed, invariant broken) | `throw new ExpectedError(code)` → nearest `error.tsx` with catalog copy |
| 6   | Anything else thrown (the surprise)                                      | nearest `error.tsx` → generic screen + digest reference code            |

- A rung-5 throw MUST be `ExpectedError` (`lib/errors/expected-error.ts`), never a raw `Error`; its code MUST be registered in `EXPECTED_ERROR_CODES` (`lib/errors/expected-error-codes.ts`) in the same change that throws it. A failure the page can degrade around (rung 4) MUST NOT throw — a dashboard section whose read fails degrades inline instead.
- Boundary copy comes ONLY from `EXPECTED_ERROR_CODES` or `ErrorScreen`'s generic constants. MUST NOT render — or select copy from — `error.message` (leak vector in dev; production strips it anyway).
- Boundaries MUST log through `ErrorScreen`'s registered classification events — `client.error.expected` (warn) / `client.error.boundary` (error; fatal at global). MUST NOT add per-page ad-hoc boundary logging; errors that also pass through `actionWrapper` / `gatewayWrapper` already carry lifecycle records (see § Logging).
- Every new route group MUST ship an `error.tsx` that wraps `@/components/ErrorScreen` with its `scope` (template: `app/(members)/error.tsx`), so the group's shell survives page errors.
- The same failure deliberately produces TWO records — `server.error.unhandled` (`instrumentation.ts`, pre-stripping detail, no stack) and the client boundary record (what the member saw) — joined on `digest`. MUST NOT deduplicate them.

### Config and Env

- New env vars MUST be declared in `apps/frontend/config/env.schema.ts` (server vs `NEXT_PUBLIC_` public schema as appropriate) before anything reads them; MUST NOT read undeclared `process.env` keys.
- Config MUST be read through the accessors in `config/env.ts` (`getServerEnv()` et al.), not scattered `process.env` reads.
- Secrets MUST be server-side only. MUST NOT put a secret in a `NEXT_PUBLIC_*` var.

---

## Checklist — Building or Changing App UI

- [ ] Searched `@repo/ui`, `@/components`, and peer `_components/` for an existing fit before writing new code.
- [ ] Composed from `@repo/ui` primitives/components — no hand-rolled equivalents of what already ships.
- [ ] Placed in the correct tier: `@/components` if app-reusable (and added to `components/index.ts`), else the route's `_components/`.
- [ ] No inline styles. Every `className` built with `cn()`, Tailwind v4 CSS-variable shorthand, and `--ui-*` / `brand-*` tokens (no hex).
- [ ] Server components import from `@repo/ui/primitives` / `@repo/ui/icons`, not the top-level barrel.
- [ ] `.tsx` components are `const` arrow functions.
- [ ] Any net-new `@repo/ui` building block was flagged and built separately — not inlined into the frontend.
- [ ] Built from a design reference: matched its layout and structure, but mapped all styling to `--ui-*` / `brand-*` tokens and `@repo/ui` primitives — no copied hex, arbitrary values, inline styles, or reference fonts.
- [ ] Did not add or change any token, theme value, or `@repo/ui` style/primitive to match a mock or a new component; flagged first where the design could not be built from what exists.
- [ ] Flagged any mock element or data with no existing equivalent instead of inventing backend fields, routes, or primitives.
- [ ] Single responsive layout (no separate desktop/mobile trees); verified at mobile, tablet, and desktop with desktop as the reference.
- [ ] Accessible: semantic HTML, keyboard-operable with a visible focus state, accessible names / `alt`, token-based contrast.
- [ ] Every form control has an `id` — injected via `<FieldControl>`, or passed explicitly and kept unique where the component can mount twice.
- [ ] `pnpm verify:frontend` (or `pnpm verify`) passes.

---

## Checklist — Adding a Server Action

- [ ] Placed correctly: `app/actions/` if shared, co-located `actions.ts` / `_actions.ts` if route-owned.
- [ ] Wrapped in `actionWrapper` with an explicit name and a deliberate auth mode (`'none'` / `'light'` / `'full'`) — justified, not defaulted blindly.
- [ ] Input re-validated with the strict action schema (`safeParse`) before any gateway call.
- [ ] Backend calls go through a gateway (`lib/gateway/<domain>.ts`) — no direct generated-client or `fetch` calls.
- [ ] Failures return `FormSubmitResult` keys (`api` / field names) with user-safe messages; backend details go to logs only.
- [ ] Success path redirects and/or revalidates (`revalidatePath` / cache tag) what it made stale.
- [ ] `details` projection is PII-free; any new log events registered in `FRONTEND_LOG_EVENTS`.
- [ ] New gateway functions follow `gatewayWrapper` + `ServiceResult`, with `withAuth: false` only for deliberately public endpoints.
- [ ] `pnpm verify:frontend` (or `pnpm verify`) passes.

---

## Checklist — Building a Form

- [ ] Built with `useAppForm` / `Form` and the bound `@repo/ui` field components — no hand-rolled form state.
- [ ] Zod schema co-located with the route; field building blocks from `@repo/schema`.
- [ ] Dual schemas where client and server rules differ: user-facing schema on the form, strict `…SchemaAction` re-parsed in the server action.
- [ ] Client validators derived via `makeZodFormValidator` / `makeBlurValidator`.
- [ ] Submit path goes to a wrapped server action; server errors surfaced via `FormSubmitResult` and rendered by `<form.Errors />`.
- [ ] UI checklist above applied to the form's markup and styling.
- [ ] `pnpm verify:frontend` (or `pnpm verify`) passes.

---

## Validation Commands

```bash
pnpm --filter @repo/frontend lint
pnpm --filter @repo/frontend typecheck
pnpm --filter @repo/frontend test
pnpm --filter @repo/frontend build
pnpm verify:frontend        # frontend validation chain
pnpm verify                 # full validation chain
```

Do not weaken lint rules, types, or tests to make frontend work pass. If a rule blocks a legitimate exception, document the exception in the charter via PR — do not delete the rule.

---

## Cross-References

- Human-readable charter: `docs/charters/frontend.md`
- Frontend app map: `apps/frontend/CONTEXT.md`; lib map: `apps/frontend/lib/CONTEXT.md`
- Action wrapper internals: `apps/frontend/lib/actions/CONTEXT.md`
- Shared UI package map + "how to add a component": `packages/ui/CONTEXT.md`
- New `@repo/ui` component scaffold prompt: `docs/templates/fe-new-ui-component.prompt.md`
- Component catalog (what ships + how to import): `packages/ui/COMPONENTS.md`
- New-page scaffold prompt: `docs/templates/fe-new-page-scaffold.prompt.md`
- Generated clients: `packages/services/CONTEXT.md`
- Backend rulebook (contract changes, guard ladder, Gate A/B): `docs/agents/backend.agents.md`
- Repo-wide non-negotiables: `AGENTS.md`
