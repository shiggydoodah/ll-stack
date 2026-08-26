import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ModeToggle from '@/components/ModeToggle';
import { validateSession } from '@/lib/authentication/get-server-session';
import { getSession } from '@/lib/authentication/session-cookie';
import { ExpectedError } from '@/lib/errors/expected-error';
import { getDashboard } from '@/lib/gateway/dashboard';
import { logoutRedirectPath } from '@/lib/auth/logout-token';
import UsersPanel from './_components/UsersPanel';

// The (members) layout's `instant = false` covers only the layout segment —
// this page is validated on its own. It re-reads the session (deliberately
// no-store) and fetches the dashboard per-request, so there is no static
// shell worth shipping first; the layout guard blocks navigation anyway.
export const instant = false;

export const metadata: Metadata = {
  title: 'Dashboard',
};

const DashboardPage = async () => {
  // Deduped with the (members) layout's call by React.cache — no extra round
  // trip; re-checked here so the page narrows the type itself.
  const session = await validateSession();
  if (!session) {
    // Bound to the session cookie this request carries, for the reason the
    // (members) layout gives.
    redirect(logoutRedirectPath(await getSession()));
  }

  const dashboard = await getDashboard();
  if (!dashboard.ok) {
    // Rung 5: the whole page is this read — nothing to degrade around.
    throw new ExpectedError('PAGE_DATA_UNAVAILABLE');
  }

  return (
    <>
      <header className="flex h-13 items-center justify-between gap-4 border-b border-(--ui-border) px-6">
        <span className="text-2xs font-mono tracking-widest text-(--ui-text-muted) uppercase">
          Workspace / Users
        </span>
        <ModeToggle />
      </header>
      <main className="min-w-0 flex-1">
        <UsersPanel totalMembers={dashboard.data.totalMembers} members={dashboard.data.members} />
      </main>
    </>
  );
};

export default DashboardPage;
