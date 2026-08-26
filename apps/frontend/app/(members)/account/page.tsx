import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ModeToggle from '@/components/ModeToggle';
import { validateSession } from '@/lib/authentication/get-server-session';
import { getSession } from '@/lib/authentication/session-cookie';
import { ExpectedError } from '@/lib/errors/expected-error';
import { listSessions } from '@/lib/gateway/auth';
import { logoutRedirectPath } from '@/lib/auth/logout-token';
import SessionsPanel from './_components/SessionsPanel';

// Same reasoning as the dashboard: validated per request, nothing static worth
// shipping first, and the answer must be current — a cached "where am I signed
// in" is the one answer this page must never give.
export const instant = false;

export const metadata: Metadata = {
  title: 'Account',
};

const AccountPage = async () => {
  const session = await validateSession();
  if (!session) {
    redirect(logoutRedirectPath(await getSession()));
  }

  const sessions = await listSessions();
  if (!sessions.ok) {
    // Rung 5: the whole page is this read — nothing to degrade around.
    throw new ExpectedError('PAGE_DATA_UNAVAILABLE');
  }

  return (
    <>
      <header className="flex h-13 items-center justify-between gap-4 border-b border-(--ui-border) px-6">
        <span className="text-2xs font-mono tracking-widest text-(--ui-text-muted) uppercase">
          Workspace / Account
        </span>
        <ModeToggle />
      </header>
      <main className="min-w-0 flex-1">
        <SessionsPanel sessions={sessions.data.sessions} truncated={sessions.data.truncated} />
      </main>
    </>
  );
};

export default AccountPage;
