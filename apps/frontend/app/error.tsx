'use client';

import ErrorScreen from '@/components/ErrorScreen';
import { pageRoutes } from '@/lib/routes';

// Root boundary — the last resort inside the root layout. Each route group
// ships its own error.tsx so group shells (nav) survive page errors; this one
// catches what escapes a group layout itself. Errors in the ROOT layout go
// further up, to global-error.tsx.
const RootErrorBoundary = ({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) => (
  <ErrorScreen error={error} reset={reset} scope="root" homeHref={pageRoutes.home} />
);

export default RootErrorBoundary;
