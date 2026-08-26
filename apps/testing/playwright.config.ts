import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

// Load the committed, non-secret test env. dotenv does NOT override variables
// already present in the environment, so a caller can still point the suite at
// a different stack (e.g. CI) by exporting the vars first.
loadEnv({ path: resolve(here, '.env.test') });

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 4100;
const DATABASE_URL = env(
  'DATABASE_URL',
  'postgresql://postgres:postgres@localhost:5433/llstack_test',
);
const BACKEND_API_SECRET = env('BACKEND_API_SECRET', 'dev-backend-api-secret');

/**
 * The rotation run: `E2E_ROTATION=1 playwright test`, which is the second half
 * of `pnpm test:e2e`.
 *
 * `auth-session-rotation.spec.ts` needs the backend to re-issue a token inside a
 * test rather than after an hour, and it is the only spec that does. The
 * shortened interval and grace window used to be pinned for the whole suite,
 * which put every other spec on timings nothing shipping ever runs — a request
 * that crossed a rotation and landed outside an eight-second grace window was
 * refused, and the failure surfaced somewhere unrelated as a bounce to /login.
 *
 * Playwright boots `webServer` once per run, not once per project, so isolating
 * this is a second run rather than a second project: the default run gets the
 * shipped defaults and skips the rotation spec, and this one boots the same
 * ports again with the interval compressed. Both are sequential, so nothing
 * doubles the machine's load.
 */
const rotationRun = process.env.E2E_ROTATION === '1';
const ROTATION_SPEC = '**/auth-session-rotation.spec.ts';

/**
 * Ten seconds is short enough that the rotation spec can wait one out inside a
 * test, and the grace window stays close behind it so a slow dev-mode render
 * still lands inside the window that covers an in-flight request. The backend
 * refuses both of these in staging and production, so they cannot follow a
 * copy-paste into a deployment.
 */
const ROTATE_AFTER_SECONDS = env('AUTH_SESSION_ROTATE_AFTER_SECONDS', '10');
const ROTATION_GRACE_SECONDS = env('AUTH_SESSION_ROTATION_GRACE_SECONDS', '8');

const rotationBackendEnv: Record<string, string> = rotationRun
  ? {
      AUTH_SESSION_ROTATE_AFTER_SECONDS: ROTATE_AFTER_SECONDS,
      AUTH_SESSION_ROTATION_GRACE_SECONDS: ROTATION_GRACE_SECONDS,
    }
  : {};

// Matches the backend's grace window, the way a deployment is told to
// (SECURITY.md's deploy checklist, item 4). Only set when that window has been
// compressed; the default run leaves both apps on their shipped figures.
const rotationFrontendEnv: Record<string, string> = rotationRun
  ? { AUTH_ROTATION_RETRY_SECONDS: ROTATION_GRACE_SECONDS }
  : {};

const FRONTEND_PUBLIC_URL = env('FRONTEND_PUBLIC_URL', `http://localhost:${FRONTEND_PORT}`);
const baseURL = env('FRONTEND_BASE_URL', `http://localhost:${FRONTEND_PORT}`);

// Reuse is OPT-IN. By default the harness always starts the configured commands
// with the pinned backendEnv/frontendEnv (llstack_test DB, test secrets). Attaching
// to a pre-running process would silently run the suite against whatever stack
// already holds the ports (e.g. a dev `llstack_dev` backend), bypassing those env
// overrides — the assertTestDatabaseUrl guard only covers the harness' own
// cleanup client, not a reused backend. Set PLAYWRIGHT_REUSE_SERVER to opt in.
const reuseServer = Boolean(process.env.PLAYWRIGHT_REUSE_SERVER);

// Env injected into the auto-booted backend. These take precedence over the
// backend's own .env (NestJS ConfigModule/dotenv won't override a var already
// set in the process environment), pinning it to the test DB, so a developer's
// own .env can't desync the harness from the backend it boots.
const backendEnv = {
  NODE_ENV: env('NODE_ENV', 'development'),
  PORT: String(BACKEND_PORT),
  DATABASE_URL,
  FRONTEND_PUBLIC_URL,
  BACKEND_API_SECRET,
  ADMIN_API_KEY: env('ADMIN_API_KEY', 'dev-admin-api-key'),
  // The suite may drive many requests from one localhost IP; without this the
  // per-IP throttles trip mid-run. Only honoured outside staging/production
  // (enforced in the backend env schema).
  RATE_LIMITING_ENABLED: env('RATE_LIMITING_ENABLED', 'false'),
  ...rotationBackendEnv,
};

// Env injected into the auto-booted frontend (Next.js).
const frontendEnv = {
  NODE_ENV: env('NODE_ENV', 'development'),
  PORT: String(FRONTEND_PORT),
  BACKEND_INTERNAL_URL: env('BACKEND_INTERNAL_URL', `http://localhost:${BACKEND_PORT}`),
  BACKEND_API_SECRET,
  SESSION_SECRET: env('SESSION_SECRET', 'dev-session-secret-must-be-at-least-32-chars'),
  BINDING_SECRET: env('BINDING_SECRET', 'dev-binding-secret-must-be-at-least-32-chars'),
  NEXT_PUBLIC_APP_NAME: env('NEXT_PUBLIC_APP_NAME', 'LL Stack'),
  ...rotationFrontendEnv,
};

export default defineConfig({
  testDir: './tests',
  // Spec files only, so `tests/helpers/` is shared code rather than an empty
  // test file. Widen deliberately: every spec here boots the whole stack.
  testMatch: rotationRun ? ROTATION_SPEC : '**/*.spec.ts',
  // The rotation spec runs in its own run, under the compressed interval above,
  // and nowhere else. `pnpm test:e2e` does both, in order.
  testIgnore: rotationRun ? [] : [ROTATION_SPEC],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Both apps are booted with `dev`, so the first test to reach a route pays
  // for compiling it. An auth journey crosses three cold routes (create-account
  // or login, the server action, then the dashboard), which alone can outlast
  // Playwright's 30s default before anything is actually wrong.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // One project: the suite covers cross-tier journeys, not browser matrices.
  // Add a second entry here (not a second config) if a journey ever has to be
  // proven on another engine.
  projects: [
    {
      name: rotationRun ? 'chromium-rotation' : 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // The backend is CommonJS and consumes the @repo/* packages at runtime, so
      // their CJS build (the `require` export condition) must exist before the
      // ts-node dev process starts. `pnpm --filter` bypasses turbo's `^build`,
      // so build the backend's dependencies explicitly first.
      command: 'pnpm --filter "@repo/backend^..." build && pnpm --filter @repo/backend dev',
      cwd: repoRoot,
      url: `http://localhost:${BACKEND_PORT}/health`,
      env: backendEnv,
      reuseExistingServer: reuseServer,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @repo/frontend dev',
      cwd: repoRoot,
      url: `http://localhost:${FRONTEND_PORT}`,
      env: frontendEnv,
      reuseExistingServer: reuseServer,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
