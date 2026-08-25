import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { clearSessionCookie, getSession } from '@/lib/authentication/session-cookie';
import { logout as revokeSession } from '@/lib/gateway/auth';
import { COOKIE_NAME } from '@/lib/auth/constants';
import { SESSION_ID_COOKIE } from '@/lib/logging/correlation';
import { pageRoutes } from '@/lib/routes';
import { withRequestContext } from '@/lib/actions/with-request-context';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';

// Logout is a GET route handler, not a server action, so any link or redirect
// can trigger it — which is why the (members) layout redirects here rather
// than to /login when a session fails validation. The backend revoke is
// best-effort: a backend outage must never leave the browser stuck holding a
// cookie it cannot clear; the `finally` clears all three auth-adjacent cookies
// (session, binding, log session-id) and redirects unconditionally.
export const GET = async () =>
  withRequestContext(async () => {
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
      jar.delete({ name: COOKIE_NAME, path: '/' });
      jar.delete({ name: SESSION_ID_COOKIE, path: '/' });
      redirect(pageRoutes.public.login);
    }
  });
