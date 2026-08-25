# Frontend Development Standards

These are the durable conventions for building features in the frontend app (`apps/frontend`). The goals are: a UI assembled from one consistent, themeable, accessible set of building blocks; one well-lit path from the browser to the backend — server action → gateway → generated client — with validation at every boundary; access decisions that fail closed; and a frontend that is observable by default.

The agent-facing companion at `docs/agents/frontend.agents.md` distils these rules into a strict checklist for automated enforcement. This charter exists so humans understand _why_ each rule is here.

The auth flows referenced throughout (login, register, verification, session handling) land with the auth phase and are the worked examples for the patterns here. The charter is the reference point: new work follows it in full, and where existing code disagrees with this document, the document wins and the old code is not precedent.

---

## Stack

- Next.js App Router, server-components-first; mutations and form submissions go through Server Actions
- `@repo/ui` (`packages/ui`) for all UI building blocks; Tailwind v4 with the `--ui-*` / `brand-*` token system
- TanStack Form via the `@repo/ui` form integration; `zod` for all schema validation — forms (`@repo/schema` base schemas) and environment (`apps/frontend/config/env.schema.ts`)
- Typed backend clients generated into `@repo/services` from the backend OpenAPI document (`pnpm gen:client`), consumed only through the gateway layer in `apps/frontend/lib/gateway/`
- Session auth delegated to the backend: an opaque session token in an HttpOnly cookie, set from the backend's `Set-Cookie` and validated against `/users/me`
- Structured logging through `@repo/logging` — `serverLogger` on the Next server, a batching browser logger on the client — joined to backend logs by correlation IDs

Three deliberate absences:

- **No `middleware.ts` route guarding.** Protected areas are guarded in route-group layouts — server components calling `validateSession()`. Why: the guard lives next to the layout that owns the area's UX, each area states its own required account state (a session, a verified email), and the check is a real backend validation rather than a cookie sniff at the edge. The proxy (`proxy.ts`) does keep presence-only cookie _fast-paths_ — bouncing an obvious wrong-audience navigation (a session-cookie holder on a guest page, a cookie-less visitor on a member path) before the prerendered static shell is served — but these are routing optimisations, never enforcement: the layout guards remain authoritative and revalidate every session for real.
- **No direct backend calls from components or client code.** No `fetch` to the backend, no client-side data library pointed at the API. Everything crosses through a server action or a server-component gateway call. Why: one path means one place where auth, correlation, logging, and error normalization happen — and session handling never leaks toward the browser.
- **No frontend authorization logic.** The backend's guard ladder and Gate A/B capability gating are the enforcement point; the frontend only branches on account state the backend reports (`emailVerifiedAt`, `role`). Why: a frontend permission check can only ever be cosmetic — duplicating the decision invites drift where the UI promises what the backend denies.

Per `AGENTS.md`, new major libraries, frameworks, auth providers, or data libraries require explicit approval before they are introduced.

---

## Build on `@repo/ui`

`@repo/ui` (`packages/ui`) is the single source of truth for UI building blocks: primitives (Button, Input, Card, Avatar…) and composed components (Dialog, Tabs, Drawer…). All app UI is assembled from these.

Why:

- **One source of truth.** A button looks and behaves the same everywhere because there is one `Button`. Fixes, accessibility improvements, and theme changes land once and propagate.
- **Theming and tokens.** The package owns the `--ui-*` / `brand-*` token system and the app theme. Composing from it means new UI is themeable and dark-mode-correct by default.
- **Accessibility.** Primitives bake in focus management, ARIA, and keyboard behaviour (many wrap Radix). Hand-rolled equivalents quietly lose these.
- **Less drift.** Re-implementing a primitive inline forks its behaviour and styling, and the fork rots.

So: never hand-roll something the package already ships. If a building block is missing, it is added to the package (see below), not improvised in the app.

---

## The Three Tiers: Where a Component Lives

A component lives at exactly one of three levels of reuse:

