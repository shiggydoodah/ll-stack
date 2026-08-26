import { expect, test, type Page } from '@playwright/test';

import { createTestAccount, expectSignedIn, routes, signUp, submitLogin } from './helpers/auth';

/**
 * The account page's session controls, end to end: `GET /auth/sessions` →
 * the listing, then `POST /auth/sessions/revoke-all` → the other browser's next
 * navigation lands on /login.
 *
 * Two browser contexts, not two tabs. One sign-in is one cookie jar, and the
 * whole point of the feature is what happens to the OTHER jar — a second tab
 * shares the first one and would prove nothing.
 */
test.describe('Account sessions', () => {
  const openAccountPage = async (page: Page): Promise<void> => {
    await page.goto(routes.account);
    await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
  };

  // Header row plus one per live sign-in.
  const sessionRows = (page: Page) => page.getByRole('row');

  test('lists every sign-in and marks the one doing the looking', async ({ browser }) => {
    const account = createTestAccount('sessions-list');
    const first = await browser.newContext();
    const second = await browser.newContext();

    try {
      await signUp(await first.newPage(), account);
      const other = await second.newPage();
      await submitLogin(other, account);
      await expectSignedIn(other, account);

      const page = (await first.pages())[0] as Page;
      await openAccountPage(page);

      await expect(sessionRows(page)).toHaveCount(3);
      await expect(page.getByText('This session')).toHaveCount(1);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('signs the other sessions out and leaves this one alone', async ({ browser }) => {
    const account = createTestAccount('sessions-revoke');
    const first = await browser.newContext();
    const second = await browser.newContext();

    try {
      await signUp(await first.newPage(), account);
      const other = await second.newPage();
      await submitLogin(other, account);
      await expectSignedIn(other, account);

      const page = (await first.pages())[0] as Page;
      await openAccountPage(page);
      await page.getByRole('button', { name: 'Sign out other sessions' }).click();
      await page.getByRole('button', { name: 'Sign them out' }).click();

      await expect(page.getByText('Signed out 1 other session.')).toBeVisible();
      await expect(sessionRows(page)).toHaveCount(2);

      // The revoked jar still holds a session cookie, so the proxy admits the
      // navigation and the layout's validateSession() is what refuses it. That
      // is the path a real stolen-cookie holder takes.
      await other.goto(routes.dashboard);
      await other.waitForURL(routes.login);

      // ...and the browser that pressed the button is untouched.
      await page.goto(routes.dashboard);
      await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
    } finally {
      await first.close();
      await second.close();
    }
  });
});
