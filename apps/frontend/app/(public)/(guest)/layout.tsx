import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { validateSession } from '@/lib/authentication/get-server-session';
import { pageRoutes } from '@/lib/routes';

// Opt out of the instant static shell: without this the guest UI paints first
// and the signed-in redirect arrives as a visible hop. The proxy's
// cookie-presence fast-path fronts this guard; this validated check stays the
// authoritative one (it also covers proxy-exempt requests like prefetches).
export const instant = false;

const GuestLayout = async ({ children }: Readonly<{ children: ReactNode }>) => {
  const session = await validateSession();
  if (session) {
    redirect(pageRoutes.members.dashboard);
  }
  return children;
};

export default GuestLayout;