1. **Global UI → `@repo/ui`.** App-agnostic, token-driven, reusable in any future app. No app-domain knowledge.
2. **App-shared → `@/components` (`apps/frontend/components`).** An app-specific recipe built from global components — branded and domain-aware, but reused across the app. Not portable to another app.
3. **Page / feature → `<route>/_components/`.** Used by a single page or feature. Built from the two tiers above.

Why the split:

- It keeps the **portability boundary** honest. The UI package stays app-agnostic, so it can serve future apps and be reasoned about in isolation. Domain logic and branding stay in the app.
- It keeps **page-local churn out of shared space.** A one-off widget for a single screen should not sit in the app-shared directory inviting accidental reuse before it has earned a stable API.
- It gives a clear **promotion path.** Start a component page-local; when a second page needs it, lift it to `@/components`; when it becomes app-agnostic, it earns a place in `@repo/ui`.

The discipline before creating anything is to **search first** — the right component, or one a small edit away, often already exists.

---

## No Inline Styles; Tailwind + Tokens Only

All styling is Tailwind v4 classes, composed with the `cn` utility, using `--ui-*` / `brand-*` tokens via the v4 CSS-variable shorthand (`bg-(--ui-background)`).

Why:

- **Theme tokens, not literals.** Token-based classes respond to the theme and to light/dark; inline styles and raw hex values bypass the system and break theming.
- **`cn` for safe composition.** `cn` (clsx + tailwind-merge) resolves conditional and conflicting classes predictably, so variants and overrides do not fight each other.
- **Reviewability.** A consistent styling surface — one mechanism, one token set — is far easier to review and to keep visually coherent than a mix of inline styles, ad-hoc hex, and utility classes.

---

## New Shared Building Blocks Are Built in the Package, Behind Review

When the app needs a building block that belongs in `@repo/ui` but does not exist, it is built **in the package** — with a variant render test — and reviewed before the app consumes it. It is not improvised inline "to extract later".

Why:

- `@repo/ui` contracts (component prop APIs, token names) are treated as stable. New primitives deserve the same scrutiny: an explicit API, specimen coverage, and tests — not a shape reverse-engineered from a single call site.
- "Extract it later" rarely happens; the inline version becomes the de-facto fork and the package never gets the component. Flagging up front keeps the shared layer coherent.

The mechanics of adding a component live in `packages/ui/CONTEXT.md`; this charter only sets the expectation that it happens there, deliberately, and not by accident in the app.

---

## The Data Path: Action → Gateway → Generated Client

Every byte that moves between the browser and the backend travels one path, in three layers, strictly ordered:

| Layer                                                            | Owns                                                                                                                                                        | Must not                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Server action (`app/actions/`, route-local `actions.ts`)         | The entry point from the browser: strict re-validation, orchestration across gateways, cookie writes, `redirect` / `revalidatePath`, returning form results | Call generated clients or `fetch` the backend directly; trust client-side validation |
| Gateway (`apps/frontend/lib/gateway/<domain>.ts`, `server-only`) | One backend domain per file; calling the generated client through `gatewayWrapper`; session + correlation header injection; normalizing to `ServiceResult`  | Contain feature logic; leak raw responses or errors; ever run in the browser         |
| Generated client (`@repo/services/<domain>`)                     | The typed transport, generated from the backend OpenAPI document                                                                                            | Be hand-edited; be imported anywhere outside the gateway layer                       |

Server components read through gateways; client components mutate through server actions. Nothing else touches the backend.

Why one path:

- **One chokepoint for cross-cutting concerns.** Session cookie injection, correlation headers, lifecycle logging, and error normalization happen in exactly one place each — `actionWrapper` for actions, `gatewayWrapper` for calls. A bypass route would silently lack all of them.
- **Typed end to end.** The generated `@repo/services` clients carry the backend contract; a contract change shows up as a compile error in the gateway, not a runtime surprise in a component.
- **Reviewable blast radius.** "What can call the backend?" is answerable by listing `lib/gateway/` — the same way the backend's guard ladder makes its surface greppable.

