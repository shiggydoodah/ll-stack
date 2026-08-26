import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import LoggingProvider from '@/components/LoggingProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'LL Stack',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Reading headers() opts the tree into dynamic rendering, which is required for
// the per-request nonce CSP (set in proxy.ts) to be injected into Next scripts.
const NonceBoundary = async ({ children }: Readonly<{ children: ReactNode }>) => {
  await headers();
  return children;
};

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
  return (
    <html lang="en" data-theme="default">
      <body className="font-body bg-(--ui-background) text-(--ui-foreground)">
        <LoggingProvider>
          <Suspense fallback={null}>
            <NonceBoundary>{children}</NonceBoundary>
          </Suspense>
        </LoggingProvider>
      </body>
    </html>
  );
};

export default RootLayout;
