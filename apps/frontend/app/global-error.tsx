'use client';

import ErrorScreen from '@/components/ErrorScreen';
import { pageRoutes } from '@/lib/routes';
// global-error REPLACES the root layout, so it inherits nothing — without its
// own stylesheet import the fallback renders unstyled bare HTML.
import './globals.css';

// Catches errors that escape the root layout. Renders its own <html>/<body>
// (same font/token wiring as app/layout.tsx) and escalates the log record to
// fatal — if this screen is showing, the whole app shell is down. Verify
// changes here in a production build: the dev overlay masks global-error.
const GlobalErrorBoundary = ({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) => (
  <html lang="en">
    <body className="font-body bg-(--ui-background) text-(--ui-foreground)">
      <ErrorScreen
        error={error}
        reset={reset}
        scope="global"
        level="fatal"
        homeHref={pageRoutes.home}
      />
    </body>
  </html>
);

export default GlobalErrorBoundary;
