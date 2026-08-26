import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/authentication/session-cookie';
// The name only, from the module that holds nothing else — `proxy.ts` reads it
// from here too. The guard below takes the session cookie straight off the
// request rather than through the jar helpers above, which is what keeps it
// ahead of every await in the handler.
import { SESSION_COOKIE_NAME } from '@/lib/authentication/session-constants';
import { logout as revokeSession } from '@/lib/gateway/auth';
import { clearBindingCookies } from '@/lib/auth/binding-cookies';
import { LOGOUT_TOKEN_PARAM, verifyLogoutToken } from '@/lib/auth/logout-token';
import { SESSION_ID_COOKIE } from '@/lib/logging/correlation';
import { pageRoutes } from '@/lib/routes';
import { withRequestContext } from '@/lib/actions/with-request-context';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';

/** A visitor going somewhere and seeing where they land, as the browser reports it. */
const isTopLevelNavigation = (request: NextRequest): boolean =>
  request.headers.get('sec-fetch-mode') === 'navigate' &&
  request.headers.get('sec-fetch-dest') === 'document';

/**
 * Whether this request is another site firing `/logout` at a visitor rather
 * than a visitor arriving at it.
 *
 * Sec-Fetch-Site on its own cannot tell those apart. The browser computes it
 * over the request's whole URL list, redirect hops included, so a cross-site
 * link into /dashboard that `proxy.ts` 307s here arrives carrying the same
 * `cross-site` an `<img src="https://app/logout">` carries.
 *
 * SO THIS APP SAYS SO ITSELF. Every redirect of ours into `/logout` puts a
 * short-lived HMAC on the URL, signed over the session cookie it was minted
 * for, and a cross-site request whose token matches the cookie it arrived with
 * is this app's own hop. `lib/auth/logout-token.ts` carries the reasoning for
 * why signing over the cookie is the half of that which does the work.
 *
 * A valid token does not excuse a subresource, so the destination check stays
 * alongside it. The token rides in a query string for two minutes, which the
 * address bar, the browser history, and every access and CDN log in front of the
 * app all see; one read out of a log, replayed as `<img src="/logout?t=…">`,
 * would otherwise buy the forced sign-out this guard exists to prevent. Our own
 * redirect is always a navigation, so the check costs it nothing.
 *
 * Everything else is served, because refusing it breaks real sign-outs: `none`
 * is a typed address or a bookmark, `same-origin` and `same-site` are this app
 * and its siblings (the sidebar's own Sign out link included), and an absent
 * header is a caller that sends no fetch metadata at all.
 */
const isUnauthorizedCrossSite = (request: NextRequest): boolean =>
  request.headers.get('sec-fetch-site') === 'cross-site' &&
  (!isTopLevelNavigation(request) ||
    !verifyLogoutToken(
      request.cookies.get(SESSION_COOKIE_NAME)?.value,
      request.nextUrl.searchParams.get(LOGOUT_TOKEN_PARAM),
    ));

// Logout is a GET route handler, not a server action, so any link or redirect
// can trigger it — which is why the (members) layout redirects here rather
// than to /login when a session fails validation. The backend revoke is
// best-effort: a backend outage must never leave the browser stuck holding a
// cookie it cannot clear; the `finally` clears every auth-adjacent cookie (the
// session, both binding cookies, and the log session-id) and redirects
// unconditionally.
export const GET = async (request: NextRequest) => {
  // That same reachability is what a GET with no origin check costs: another
  // site can fire this route and force a sign-out that revokes the backend
  // session too. Refusing before any cookie work keeps the rejection total, so
  // a refused request revokes nothing and clears nothing.
  if (isUnauthorizedCrossSite(request)) {
    return new NextResponse(null, { status: 403 });
  }

  return withRequestContext(async () => {
    const session = await getSession();

    try {
      if (session) {
        await revokeSession();
      }
    } catch (error) {
      serverLogger.warn(FRONTEND_LOG_EVENTS['auth.logout.revocation_failed'], {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await clearSessionCookie();
      const jar = await cookies();
      clearBindingCookies(jar);
      jar.delete({ name: SESSION_ID_COOKIE, path: '/' });
      redirect(pageRoutes.public.login);
    }
  });
};
