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

Gateways (`apps/frontend/lib/gateway/`) are the only consumers of the generated `@repo/services` clients. One file per backend domain — `auth.ts`, `users.ts`, `dashboard.ts` — each starting with `import 'server-only'` so a client-bundle import is a build error, not an incident.

The layer is two halves, split on purpose:

| Half                 | Lives in                         | Owns                                                                                                                                              |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gateway function | `lib/gateway/<domain>.ts`        | Everything domain-specific: which generated client function to call, how the caller's options are merged, and what shape comes back to the app    |
| `gatewayWrapper`     | `lib/gateway/gateway-wrapper.ts` | Everything generic: session-cookie injection, correlation headers, lifecycle logging with timing, and normalizing every outcome into one envelope |

Why split it there: the generic half is identical for every call and easy to forget one piece of, so it is written once and cannot be opted out of. The domain half differs per endpoint and belongs beside the endpoint. The payoff is that a new gateway function is a few lines saying _what to call_ and _what comes back_ — and says nothing about auth or logging at all.

### Anatomy of a gateway function

```typescript
type ThrowOnError = false;
const SERVICE_NAME = 'auth gateway';

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

Four things are load-bearing here:

- **The call is passed in as a callback, not made by the wrapper.** The wrapper cannot know the shape of a given client function's options, so it builds the headers and hands them back; the gateway merges them into the options it was given. Wrapper headers are spread last, so a caller can add headers but cannot overwrite the session cookie or the correlation ids.
- **`type ThrowOnError = false`** pins the generated client's `Options` to its non-throwing variant. A caller cannot ask the client to throw and route around the envelope — every outcome comes back as `{ data, error, response }` for the wrapper to normalize.
- **The caller's `Options` type comes from the generated client** (`Options<LoginUserData, …>`). The gateway does not re-declare the request shape, so a backend contract change lands as a compile error in the gateway rather than a runtime surprise in a component.
- **`logContext` follows `` `[${SERVICE_NAME}] <operation>` ``** — every log line from this call is greppable by domain and by operation.

### What the wrapper does on every call

1. Builds the correlation headers (`x-request-id`, `x-session-id`) from the request context that `withRequestContext` put in AsyncLocalStorage. Empty outside a request context — see Cached reads.
2. Resolves the session cookie when `withAuth` is true, and merges it with the correlation headers.
3. Emits `gateway.request.started` (**debug**) — booleans only: `withAuth`, `hasSession`, `hasCorrelation`. Never the cookie value, never the ids.
4. Emits `gateway.call.dispatched` (**trace**, development) — header _names_ only, so you can confirm what was attached without the values ever reaching a log sink.
5. Invokes the gateway's callback with those headers, then puts the raw result through `normalizeServiceResponse` to get a `ServiceResult`.
6. Emits `gateway.call.completed` (**trace**) — `ok`, status, duration, `hasData`. Brackets step 4 so a call is visible even when it never returns.
7. Emits the one durable lifecycle line, at a severity keyed to the outcome, with the backend's `x-trace-id` folded in when the response carried one.

| Outcome                                                         | Level   | Event                         |
| --------------------------------------------------------------- | ------- | ----------------------------- |
| `ok: true`                                                      | `info`  | `gateway.response.successful` |
| Status ≥ 500, including the synthetic 503 for a network failure | `fatal` | `gateway.request.failed`      |
| 400 or 429                                                      | `error` | `gateway.request.failed`      |
| Any other failure (401, 403, 404, 409, 422…)                    | `warn`  | `gateway.request.failed`      |

Why a ladder rather than one level: an expected rejection is not an incident. A 401 or a 404 is the system working. A 5xx or an unreachable backend is an outage. A 400 sits between them and means _we_ sent something the backend refused — since actions re-validate before calling, that is a frontend bug worth surfacing — and a 429 means something is hammering a limit. The levels are the alerting policy, written where the call happens.

Failure logs carry a **sanitized** error, never the raw payload: `sanitizeGatewayError` lifts only `code` and `message` off the backend envelope. Backend errors can embed submitted emails, validation detail, or tokens, and the structured log stream must never become a PII sink.

The backend's trace id is read off the response header (`readBackendTraceId`) and attached to the gateway's own log line, which is what makes a Next-server log line and a backend trace joinable from one search.

### The `ServiceResult` envelope

```typescript
export type ServiceResult<T, E = unknown> =
  | { ok: true; status: number; message: string; data: T; response: Response }
  | { ok: false; status: number; message: string; error: E; response: Response | undefined };
