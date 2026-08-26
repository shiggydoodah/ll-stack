'use client';

import { useEffect, type ReactNode } from 'react';
import { isBenignResizeObserverError } from '@/lib/errors/benign-browser-errors';
import { isNextControlFlowSignal } from '@/lib/errors/next-control-flow';
import { clientLogger, installClientLoggerLifecycle } from '@/lib/logging/client-logger';
import { captureUserEnv } from '@/lib/logging/user-env';
import { FRONTEND_LOG_EVENTS } from '@/lib/logging/log-events';

// Installs browser logging once on mount: flush-on-unload lifecycle, global
// error/rejection capture, and a one-off session.start record carrying
// non-identifying environment details. Mounted high in the root layout.
const LoggingProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  useEffect(() => {
    const removeLifecycle = installClientLoggerLifecycle();

    clientLogger.info(FRONTEND_LOG_EVENTS['client.session.start'], {
      event: FRONTEND_LOG_EVENTS['client.session.start'],
      ...captureUserEnv(),
    });

    const onError = (errorEvent: ErrorEvent): void => {
      if (isNextControlFlowSignal(errorEvent.error ?? errorEvent.message)) return;
      // Benign, self-correcting browser notification (no Error, no stack) — see
      // isBenignResizeObserverError. The Radix HoverCard preview card fires it on
      // its skeleton→content resize; logging it would only pollute the
      // client.error.unhandled stream (dev console and prod dashboards alike).
      if (isBenignResizeObserverError(errorEvent.message)) return;
      clientLogger.error(FRONTEND_LOG_EVENTS['client.error.unhandled'], {
        event: FRONTEND_LOG_EVENTS['client.error.unhandled'],
        errorMessage: errorEvent.message,
        filename: errorEvent.filename,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        stack: errorEvent.error instanceof Error ? errorEvent.error.stack : undefined,
      });
    };

    const onRejection = (rejectionEvent: PromiseRejectionEvent): void => {
      const reason = rejectionEvent.reason;
      if (isNextControlFlowSignal(reason)) return;
      clientLogger.error(FRONTEND_LOG_EVENTS['client.error.rejection'], {
        event: FRONTEND_LOG_EVENTS['client.error.rejection'],
        errorMessage: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      removeLifecycle();
    };
  }, []);

  return <>{children}</>;
};

export default LoggingProvider;
