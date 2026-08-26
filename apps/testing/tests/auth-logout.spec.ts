import { expect, test } from '@playwright/test';

import {
  BINDING_COOKIE_NAMES,
  createTestAccount,
  routes,
  signUp,
  SESSION_COOKIE_NAME,
} from './helpers/auth';

/**
 * `/logout` refuses cross-site requests, and the flow below is the reason it
 * cannot refuse all of them: an external link into `/dashboard` that the proxy
 * 307s to `/logout` arrives carrying `cross-site` too, because browsers compute
 * `Sec-Fetch-Site` over the whole redirect chain. The route separates the two by
 * the short-lived token the proxy puts on its own redirect.
 *
 * THAT HEADER IS THE ONE THING A UNIT TEST CANNOT PRODUCE. `route.test.ts` sets
 * fetch metadata by hand, so it proves what the handler does with a value rather
 * than which value a browser sends — and misjudging exactly that is what left a
 * visitor bouncing between /login, /dashboard and a 403 the first time round.
 */

/**
 * `localhost` and `127.0.0.1` are the same machine and different sites, so a
 * link from one to the other is a genuine cross-site navigation. The harness
 * pins the app to `localhost` (playwright.config.ts), so these never collide.
 */
const CROSS_SITE_HOST = '127.0.0.1';

test('signs out a visitor who follows an external link in with a lapsed binding', async ({
  page,
}) => {
  const account = createTestAccount('logout-gate');
  await signUp(page, account);

  const dashboard = new URL(page.url());

  // The jar exactly as a signed-in browser holds it, captured before the binding
  // is torn out below. The last assertion puts it back.
  const signedInCookies = await page.context().cookies();

  // The idle timeout firing, forced. The binding cookies are what prove this
  // browser is the one the session was issued to; without them the proxy sends
  // the visitor to /logout rather than /login, because the browser is still
  // holding a live session cookie that only /logout revokes and clears.
  for (const name of BINDING_COOKIE_NAMES) {
    await page.context().clearCookies({ name });
  }

  const entry = new URL(dashboard);
  entry.hostname = CROSS_SITE_HOST;
  entry.pathname = '/external-link';

  // Fulfilled rather than served, so the page exists only for the duration of
  // this test and needs no second web server.
  await page.route(entry.href, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html lang="en"><body><a href="${dashboard.href}">Your dashboard</a></body></html>`,
    }),
  );

  await page.goto(entry.href);
  await page.getByRole('link', { name: 'Your dashboard' }).click();

  // /dashboard → 307 to /logout with the token → the sign-out completes.
  await page.waitForURL(routes.login);

  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBeUndefined();

  // And the session is gone backend-side too, rather than only cleared from the
  // jar. Navigating again on an EMPTY jar proves nothing — `proxy.ts` bounces a
  // missing session cookie straight to /login without asking the backend
  // anything, so that assertion passed just as well when the revoke silently
  // failed. Putting the whole signed-in jar back is what forces the question:
  // the binding matches, the proxy admits the request, and the rotation call
  // behind it has to reach the backend. A live session renders the dashboard.
  await page.context().addCookies(signedInCookies);
  await page.goto(routes.dashboard);
  await expect(page).toHaveURL(routes.login);
});