```

Why an envelope instead of exceptions: callers are forced to handle the failure branch at the call site — there is no forgotten `try/catch` — and a network failure (normalized to `status: 503` with no response) is handled by the same code as an HTTP 4xx. There is exactly one failure channel.

Callers branch on the envelope, not on strings. Status is the common axis (`loginAction` maps 429 → "too many attempts", ≥ 500 → generic error, everything else → a deliberately vague "invalid email or password"). When the branch depends on _which_ backend error it was, `errorCode(result.error)` (`lib/gateway/error-code.ts`) pulls the stable code out of the uniform `HttpExceptionFilter` envelope — branch on that code, never on `message`, which is user-facing copy and free to change.

### Handling the data

A gateway function returns one of two shapes, and choosing between them is the real design decision in the layer:

- **Pass the envelope through** — `getDashboard`, `login`, `register`, `logout` return `ServiceResult<T, E>`. Use this when callers must distinguish _how_ the call failed, or need the raw `Response` (`loginAction` reads `set-cookie` off it).
- **Unwrap to a domain value** — `getCurrentUserForSession` returns `AccountDto | null`. Use this when every caller wants the same answer and none can act on the difference between failure modes. To a session guard, "no cookie", "revoked session", and "backend down" all mean the same thing: not authenticated, fail closed.

Unwrapping is where the gateway earns its place: it is the point at which the backend's _maybe_ becomes the app's type. `parseCurrentUser` in `users.ts` is the worked example — a response that is `ok: true` but carries no `account` is contract drift, so it logs `user.current.account_missing` and returns `null` rather than letting a null-deref surface three layers up in a component. Validate the shape you claim to return; do not assert it.

What a gateway must **not** do: feature logic, user-facing copy, redirects, or deciding what a status _means to the member_. A gateway that maps 409 to "that email is already taken" has taken the server action's job — and the next caller inherits a decision it never made.

### `withAuth`, and the two reasons to turn it off

`withAuth` defaults to **true**: the wrapper resolves the session cookie and attaches it. Turning it off has two distinct meanings, and they are not interchangeable:

- **The endpoint is genuinely public** — `register`, `login`. There is no session yet.
- **The caller supplies the session itself** — the cached path. `getCurrentUserForSessionValue` builds the header with `buildSessionCookieHeader(session)` and passes `{ withAuth: false }` so the wrapper does not reach for `cookies()`. This is still an authenticated call; `withAuth: false` only says _the wrapper is not the one resolving the session_.

So `withAuth: false` is not by itself "this call goes out unauthenticated" — reading it means checking which of the two cases applies, and the second must pass a cookie header of its own. Correlation headers are forwarded either way; they are not session material.

### Cached reads

Read gateways that serve many renders use the Next cache, with the repo's named knobs rather than ad-hoc numbers:

- `'use cache'` on the cached function, `cacheLife(cacheLifeProfiles.<profile>)` from `lib/cache/life.ts`, and `cacheTag(cacheTags.<entity>(id))` from `lib/cache/tags.ts` so mutations can invalidate precisely.
- Session-scoped reads compose `withSessionCache` (`lib/cache/utils.ts`), which resolves the session cookie outside the cache boundary and passes it in as an argument — request-scoped APIs (cookies, AsyncLocalStorage) do not exist inside `'use cache'`. This is why the cached path uses `withAuth: false` with an explicit cookie header, and why cached reads are correlation-blind by design; that trade is accepted for the cache hit.
- **Auth checks never read from a cache.** `validateSession` goes through the uncached path with `cache: 'no-store'` so a revoked session cannot be papered over by a warm entry; `React.cache` dedupes it within a single render, nothing more. The cached read exists for _display_ (`getCurrentUserCached`), never for a decision.

`getCurrentUserCached` in `lib/gateway/users.ts` is the worked example of the whole pattern.

### Escape hatches

`gateway-wrapper.ts` exports three helpers for calls that cannot take the standard path, all so an unusual call still gets _part_ of the standard treatment — never so it can skip the wrapper:

| Helper                              | For                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `buildSessionCookieHeader(session)` | Building the cookie header from a session held as a value rather than read from the request (cached path) |
| `withCorrelation(options)`          | Merging correlation headers into a generated-client options object outside the wrapper's callback         |
| `readBackendTraceId(response)`      | Reading the backend's `x-trace-id` off a response for a log line of your own                              |

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

### Session binding and the idle timeout

Alongside the session cookie the frontend mints a **binding token**: an HMAC over the session token, keyed on `BINDING_SECRET` (`lib/auth/`). The proxy checks it before admitting any member request, which is the CSRF and session-fixation defence the lax session cookie doesn't give on its own. It rides in two cookies carrying the same value, a `SameSite=Strict` one that does the work and a `Lax` companion accepted on GET and HEAD only, so following a link in from email isn't read as a failed binding.

The token's expiry is this app's **idle timeout**, `AUTH_IDLE_TIMEOUT_SECONDS`, 8 hours by default. The proxy rolls both cookies forward on member requests of every method, server-action POSTs included, so the clock advances only while the browser is genuinely idle. When it lapses the proxy sends the browser to `/logout`, which revokes the session backend-side; there is no re-authentication prompt. Keep it below the backend's `AUTH_SESSION_TTL_SECONDS` (7 days): that one is the ceiling on a session's life, this is the window inside it.

The roll doesn't happen on literally every request. The proxy writes the pair when it has something new to record or when the binding is past half its life, which keeps `Set-Cookie` off most responses and narrows the window in which a slow response can land after a faster one and overwrite a fresh binding with a stale one.

### Driving session rotation

The backend re-issues the session token on an interval and treats a re-presented retired token as theft (`docs/charters/backend.md`). Something has to ask it to, and write the new token back to the browser, and in this app that can only be `proxy.ts`. Cookies can be set from middleware, route handlers, and server actions; `validateSession()` runs during RSC render, which cannot set cookies, so rotation cannot ride on the `/users/me` call every member page already makes.

The proxy asks on GET and HEAD only, and only once the deadline carried inside the binding token has passed, so this costs roughly one extra backend call per rotation interval rather than one per request. A navigation's response is the one a browser is most likely to process; a rotation landing anywhere else risks the new token never reaching the jar, which leaves the browser holding exactly what the backend's reuse alarm looks for. The deadline lives inside the HMAC rather than in a cookie of its own, because a browser that could move it forward could put off its own rotation indefinitely.

Each answer has one correct response, and `superseded` is the one that reads oddly. It means another request rotated the same token and holds the successor, so the proxy writes **nothing at all**. A binding minted there would be over the retired token, and arriving second it would leave the jar holding a session cookie and a binding that no longer agree, which is a forced sign-out on the next request. `rotated` writes the new session cookie, re-mints the binding over the new token, and rewrites the forwarded `cookie` header so this request's own render uses it.

A 401 goes to `/logout` — but only one carrying `SESSION_INVALID`. This route's 401 is overloaded, because the backend's global `ApiSecretGuard` answers it too, and reading the bare status as a sign-out turns a `BACKEND_API_SECRET` that is present but wrong into a mass sign-out: every signed-in visitor redirected to `/logout` as their deadline passes, each one revoking their own session on the way, and fixing the secret bringing none of them back. Anything else, whether a timeout, a 500, a guard refusal, or a missing `Set-Cookie`, leaves the session alone and backs off `AUTH_ROTATION_RETRY_SECONDS`: a rotation that could not happen is a missed improvement, while a rotation that signs people out on a network blip is worse than never having rotated at all.

That back-off is coupled to the backend's `AUTH_SESSION_ROTATION_GRACE_SECONDS` and has to stay at or below it. A rotation can commit and still lose its answer on the way back here, which leaves the browser on a token the backend serves for the length of the grace window and refuses after it. Asking again inside the window gets `superseded`, which writes nothing and asks again on the next navigation; the first ask past it lets the backend see that no successor was ever used and restore the token. A back-off longer than the window opens a stretch where nothing asks and every render's own backend call is refused, which signs the visitor out before the retry can fire.

Neither app can read the other's env, so both `.env.example` files carry the rule — the same arrangement `AUTH_IDLE_TIMEOUT_SECONDS` and `AUTH_SESSION_TTL_SECONDS` already live under.

The rewrite of the forwarded cookie header is what bounds that recovery. Because this request's own render spends the new token, a successor the backend has seen used is a successor this app received, and an unused one is proof the rotation call never came back. A response lost between here and the browser therefore reads as reuse and signs the visitor out. Leaving the render on the retired token would cover that case and would cost more than it saves, since `firstUsedAt` would then mean only that the browser has not come back yet — `SECURITY.md` has the full trade.

### Signing out

`/logout` is a GET route handler, which is what lets the proxy and the layout guards send a browser there with a plain redirect. A GET that changes state is also one any other site can fire off with an `<img>` tag, so the handler refuses every cross-site request with a 403 before it touches a cookie.

`Sec-Fetch-Site` on its own is the wrong test, because browsers compute it over the request's whole URL list. A visitor who follows an emailed link into `/dashboard` and gets redirected here still carries `cross-site` on the second hop, and refusing that left them holding a session cookie only this route clears. Narrowing the refusal to subresources was the first attempt at that and it gave the route away: `<a target="_blank">`, `window.open`, and a redirect from an attacker's page are all top-level navigations, so any site could force a sign-out again.

So the app identifies its own redirect instead. `logoutRedirectPath(sessionToken)` appends a two-minute HMAC keyed on `BINDING_SECRET` and signed over the session cookie the redirect was minted for; a cross-site top-level navigation whose token matches the session cookie it arrives with is our own hop, and everything else cross-site is refused.

Signing over the cookie is the half that does the work. A signature only this server can produce sounds like enough and isn't, because an attacker never has to mint a token — this app mints one for anybody who asks. The proxy answers a member-page request carrying a session cookie it can't match a binding to with a 307 to `/logout?t=…`, so a single curl with a made-up cookie reads a live token out of the `Location` header. Bound to the cookie value, that token fails against the session a victim's browser actually sends, and no other origin can read theirs to sign over. The session cookie is `SameSite=Lax`, so it rides on the top-level cross-site navigation being checked.

The destination check stays alongside it, and a valid token does not excuse a subresource. The token rides in a query string, so the address bar, the browser history, and every access log in front of the app hold a copy of it for two minutes; without the second condition, one read out of a log turns `<img src="/logout?t=…">` back into a forced sign-out. Our own redirect is always a navigation, so requiring one costs it nothing.

The binding is to a session, not to a user or a device, because `/logout` has to run for lapsed and absent sessions too. A leaked token signs out the one session it names, inside its two minutes, exactly as an in-app link already does. A bookmarked `/logout` sends `none`, an in-app link sends `same-origin`, and a browser too old to send the headers at all is let through.

The revoke itself is best-effort. If the backend call fails the handler logs `auth.logout.revocation_failed` and still clears the session cookie, both binding cookies, and the `llstack_sid` log id, because a backend outage must never leave a browser holding a cookie it can't clear.

### The route-group guard ladder

Pages are guarded by **route group**, in the group's layout — a server component that validates the session and redirects on any shortfall:

| Route group        | Layout guard        | Required account state                                  |
| ------------------ | ------------------- | ------------------------------------------------------- |
| `(public)`         | none                | —                                                       |
| `(public)/(guest)` | `validateSession()` | **No** session — a session-holder goes to the dashboard |
| `(members)`        | `validateSession()` | Session + verified email                                |

Each layout fails closed: an invalid or missing session logs `session.validation.failed` and redirects to logout (which clears the cookie); a valid session in the wrong state is forwarded to where that state belongs — unverified to `/verify-email`, verified out of the guest pages to the dashboard. A backend that cannot answer is not an invalid session: `validateSession` throws on a 5xx, a 429, or a bare 401, and the render fails to the error boundary with the visitor's cookies intact, the same rule rotation already follows. New protected areas follow the same shape: a route group, a layout guard, explicit required state.

The `(guest)` group nested inside `(public)` holds the guest entry points — home, login, create-account — and inverts the check: a valid session is forwarded to the dashboard (whose layout routes wrong-state accounts onward), while the rest of `(public)` (terms, privacy, verify-email, password reset) stays reachable regardless of session. The guard is two layers, deliberately. The proxy fast-paths the redirect on session-cookie _presence_ before any HTML is served — the guest pages' prerendered static shells would otherwise paint before the layout's dynamic redirect streams in, a visible flash of guest UI on every signed-in visit. The `(guest)` layout then remains the authoritative check, redirecting only on a _validated_ session (reusing the `React.cache`'d read the public layout already performs for its header, so it costs no extra backend call); it also covers requests the proxy matcher exempts, such as prefetches. A stale cookie that fools the proxy self-heals: the dashboard's layout kills the session through `/logout`, which clears the cookie.

Auth is then enforced at all three layers of the data path — layout guards for pages, the `actionWrapper` auth mode for mutations, and `gatewayWrapper`'s cookie injection (with the backend's own validation) for every call. The layers back each other up; none is trusted alone.

What the frontend never does: role or permission checks. Capability gating (Gate A/B) and ownership live in the backend; the frontend branches only on the account-state fields the backend reports and renders whatever the backend allows or denies.

---

## Logging and Observability

Logging is structured, through `@repo/logging`: `serverLogger` (`apps/frontend/lib/logging/server-logger.ts`) on the Next server, and a browser logger (`lib/logging/client-logger.ts`) that batches records to `/api/client-logs`, where they re-enter the same sink pipeline. `console.log` does not exist in frontend code.

- Log events use names registered in `FRONTEND_LOG_EVENTS` (`lib/logging/log-events.ts`), following the `segment.topic.detail` convention (`gateway.request.failed`, `auth.login.session_missing`) — a greppable vocabulary, not freeform strings. New events are added to the catalog in the same change that emits them.
- **Redaction is maintained, not assumed.** The shared redaction layer (`packages/logging/src/log-redaction.ts`) scrubs token-like values and sensitive keys; the wrappers sanitize errors to `{ errorName, errorMessage }` / `{ errorCode, errorMessage }` and never log payloads. Server-side records never carry error stacks — a server stack can embed file paths and interpolated values. Browser-emitted `client.error.*` records are the one deliberate exception: they keep the minified browser stack, because it is often the only clue a client-side crash leaves, it is minified and low-sensitivity, and it still passes sink-side redaction. Introducing a new sensitive field means extending redaction in the same change.
- **Log decisions, not payloads.** Action `details` projections and gateway failure logs record shape and outcome (`{ hasEmail: true }`, status, duration) — never the submitted values. The body that failed validation is exactly what must not be logged.
- **The ingest route is off until an operator turns it on.** `CLIENT_LOG_INGEST_ENABLED` defaults to false and `/api/client-logs` answers 404 while it is — before its rate limit, before a byte of body is read — because an anonymous, internet-writable endpoint must be a choice, not a default a template made for you. This is the house posture for optional infrastructure (OpenTelemetry ships wired up and off), and it is never silent: the boot log names the variable (`server.client_logs.ingest_disabled`), at the level the state earns — `info` when the browser half is off too and the two halves agree, `warn` when `NEXT_PUBLIC_LOG_REMOTE` is `true` and the shipped bundle is posting batches into that 404. One level for both lost something in either direction: `info` alone made the line that explains the silence conditional on `LOG_LEVEL`, and `LOG_LEVEL=warn` is an ordinary production posture, not an exotic one; `warn` alone fired on every boot of every app that never opted in, which is how a channel teaches operators to skim past it — the same boot-time channel that carries the genuinely actionable `server.trust_proxy.degraded`. The browser half, `NEXT_PUBLIC_LOG_REMOTE`, defaults off too, and the server flag is authoritative — the public flag cannot re-open ingestion. **Off means console-only, not discarded.** With no remote sink the browser logger writes `warn` and above to the browser console in every environment, not just dev: `client.error.boundary` and `client.error.expected` come from a React boundary, which swallows the underlying throw, so the browser's own error reporting does not cover them and a dev-only console path made a default production build compute those records and drop them. The fallback carries its own severity floor rather than inheriting `NEXT_PUBLIC_LOG_LEVEL`'s, because that threshold does not bound it: the production default is `info` and the variable ships unset, so an unfloored fallback wrote a structured `client.session.start` — `captureUserEnv()` attached — into every visitor's console on every page load. Below the floor a build with no remote sink drops the record, which is what "no sink configured" means for a breadcrumb. The floor bounds severity and cannot bound anything else, so the two events the browser reports itself — `client.error.unhandled` and `client.error.rejection`, emitted at `error`, above any floor that keeps `client.error.expected` — are excluded from the fallback by name: the browser has already printed both with a source-mapped stack, and a structured duplicate is the same news twice in every visitor's console. The exclusion narrows the console path only; remote posting still carries them. That path is guarded on `window` for the same class of reason: this module is importable from any client component, a client component renders on the server too, and `console.error(message, record)` under Node is a multi-line `util.inspect` blob in a stdout stream read one JSON line at a time — a malformed record at the collector rather than mere noise. Dev is deliberately left unguarded, because a dev terminal is a person's screen and not a collector's input. **Both `NEXT_PUBLIC_*` halves are inlined at build time**, so `NEXT_PUBLIC_LOG_REMOTE` has to be set when the bundle is built and a change to it needs a rebuild, not a restart. That inlining is not client-only — Next spreads every `NEXT_PUBLIC_*` present in the build environment into the define config with no client/server guard — so the boot notice's `browserRemoteEnabled` is the value the app was BUILT with, and on the prescribed configuration it reports what the shipped bundle actually does rather than merely what the process was handed. It over-reports in one shape only: the variable absent at build and set only in the runtime environment, where no define was emitted, the server falls back to a live `process.env` read, and the bundle sends nothing. `.env.example` and `SECURITY.md`'s deploy checklist say so where the operator meets it, because that is the only place it is fixable.

- **The ingest route is capped because it is anonymous.** Once enabled, `/api/client-logs` cannot require a session — a browser has none before login, and pre-login errors are exactly the ones worth having — so every limit on it has to hold against a hostile caller: cross-site and non-JSON refusals on raw headers (`Sec-Fetch-Site`/`Origin`/content-type, checked before the rate limit because header reads are cheaper than the limiter's map work — this stops other websites weaponising real visitors' browsers and does not stop `curl`; a floor, not a lock), a rate limit (`lib/logging/client-log-rate-limit.ts`), a body-size and record cap, per-record shape caps, server-side re-redaction, and server-authoritative identity fields. **The event catalog and the severity are enforced server-side.** A record whose `event` is not one of the `client.*` names in `CLIENT_INGESTIBLE_EVENTS` is never written — the browser's own catalog check binds nobody — and the written `level` is derived from the event via `FRONTEND_LOG_EVENT_LEVELS`, never taken from the record: level is what alerting and paging key on, and clamping a caller-chosen number still let anyone post `fatal` and page the on-call, so no client event maps to the paging tier at all. The gate is the `client.*` subset rather than the whole catalog because the catalog also holds every event only server code emits: membership in it let an anonymous caller post `server.trust_proxy.degraded`, `server.client_logs.throttled`, `server.error.unhandled`, or any `gateway.*`/`action.*`/`auth.*` record — fabricating, during an attack, the exact lines an operator reads to diagnose one. `source: 'frontend-client'` marked them, but a convention to remember while reading a dashboard is not a control. **The header refusals are reported, not just returned.** They answer with a bare status and the browser logger fires and forgets, so silence made them invisible on both sides at once — and the one an operator actually meets is not an attack: the `Origin` check compares against the `Host` header this process received, so a proxy that rewrites `Host` rather than preserving it fails every real browser request and drops all browser telemetry. `server.client_logs.refused` carries the reason, once per window per reason, on the same budget every other report here uses — and, on an `origin_mismatch`, which comparand was in force (`originCheck`, plus the configured origin itself when one is set), because a record identical in both modes cannot separate "the override is not being read" from "the override is being read and is wrong", and the override is itself the repair for the first fault. The configured value is operator-set and schema-normalised so it is ours to record; the request's `Origin` and the `Host` it would have been matched against are caller-written and never are — and `CLIENT_LOG_ALLOWED_ORIGIN` repairs the state where the proxy is not the operator's to change: it names the origin browsers address, and because the operator sets it and a caller cannot, it does not reopen what honouring the caller-written `X-Forwarded-Host` would. It replaces the `Host` comparison rather than widening it. **Each record's shape is bounded with flat generic caps** — field count, string length, nesting depth, array length — because the batch caps left those holes open below themselves; per-event schemas were considered and rejected as a permanent maintenance tax on every adopter who adds an event. Every cap accounts for what it took: a string truncates in place and an over-deep subtree is replaced whole, and the two caps that can only remove — fields and array entries — report how many they removed as `fieldsDropped` and `arrayEntriesDropped` on the record, so neither a `digest` that sat past the field cap nor a 100-entry array is ever read as what the browser actually sent. Those two counts are TOP-LEVEL rather than left in place, because an in-place mark does not survive every sink: the OTLP payload serialises a non-scalar attribute to JSON and cuts it at 4 KiB, so the whole of `context` arrives as one string whose tail — where a mark sits — is the first thing lost, on exactly the wide records the counts exist to describe. Two fixed names, added only to records that lost something, cost the index nothing a hostile caller can grow. **The record is also reshaped, because a field cap does not bound index cardinality.** An index degrades on the aggregate number of distinct property names it has ever seen, and every caller-chosen key used to reach the sink as a top-level property name of its own; a per-record cap of 32 narrows that per record and bounds the total not at all, since the record allowance behind it is sized for volume and nothing was ever sized for schema width — at the shipped defaults one caller inside every allowance can mint ~384 000 distinct names a minute. So the envelope keys stay at the top level and everything else nests under a single fixed `context` key: the sink sees a fixed top-level set whatever arrives, and the caps apply inside `context` unchanged. The cost is deliberate and worth naming — a browser field is queried as `context.digest`, not `digest`. **The caller's clock is separated from ours**: `timestamp` is server-set at ingest (equal to `ingestedAt`), and the client's claim survives only as `clientTimestamp` inside a ±15-minute skew bound — absent when unusable, never clamped into a plausible lie. **`traceId` and `spanId` are dropped rather than forwarded**, because the Seq sink does not treat them as ordinary context: it reifies them into CLEF's `@tr`/`@sp` trace built-ins and excludes them from the property copy, so a caller-supplied value is used _only_ as trace identity. That is enough to graft a fabricated record onto a real distributed trace — the same attack the `client.*` event gate exists to close, one field over — and a value that is not 32-char hex draws a Seq 400, which the sink classifies as non-retryable and answers by dropping the whole batch to stdout fallback, evicting up to 99 unrelated server records from the dashboard per poisoned client record. A browser record has no server trace context of its own, so nothing is lost. `sessionId` takes the same shape check as the correlation ids and is omitted when it fails: it was the one envelope field that was neither server-owned nor validated, accepted verbatim up to 4 KiB under a name dashboards group and join by. **The limit meters requests and records separately, because a request is not the unit a log sink is priced in.** Requests are charged before the body is read, which is what makes shedding a flood cheap; the body itself is byte-counted as it streams in, cut off at the cap rather than buffered whole; records are charged once the batch is parsed — in byte-aware units, so an oversized record costs what its bytes carry — and are the ingest ceiling proper. A request cap alone was the earlier design and it metered the wrong thing — one request may legally carry 100 records, so a caller packing every batch bought roughly a hundred times the ingest of one who sends them singly, against a control whose entire purpose is bounding what the sink swallows. Both charges stand even when the request is refused: refunding an over-budget batch would let a caller probe the remaining headroom and re-send forever. **Every request spends two buckets: its own and the whole-app one.** Buckets are per client IP only as far as `TRUST_PROXY` says `X-Forwarded-For` is infrastructure-written, and alongside the per-client charge every request also spends the shared bucket, held to the `..._SHARED_PER_MINUTE` pair — the global ceiling. Per-client XOR shared was the earlier design and it left no global ceiling at all once per-client buckets were on: a distributed caller with fresh addresses multiplied the per-client allowance freely while every individual address paid retail. The per-client bucket stops one abuser; the shared bucket stops all of them together, and a global-ceiling rejection is deliberately loud (`sharedBucket: true` on the throttle record) — a silent global cap is an observability outage, not a security win. Anything unvouched-for is metered on the shared bucket alone, so the limit degrades to an app-wide ingest cap rather than to nothing; the shared pair is sized as a whole-app ceiling (a whole-app ceiling sized like a per-client one is not a conservative default, it is an outage waiting for traffic), and the schema refuses a shared figure below its per-client counterpart. Trusting a hop count is a deployment claim the app cannot verify, so both ways of getting it wrong are made visible rather than assumed away: a form this runtime cannot evaluate is reported at boot (`server.trust_proxy.degraded`), and both request-time shapes of a wrong one are reported too: a chain shorter than the declared depth — what an over-declared count produces on every single request, silently collapsing everyone into the shared bucket — as `server.trust_proxy.chain_too_short`, and a selected entry that is not an IP literal at all — a proxy writing a hostname or the RFC 7239 `unknown` token, which collapses everyone the same way — as `server.trust_proxy.entry_not_an_address`. Reporting one and not the other was an asymmetry, not a design: the operator-visible outcome is identical. Two things follow from a bucket being an address rather than a person (for IPv6, a /56 network rather than an address — a v6 subscriber holds a whole delegated block, so anything finer lets one host mint buckets freely): keys are restricted to canonical IP-derived literals so a caller-written entry cannot spray the map, and the per-client allowance is sized for NAT and for a tab bursting on its 20-record flush, not for the idle flush cadence. Dropping a batch costs one batch of observability and nothing else — the browser logger fires and forgets. What no code here can enforce, `SECURITY.md`'s deploy checklist says in prose: shed floods in front of Next with an edge/WAF rule, cap the bill at the sink with a hard quota, route `source: 'frontend-client'` to its own dataset, and never alert on client logs alone or cite them as evidence — they are attacker-writable by design.
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

| Check                                                                        | Where defined                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Mutations re-validate input server-side with the strict action schema        | Server Actions; Forms and Validation                             |
| Backend calls go through a gateway; actions through `actionWrapper`          | The Data Path                                                    |
| Every gateway result's `ok: false` branch is handled at the call site        | Gateways                                                         |
| New log events registered in `FRONTEND_LOG_EVENTS`; nothing sensitive logged | Logging and Observability                                        |
| New env vars declared in `config/env.schema.ts`                              | Configuration and Environment                                    |
| UI composed per the component standards above                                | Build on `@repo/ui`; The Three Tiers                             |
| Touched `CONTEXT.md` files updated                                           | `apps/frontend/CONTEXT.md` and per-directory maps                |
| `pnpm verify:frontend` (or `pnpm verify`) passes                             | `AGENTS.md` Validation                                           |
| Commit and PR follow the writing charters                                    | `docs/charters/commit-writing.md`, `docs/charters/pr-writing.md` |
| New dependencies were approved and follow the dependency charter             | `docs/charters/dependency-management.md`                         |

Some absences in this charter are deliberate deferred decisions — confirm before "fixing" one.

---

For agents working on the frontend, the rule-shaped checklist at `docs/agents/frontend.agents.md` is the authoritative source — this charter exists for human readers.
