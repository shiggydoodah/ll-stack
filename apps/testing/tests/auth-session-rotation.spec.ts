import { expect, test, type Page } from '@playwright/test';

import {
  createTestAccount,
  routes,
  signOut,
  signUp,
  SESSION_COOKIE_NAME,
  type TestAccount,
} from './helpers/auth';

/**
 * Session token rotation, end to end: `proxy.ts` → `lib/gateway/auth` →
 * `@repo/services` → `POST /auth/session/rotate` → the new cookie in the jar.
 *
 * THE POINT OF RUNNING THIS AT ALL is that the rotation call is the only backend
 * request this app makes from middleware. It pulls `lib/gateway/gateway-wrapper`
 * (which imports `next/headers`) and `@repo/services/auth` (whose `client-env.ts`
 * is `server-only` and throws at import time without `BACKEND_API_SECRET`) into
 * the middleware bundle. A bundling or runtime-boundary failure there shows up on
 * every request, because the matcher covers every page — and the unit suites all
 * mock `session-rotation`, so nothing else loads the real chain.
 *
 * `playwright.config.ts` shortens `AUTH_SESSION_ROTATE_AFTER_SECONDS` for this;
 * at the shipped hourly default no test run would ever reach a rotation.
 */

/** The rotation interval the harness pins the backend to, plus room to cross it. */
const PAST_THE_ROTATION_INTERVAL_MS = 11_000;

const sessionCookie = async (page: Page): Promise<string> => {
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
  expect(session, 'expected a session cookie').toBeDefined();
  return session?.value ?? '';
};

test.describe('Session token rotation', () => {
  // Double the suite default. These tests cannot go faster than the interval
  // they exist to cross — the backend re-issues after ten seconds and nothing in
  // the browser can bring that forward — so a test here spends 11s or 22s
  // asleep before it asserts anything. On top of a sign-up and two dashboard
  // renders in dev mode, where the first visit to a route pays for compiling it
  // (playwright.config.ts), the 60s default leaves almost no headroom and fails
  // on machine load rather than on a regression.
  test.describe.configure({ timeout: 120_000 });

  let account: TestAccount;

  test.beforeEach(async ({ page }) => {
    account = createTestAccount('rotation');
    await signUp(page, account);
  });

  test('re-issues the session token on a navigation once the interval has passed', async ({
    page,
  }) => {
    const issued = await sessionCookie(page);

    // Nothing is due yet, so the proxy asks for nothing and the jar is untouched.
    await page.goto(routes.dashboard);
    expect(await sessionCookie(page)).toBe(issued);

    await page.waitForTimeout(PAST_THE_ROTATION_INTERVAL_MS);
    await page.goto(routes.dashboard);

    const rotated = await sessionCookie(page);
    expect(rotated).not.toBe(issued);

    // The page rendered on the new token, not on the one it replaced: the proxy
    // rewrites the forwarded Cookie header so the render behind it agrees with
    // the cookie the browser is being handed.
    await expect(page.getByText(account.email, { exact: true })).toBeVisible();
  });

  test('keeps the visitor signed in across several rotations', async ({ page }) => {
    // Rotation retires the previous token every time, so a browser that keeps
    // navigating has to keep landing on the successor. Getting this wrong signs
    // the visitor out rather than failing loudly.
    for (let round = 0; round < 2; round += 1) {
      await page.waitForTimeout(PAST_THE_ROTATION_INTERVAL_MS);
      await page.goto(routes.dashboard);
      await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
      await expect(page).toHaveURL(routes.dashboard);
    }
  });

  test('signs out cleanly after a rotation', async ({ page }) => {
    // Logout revokes the whole family, so the token retired by the rotation
    // above cannot outlive the sign-out and later look like a second holder.
    await page.waitForTimeout(PAST_THE_ROTATION_INTERVAL_MS);
    await page.goto(routes.dashboard);

    await signOut(page);

    await page.goto(routes.dashboard);
    await expect(page).toHaveURL(routes.login);
  });
});