---

## Server Actions

Server actions are the frontend's controllers: thin entry points that validate, orchestrate gateways, and decide what the browser sees next.

Placement mirrors the component tiers: actions shared across routes live in `app/actions/` (e.g. `app/actions/login.ts`); actions owned by one route are co-located with it as `actions.ts` / `_actions.ts` (e.g. `app/(public)/verify-email/actions.ts`).

Every action is declared with `'use server'` and wrapped in `actionWrapper` (`apps/frontend/lib/actions/action-wrapper.ts`):

```typescript
export const loginAction = actionWrapper(
  'loginAction',
  (_auth, values: LoginFormValues) => runLoginAction(values),
  { auth: 'none', details: (values) => ({ hasEmail: !!values.email }) },
);
```

The wrapper is non-optional because it is where the cross-cutting work lives: request-context propagation for correlation, the auth check, lifecycle log events (`action.request.called` / `completed` / `failed`) with timing, sanitized error logging, and `unstable_rethrow` so `redirect()` / `notFound()` control flow is never swallowed or logged as a failure.

### The auth-mode ladder

Like the backend's guard ladder, every action deliberately declares the strongest auth check its work warrants:

| Mode                | Check                                                                                 | Use when                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `'none'`            | No session check                                                                      | Public entry points: login, register, password reset, email verification                  |
| `'light'` (default) | Session cookie present — not validated, no network                                    | Authenticated flows where the gateway call validates the session anyway                   |
| `'full'`            | Session validated against the backend (`/users/me`, request-cached); exposes `userId` | The action needs the user's identity itself, or must not run at all for a revoked session |

A missing session redirects to login by default (`onAuthMissing`). Why a ladder: `'light'` keeps the common case free of a redundant network round-trip — the backend re-validates the cookie on the gateway call regardless — while `'full'` exists for the cases where identity is needed before any gateway call is made. The deliberate choice is recorded on the action, where review can see it.

### Validation, results, and side effects

- **Actions re-validate their input** with the strict zod action schema (`safeParse`) before touching any gateway. Client-side validation is a courtesy to the user, not a boundary — anyone can invoke a server action without the form.
- Form-facing actions return `FormSubmitResult`: `{ ok: false, error: { api: '…' } }` for a form-level error, field-name keys for field errors. The form integration routes these back onto the form (see Forms and Validation).
- Success paths perform their side effects — cookie writes via the session helpers, `revalidatePath` / cache-tag invalidation for anything the mutation made stale — and then `redirect()`. Failures map to user-safe messages; backend error details go to the log, not the user.
- The `details` option is a **PII-free projection** of the arguments for the log line: `{ hasEmail: !!values.email }`, never the email itself.

---

## Gateways

Gateways (`apps/frontend/lib/gateway/`) are the only consumers of the generated `@repo/services` clients. One file per backend domain — `auth.ts`, `users.ts`, `app-status.ts` — each starting with `import 'server-only'` so a client-bundle import is a build error, not an incident.

Every call goes through `gatewayWrapper` (`apps/frontend/lib/gateway/gateway-wrapper.ts`):

```typescript
export const login = async (options: Options<LoginUserData, ThrowOnError>) =>
  gatewayWrapper(
    (headers) =>
      loginUserGenerated(
        headers ? { ...options, headers: { ...(options.headers ?? {}), ...headers } } : options,
      ),
    `[${SERVICE_NAME}] login`,
    { withAuth: false },
  );
```

What the wrapper buys, once, for every call: correlation headers (`x-request-id`, `x-session-id`) for cross-tier log joins; session-cookie injection (`withAuth` defaults to **true** — public endpoints opt out explicitly, so "which calls go out unauthenticated?" is greppable); gateway lifecycle log events; and normalization of every outcome — success, HTTP error, network failure — into one envelope:

