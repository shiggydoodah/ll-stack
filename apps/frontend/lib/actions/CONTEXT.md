# Context: apps/frontend/lib/actions

## Purpose

- The Server Action envelope every action in this app must go through:
  request-context propagation, an explicit auth gate, structured lifecycle
  logging, timing, and correct handling of Next's control-flow throws.
- Concrete actions live in `app/actions/` or beside their route — not here.

## Architecture

- `action-wrapper.ts` — `actionWrapper(name, action, options)`. The wrapped
  action keeps its original `(...args) => Promise<TReturn>` signature; the body
  receives an `ActionAuth` as its first argument.
  - `auth: 'none' | 'light' | 'full'` (default `'light'`).
    - `'none'` — public entry point (login, register).
    - `'light'` — session cookie must be present, **not** validated. No network:
      the gateway forwards the cookie and the backend re-validates.
    - `'full'` — `validateSession()` against the backend, exposes `userId`. Use
      when the action needs the id, or does work that never touches a gateway.
  - `onAuthMissing: 'redirect' | 'throw'` (default `'redirect'`). `'full'`
    additionally clears the stale cookie before redirecting.
  - `details(...args)` — a **safe projection** of the arguments for the
    `action.request.details` trace line.
- `with-request-context.ts` — reads `x-correlation-id` / `x-session-id` (set by
  `proxy.ts`) and runs the callback inside the `AsyncLocalStorage` store.
  `actionWrapper` composes it internally, so wrapped actions never import it —
  route handlers like `/logout` do.

## Key Flows

Per invocation: auth gate → `action.request.called` (info) → optional
`action.request.details` (trace) → body → `action.request.completed` (trace) or
`action.request.failed` (error).

## Gotchas

- **`unstable_rethrow` is load-bearing.** `redirect()`/`notFound()` throw on the
  _success_ path; without it every successful redirect would be logged as a
  failure.
- `details` must return booleans, enums, and ids — never raw PII (emails, names,
  free text). `serverLogger` deep-redacts known keys as a backstop, not a
  licence.
- `error.stack` is deliberately never logged: it can embed file paths and
  interpolated values.
- `'light'` genuinely does not validate — if an action needs a trustworthy
  `userId`, it must use `'full'`.

## Agent Notes

- Every server action gets `actionWrapper` with a **deliberate** auth mode; the
  default is not a decision.
- Actions must re-validate their input server-side with the strict action zod
  schema even though the form already validated it.
- Covered by `with-request-context.test.ts` and the action specs under
  `app/actions/`.
