import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import MemberSidebar from '@/components/MemberSidebar';
import { validateSession } from '@/lib/authentication/get-server-session';
import { getSession } from '@/lib/authentication/session-cookie';
import { serverLogger } from '@/lib/logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';
import { logoutRedirectPath } from '@/lib/auth/logout-token';

// See (guest)/layout.tsx — same instant-shell opt-out, inverted guard.
export const instant = false;

// Fails closed: an invalid or missing session goes to /logout (a real revoke +
// cookie clear), never straight to /login with a stale cookie left behind.
//
// The redirect carries a token bound to the session cookie this request arrived
// with. /logout refuses an untokened cross-site navigation, and a visitor who
// followed an external link in is still carrying `cross-site` here — browsers
// compute Sec-Fetch-Site over the whole redirect chain.
//
// The shell lives here rather than in each page so every member route carries
// the same navigation. Pages render their own header and main.
const MembersLayout = async ({ children }: Readonly<{ children: ReactNode }>) => {
  const session = await validateSession();
  if (!session) {
    serverLogger.warn(FRONTEND_LOG_EVENTS['session.validation.failed'], {
      reason: 'invalid_or_missing_session',
    });
    redirect(logoutRedirectPath(await getSession()));
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13.5rem_1fr]">
      <MemberSidebar name={session.account.name} email={session.account.email} />
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
};

export default MembersLayout;