```typescript
export type ServiceResult<T, E = unknown> =
  | { ok: true; status: number; message: string; data: T; response: Response }
  | { ok: false; status: number; message: string; error: E; response: Response | undefined };
```

Why an envelope instead of exceptions: callers are forced to handle the failure branch at the call site — there is no forgotten `try/catch`, and a network failure (`status: 503`, no response) is handled by the same code as an HTTP 4xx.

### Cached reads

Read gateways that serve many renders use the Next cache, with the repo's named knobs rather than ad-hoc numbers:

- `'use cache'` on the cached function, `cacheLife(cacheLifeProfiles.<profile>)` from `lib/cache/life.ts`, and `cacheTag(cacheTags.<entity>(id))` from `lib/cache/tags.ts` so mutations can invalidate precisely.
- Session-scoped reads compose `withSessionCache` (`lib/cache/utils.ts`), which resolves the session cookie outside the cache boundary and passes it in as an argument — request-scoped APIs (cookies, AsyncLocalStorage) do not exist inside `'use cache'`. Cached reads are therefore correlation-blind by design; that trade is accepted for the cache hit.

`getCurrentUserCached` in `lib/gateway/users.ts` is the worked example of the whole pattern.

### The generated clients

`@repo/services` output is generated from the backend OpenAPI document and is never hand-edited; the backend regenerates it with `pnpm gen:client` on any contract change, and the regenerated output may ship in the same PR as the contract change and the frontend work that consumes it. If the client lacks an endpoint or a field, the fix is in the backend contract — awaiting client regeneration — not a hand-rolled `fetch`.

---

## Forms and Validation

Forms are built with TanStack Form through the `@repo/ui` integration — `useAppForm`, `Form`, the bound field components (`form.TextField`, `form.PasswordField`, `form.SelectField`, …), `form.Errors`, and `form.SubmitButton`. The integration owns field wiring, busy state, and error rendering; the app never hand-rolls form state, submission plumbing, or error display.

Validation is zod, end to end:

- **Schemas are co-located** with the route that owns them (`app/(public)/(guest)/login/loginSchema.ts` pattern), with types derived via `z.infer`. Field-level building blocks — email, password, tokens — come from `@repo/schema`, so "what is a valid password" is defined once.
- **Two schemas per form, on purpose.** The user-facing schema is lenient where strictness would produce hostile messages (login's password is `min(1, 'Password is required')` — the user typing their password wrong should not be lectured about complexity rules). The action schema (`loginSchemaAction`) carries the strict rules and is **re-parsed inside the server action**. Why: friendliness on the client must never weaken the server boundary, and the server boundary must hold even when the form is bypassed entirely.
- **Client validators are derived, not hand-written**: `makeZodFormValidator(schema)` for submit-time form validation, `makeBlurValidator(fieldSchema)` for per-field blur validation.

Errors travel one contract. The action returns `FormSubmitResult` — `error.api` becomes the form-level error, any other key targets the matching field — and the integration applies them to the form, where `<form.Errors />` renders them. One shape from server to screen means a new form gets error handling by following the pattern, not by inventing plumbing.

Anti-abuse precedent: the create-account form ships honeypot fields (`_website`, `_phone` — must stay empty) validated in the schema like any other field. Cheap, invisible to users, and caught by the same dual-validation path.

---

## Authentication and Guarded Routes

The frontend does not own auth — the backend does. The session is an opaque token in an HttpOnly cookie, minted by the backend at login/register and forwarded by the frontend, never minted or interpreted locally.

The session helpers in `apps/frontend/lib/authentication/` are the only code that touches the cookie:

- `setSessionCookieFromUpstream` — copies the backend's `Set-Cookie` into the Next cookie jar (HttpOnly, secure in production)
- `getSession` — raw cookie read, no validation, no network
- `validateSession` — validates against the backend via `/users/me`, wrapped in `React.cache` so one request validates at most once
- `clearSessionCookie` — logout and the fail-closed path

### The route-group guard ladder

Pages are guarded by **route group**, in the group's layout — a server component that validates the session and redirects on any shortfall:

| Route group        | Layout guard        | Required account state                                  |
| ------------------ | ------------------- | ------------------------------------------------------- |
| `(public)`         | none                | —                                                       |
| `(public)/(guest)` | `validateSession()` | **No** session — a session-holder goes to the dashboard |
| `(members)`        | `validateSession()` | Session + verified email                                |

Each layout fails closed: an invalid or missing session logs `session.validation.failed` and redirects to logout (which clears the cookie); a valid session in the wrong state is forwarded to where that state belongs — unverified to `/verify-email`, verified out of the guest pages to the dashboard. New protected areas follow the same shape: a route group, a layout guard, explicit required state.

The `(guest)` group nested inside `(public)` holds the guest entry points — home, login, create-account — and inverts the check: a valid session is forwarded to the dashboard (whose layout routes wrong-state accounts onward), while the rest of `(public)` (terms, privacy, verify-email, password reset) stays reachable regardless of session. The guard is two layers, deliberately. The proxy fast-paths the redirect on session-cookie _presence_ before any HTML is served — the guest pages' prerendered static shells would otherwise paint before the layout's dynamic redirect streams in, a visible flash of guest UI on every signed-in visit. The `(guest)` layout then remains the authoritative check, redirecting only on a _validated_ session (reusing the `React.cache`'d read the public layout already performs for its header, so it costs no extra backend call); it also covers requests the proxy matcher exempts, such as prefetches. A stale cookie that fools the proxy self-heals: the dashboard's layout kills the session through `/logout`, which clears the cookie.

Auth is then enforced at all three layers of the data path — layout guards for pages, the `actionWrapper` auth mode for mutations, and `gatewayWrapper`'s cookie injection (with the backend's own validation) for every call. The layers back each other up; none is trusted alone.

What the frontend never does: role or permission checks. Capability gating (Gate A/B) and ownership live in the backend; the frontend branches only on the account-state fields the backend reports and renders whatever the backend allows or denies.

---

## Logging and Observability

Logging is structured, through `@repo/logging`: `serverLogger` (`apps/frontend/lib/logging/server-logger.ts`) on the Next server, and a browser logger (`lib/logging/client-logger.ts`) that batches records to `/api/client-logs`, where they re-enter the same sink pipeline. `console.log` does not exist in frontend code.

- Log events use names registered in `FRONTEND_LOG_EVENTS` (`lib/logging/log-events.ts`), following the `segment.topic.detail` convention (`gateway.request.failed`, `auth.login.session_missing`) — a greppable vocabulary, not freeform strings. New events are added to the catalog in the same change that emits them.
- **Redaction is maintained, not assumed.** The shared redaction layer (`packages/logging/src/log-redaction.ts`) scrubs token-like values and sensitive keys; the wrappers sanitize errors to `{ errorName, errorMessage }` / `{ errorCode, errorMessage }` and never log payloads. Server-side records never carry error stacks — a server stack can embed file paths and interpolated values. Browser-emitted `client.error.*` records are the one deliberate exception: they keep the minified browser stack, because it is often the only clue a client-side crash leaves, it is minified and low-sensitivity, and it still passes sink-side redaction. Introducing a new sensitive field means extending redaction in the same change.
- **Log decisions, not payloads.** Action `details` projections and gateway failure logs record shape and outcome (`{ hasEmail: true }`, status, duration) — never the submitted values. The body that failed validation is exactly what must not be logged.
- Correlation joins the three tiers: `proxy.ts` stamps every request with a correlation ID and a stable visitor-session cookie; `withRequestContext` carries them through the action via AsyncLocalStorage; `gatewayWrapper` forwards them as `x-request-id` / `x-session-id` and reads the backend's trace ID off the response. One search follows a click from browser log to backend trace.

Why: when a user reports "login didn't work", the question is "what happened to that request?" — registered events with correlation IDs answer it across browser, Next server, and backend; prose logs and leaked tokens both fail you, in different ways.

The wrappers emit the lifecycle events automatically — most feature code only adds a log line for a domain-meaningful decision, with a registered event name.

---

## Error Handling

Failures are surfaced deliberately, on a ladder from gentlest to loudest — a form error message, a toast, a not-found page, an inline degrade, and only then an error boundary. The rule is always the **lowest rung that fits**: a page that can still be useful without one read degrades inline rather than throwing away the whole render. The normative ladder, and the rules that enforce it, live in `docs/agents/frontend.agents.md` § Error Handling.

The boundary tier distinguishes two kinds of failure on purpose:

- **Expected errors** are situations the code detects and raises deliberately — "this page cannot render without data that didn't load". They are thrown as a typed `ExpectedError` carrying a registered code (`lib/errors/`), and the boundary shows that code's curated, member-safe copy. The catalog is governed like the log-event catalog: a code is registered in the same change that throws it, so unexplained error screens cannot accumulate.
- **Unexpected errors** are genuine surprises. The member sees a generic branded screen with a short reference code they can quote to support; the team gets the detail in the logs, findable by that same code.

Why the code travels in the error's `digest` rather than its message: production Next.js strips server error messages before they reach the browser — by design, so accidental internals never leak — and the digest is the one field that survives. That same stripping is why boundary copy only ever comes from the registered catalog, never from `error.message`.

Every route group ships its own `error.tsx` so a page failure leaves the group's shell — navigation included — mounted and usable; the root and global boundaries are last resorts. Recovery pairs `router.refresh()` with the boundary's `reset()`, because reset alone re-renders without refetching the server-component data that failed.

Observability is symmetric on purpose: the server records the failure with full pre-stripping detail (`server.error.unhandled`, via `instrumentation.ts` — no stacks, per the logging rules above), and the browser records what the member actually saw. The two records join on the digest. This duplication is deliberate — one side without the other either loses detail or loses ground truth — so it is not "fixed" by deduplication.

---

## Configuration and Environment

`apps/frontend/config/env.schema.ts` is the single source of truth for environment configuration, validated with zod and read through `getServerEnv()` / the public env accessors in `config/env.ts` — never via scattered `process.env` reads.

- Every new env var lands in the schema with a type and default policy before anything reads it.
- The schema is split on the exposure boundary: `serverEnvSchema` for server-only configuration (backend URL, secrets), `publicEnvSchema` for the `NEXT_PUBLIC_*` values the bundle may carry. Secrets are server-only by construction — a secret with a `NEXT_PUBLIC_` prefix is a leak, not a config choice.
- A missing required var fails loudly at validation, not at first use deep in a request.

---

## Definition of Done

Frontend work is complete when all of these hold:

| Check                                                                        | Where defined                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Mutations re-validate input server-side with the strict action schema        | Server Actions; Forms and Validation                               |
| Backend calls go through a gateway; actions through `actionWrapper`          | The Data Path                                                      |
| New log events registered in `FRONTEND_LOG_EVENTS`; nothing sensitive logged | Logging and Observability                                          |
| New env vars declared in `config/env.schema.ts`                              | Configuration and Environment                                      |
| UI composed per the component standards above                                | Build on `@repo/ui`; The Three Tiers                               |
| Touched `CONTEXT.md` files updated                                           | `apps/frontend/CONTEXT.md` and per-directory maps                  |
| `pnpm verify:frontend` (or `pnpm verify`) passes                             | `AGENTS.md` Validation                                             |
| Commit and PR follow the writing charters                                    | `docs/charters/commit-writting.md`, `docs/charters/pr-writting.md` |
| New dependencies were approved and follow the dependency charter             | `docs/charters/dependency-management.md`                           |

Some absences in this charter are deliberate deferred decisions — confirm before "fixing" one.

---

For agents working on the frontend, the rule-shaped checklist at `docs/agents/frontend.agents.md` is the authoritative source — this charter exists for human readers.
