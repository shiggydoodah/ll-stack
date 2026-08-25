'use client';

import ErrorScreen from '@/components/ErrorScreen';
import { pageRoutes } from '@/lib/routes';

// Public-group boundary (guest pages, logout). No group shell to preserve, so
// it renders the full-viewport screen with a way home.
const PublicErrorBoundary = ({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) => (
  <ErrorScreen error={error} reset={reset} scope="public" homeHref={pageRoutes.home} />
);

export default PublicErrorBoundary;
