import { expect, test } from '@playwright/test';

import {
  createTestAccount,
  emailField,
  expectSignedIn,
  passwordField,
  routes,
  signInButton,
  signUp,
  submitLogin,
  TEST_PASSWORD,
  type TestAccount,
} from './helpers/auth';

/**
 * Login, end to end: the login form → `loginAction` → `POST /auth/login` → the
 * session + binding cookies → the members' area.
 */
test.describe('Sign in', () => {
  let account: TestAccount;

  // The member these tests sign in as, registered once through the real
  // create-account flow. `fullyParallel` spreads this file's tests across
  // workers and each worker runs this hook, so the address is minted *here*
  // rather than at module scope — a shared constant would collide on the
  // unique email index the moment a second worker started.
  test.beforeAll(async ({ browser }) => {
    account = createTestAccount('login');
    const context = await browser.newContext();
    try {
      await signUp(await context.newPage(), account);
    } finally {
      await context.close();
    }
  });

  test('signs an existing member in and lands them on the dashboard', async ({ page }) => {
    await submitLogin(page, account);

    await expectSignedIn(page, account);
  });

  test('rejects a wrong password without naming the account', async ({ page }) => {
    await submitLogin(page, { email: account.email, password: 'Wrong-password-1' });

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(routes.login);
  });

  test('answers an unknown email with the same message as a wrong password', async ({ page }) => {
    // `INVALID_CREDENTIALS` deliberately covers both cases — the backend even
    // burns a dummy argon2 verify so the two are timing-indistinguishable. If
    // this message ever diverges from the one above, the login form has become
    // an account-enumeration oracle.
    await submitLogin(page, {
      email: createTestAccount('login-unknown').email,
      password: TEST_PASSWORD,
    });

    await expect(page.getByText('Invalid email or password.')).toBeVisible();
    await expect(page).toHaveURL(routes.login);
  });

  test('lets a rejected attempt be retried with the right password', async ({ page }) => {
    await submitLogin(page, { email: account.email, password: 'Wrong-password-1' });
    await expect(page.getByText('Invalid email or password.')).toBeVisible();

    // `Form` clears server errors before re-validating; without that the stale
    // `onServer` error keeps the form invalid and blocks the second submit.
    await emailField(page).fill(account.email);
    await passwordField(page).fill(account.password);
    await signInButton(page).click();

    await expectSignedIn(page, account);
  });

  test('bounces a signed-in visitor off the login page', async ({ page }) => {
    await submitLogin(page, account);
    await expectSignedIn(page, account);

    await page.goto(routes.login);

    // proxy.ts redirects a session-cookie holder before any guest HTML is
    // served, so the signed-in member never sees the login form flash.
    await expect(page).toHaveURL(routes.dashboard);
  });
});
