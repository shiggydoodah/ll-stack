# Context: apps/testing

## Purpose

- The Playwright end-to-end workspace. It boots the **real** backend and
  frontend against the test database and drives them through a browser — the
  only place in the repo where the whole stack runs together.

## Architecture

- `playwright.config.ts` — the harness. Loads the committed `.env.test`, pins
  ports (backend 3100, frontend 4100), and declares two `webServer` entries with
  explicitly injected env (`backendEnv`, `frontendEnv`), so a developer's own
  `.env` cannot desync the suite from the stack it boots. It also branches on
  `E2E_ROTATION` — see **Two runs** below.
- `global-setup.ts` / `global-teardown.ts` — database preparation and cleanup
  around the run.
- `src/prisma.ts` — the harness's own Prisma client for fixture setup and
  cleanup.
- `tests/frontend-smoke.spec.ts` — the boot smoke: the root page renders with no
  page or console errors.
- `tests/auth-signup.spec.ts` / `tests/auth-login.spec.ts` — the auth journeys:
  register → session + binding cookies → dashboard, and the failure paths
  (missing fields, unticked consent, duplicate email, wrong password, unknown
  email, guest-page bounce).
- `tests/auth-logout.spec.ts` — the `/logout` cross-site gate. Enters from
  `127.0.0.1` (a different site from `localhost`, same machine) with the binding
  cookies cleared, so `/dashboard` 307s to `/logout` and the whole chain arrives
  carrying `Sec-Fetch-Site: cross-site`. Only a real browser produces that value.
  It closes by restoring the signed-in jar it captured up front and navigating
  again: on an empty jar the proxy bounces to `/login` without asking the backend
  anything, so only a restored jar proves the revoke actually landed.
- `tests/auth-sessions.spec.ts` — the account page's session controls: the
  listing, then "sign out other sessions" and the other browser's next
  navigation landing on `/login`. Two browser CONTEXTS, not two tabs — one
  sign-in is one cookie jar, and the whole point is what happens to the other
  one.
- `tests/auth-session-rotation.spec.ts` — token rotation end to end:
  `proxy.ts` → `lib/gateway` → `@repo/services` → `POST /auth/session/rotate` →
  the new cookie in the jar. The only spec in the rotation run.
- `tests/helpers/auth.ts` — account minting, the field locators, and the
  sign-up/sign-in/sign-out moves the auth specs share. Not a spec file, so
  `testMatch` leaves it alone.
- `.env.test` / `.env.test.example` — committed, non-secret; the dev secret
  values must stay byte-identical with both apps' `.env.example` files.

## Key Flows

- `pnpm test:e2e` (root) → turbo → two sequential `playwright test` runs. The
  harness builds the backend's workspace dependencies first (`pnpm --filter
"@repo/backend^..." build`) because the backend is CommonJS and resolves
  `@repo/*` through their `require` export condition at runtime.
- Backend readiness is `GET http://localhost:3100/health`; frontend readiness is
  the root URL.
- `RATE_LIMITING_ENABLED=false` is injected into the backend so the suite can
  drive many requests from one localhost IP. The backend env schema refuses that
  value in staging/production, so it cannot leak into a deployment.

## Two runs

- `auth-session-rotation.spec.ts` needs the backend to re-issue a token INSIDE a
  test, so it runs under `AUTH_SESSION_ROTATE_AFTER_SECONDS=10` with an 8-second
  grace window. Those timings were once pinned for the whole suite, which put
  every other spec on a clock nothing shipping ever runs.
- Playwright boots `webServer` once per RUN, not once per project, so a project
  cannot carry a different backend env. `E2E_ROTATION=1` is the switch instead:
  it narrows `testMatch` to that one spec and injects the compressed interval.
- `pnpm test:e2e` runs both in order — defaults first with the rotation spec
  ignored, then the rotation run. One stack is up at a time and NEITHER RUN IS
  SKIPPED: the script separates them with `;` and gates on both exit codes, so a
  failure in the default run cannot take the rotation run down with it. Chained
  with `&&` it did, and that run is the only place the real middleware rotation
  chain is loaded. `test:e2e:rotation` runs the second half alone.
- `test:e2e:headed` and `test:e2e:ui` cover the default run only.

## Integrations

- `@repo/backend` and `@repo/frontend` are booted as subprocesses, not imported.
- `llstack_test` on `localhost:5433`; `pnpm migrate` must have run.
- Not run in CI. The `e2e` job in `.github/workflows/ci.yml` is commented out,
  so this is a local gate — see `.github/CONTEXT.md`.

## Gotchas

- **Server reuse is opt-in** (`PLAYWRIGHT_REUSE_SERVER`). By default the harness
  always starts its own processes: attaching to whatever already holds the ports
  would silently run the suite against a dev `llstack_dev` backend, bypassing
  every env override — and `assertTestDatabaseUrl` only guards the harness's own
  cleanup client, not a reused server.
- `dotenv` does not override variables already in the environment, so exporting
  vars first is how you point the suite at another stack (e.g. CI).
- Both apps run under `dev`, so the first test to reach a route pays for
  compiling it. The 60s `timeout` is sized for that, not for slow assertions.
  `auth-session-rotation.spec.ts` raises its own to 120s: it has to sleep
  through a ten-second rotation interval (twice, in one test) before it can
  assert anything, and that leaves nothing for a cold route on top.
- Test accounts MUST come from `createTestAccount()` in `tests/helpers/auth.ts`:
  global-teardown deletes by the `@llstack.test` suffix, and the random local
  part is what keeps parallel workers off the unique email index.
- The form fields render their required `*` inside the `<label>`, and the
  password field's show/hide toggle carries an `aria-label` ("Show password").
  Locate controls with the anchored label regexes in the helper rather than a
  bare `getByLabel('Password')`, which matches both.
- `test:e2e` is `cache: false` in `turbo.json` and takes `FRONTEND_BASE_URL` as
  its only declared env input.

## Agent Notes

- New E2E spec → add it to `tests/` as `*.spec.ts`; shared code goes under
  `tests/helpers/`, which `testMatch` does not collect. It lands in the default
  run, which is what you want unless it needs the compressed rotation interval.
- Prefer backend integration specs (`apps/backend/test/`) for API behaviour;
  keep this suite for genuinely cross-tier journeys.
- Not runnable without Postgres up and both apps buildable.
