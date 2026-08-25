import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { validateSession } from '@/lib/authentication/get-server-session';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';
import { pageRoutes } from '@/lib/routes';

// See (guest)/layout.tsx — same instant-shell opt-out, inverted guard.
export const instant = false;

// Fails closed: an invalid or missing session goes to /logout (a real revoke +
// cookie clear), never straight to /login with a stale cookie left behind.
const MembersLayout = async ({ children }: Readonly<{ children: ReactNode }>) => {
  const session = await validateSession();
  if (!session) {
    serverLogger.warn(FRONTEND_LOG_EVENTS['session.validation.failed'], {
      reason: 'invalid_or_missing_session',
    });
    redirect(pageRoutes.public.logout);
  }
  return children;
};

export default MembersLayout;
