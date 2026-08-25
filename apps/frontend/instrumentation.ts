import type { Instrumentation } from 'next';

import { getServerEnv } from './config/env';

// Next.js invokes `register()` once when the server runtime boots. Parsing the
// env here makes a misconfiguration (a committed dev secret outside dev, a sink
// without its endpoint, …) fail the boot loudly. Without it the schema is only
// ever reached lazily from `lib/logging/*`, where both call sites sit inside a
// `try` that deliberately swallows everything — so a refusal would be raised
// and dropped, and the app would serve on the credentials it refused. The
// parsed env is cached, so later callers reuse it.
export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    getServerEnv();
  }
}

// Server-side error capture (frontend-error-boundaries step 03): every
// server-side error Next surfaces — RSC render errors, route handlers, server
// actions — lands in the shared log sink as `server.error.unhandled`, joined
// to the client boundary's record by `digest`. Without this hook those errors
// reach the terminal only.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // The shared sink writes through node streams — skip the edge runtime. The
  // dynamic import keeps the sink out of the edge bundle. (`config/env` above
  // is static, so the schema does ship there — a few KB.)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { logRequestError } = await import('./lib/logging/request-error');
    logRequestError(error, request, context);
  } catch {
    // Capture must never throw into the request path.
  }
};
