'use client';

import ErrorScreen from '@/components/ErrorScreen';
import { pageRoutes } from '@/lib/routes';

// Members-group boundary: keeps failures inside the signed-in area from
// bubbling to the root screen, with a path back to the dashboard.
const MembersErrorBoundary = ({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) => (
  <ErrorScreen
    error={error}
    reset={reset}
    scope="members"
    homeHref={pageRoutes.members.dashboard}
    homeLabel="Back to the dashboard"
  />
);

export default MembersErrorBoundary;
