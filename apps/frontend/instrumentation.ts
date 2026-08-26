import type { Instrumentation } from 'next';

import { getServerEnv } from './config/env';
import { resolveTrustedProxyHops } from './config/env.schema';

// Next.js invokes `register()` once when the server runtime boots. Parsing the
// env here makes a misconfiguration (a committed dev secret outside dev, a sink
// without its endpoint, …) fail the boot loudly. Without it the schema is only
// ever reached lazily from `lib/logging/*`, where both call sites sit inside a
// `try` that deliberately swallows everything — so a refusal would be raised
// and dropped, and the app would serve on the credentials it refused. The
// parsed env is cached, so later callers reuse it.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const env = getServerEnv();

  // Two boot-time notices about /api/client-logs, both emitted here because a
  // route handler is the wrong place to say something once per process.
  //
  // Ingest disabled: CLIENT_LOG_INGEST_ENABLED defaults to OFF and the route
  // answers 404 while it is — deliberate (OpenTelemetry ships wired up and off
  // by default too), but silent silence is a support burden: an operator
  // wondering where their browser logs went must find the variable named in
  // the server log, not in a support thread.
  //
  // ITS LEVEL IS THE STATE IT DESCRIBES, because the two states are not the
  // same news. Ingest off with the browser half off too is the shipped default
  // with both halves agreeing, and nothing is wrong: `info`. Ingest off while
  // NEXT_PUBLIC_LOG_REMOTE is `true` is a deployment whose browser is posting
  // batches into a 404 — telemetry computed and thrown away, somebody asked for
  // it — and only that is `warn`.
  //
  // Both earlier designs were one level for both states, and each lost
  // something. `info` alone made the line conditional on log level, and
  // `LOG_LEVEL=warn` — an ordinary production posture — removed the one signal
  // that explains the silence. `warn` alone fired on every boot of every app
  // that never opted in, which is how a channel teaches operators to skim past
  // it: this is the same boot-time channel that carries the genuinely
  // actionable `server.trust_proxy.degraded`, and diluting it costs that record
  // its attention. Splitting by state keeps the broken case above a
  // `LOG_LEVEL=warn` threshold and demotes only the one working as documented.
  const ingestDisabled = !env.CLIENT_LOG_INGEST_ENABLED;

  // The browser half of the switch, read from `process.env` directly: it is a
  // NEXT_PUBLIC_ variable, it lives in `publicEnvSchema` (which has no server
  // accessor), and this is how the browser logger itself reads it
  // (lib/logging/client-logger.ts). `true` here with the server flag off means
  // browser telemetry was asked for and is not arriving.
  //
  // IT IS THE BUNDLE'S OWN VALUE whenever the variable was set at `next build`,
  // because NEXT_PUBLIC_* IS INLINED INTO EVERY COMPILATION — not just the
  // client one. Next collects each NEXT_PUBLIC_* present in the build
  // environment and spreads them into the define config with no client/server
  // guard (`next/dist/lib/static-env.js` `getNextPublicEnvironmentVariables`,
  // spread unguarded at `next/dist/build/define-env.js` `getDefineEnv`), so the
  // expression below is replaced by a literal in the node-server build exactly
  // as it is in the browser's, and the branch beneath it is constant-folded
  // away with it. Built with `NEXT_PUBLIC_LOG_REMOTE=true`, the compiled
  // instrumentation carries a constant `true` in this field and calls `warn`
  // unconditionally. So on the configuration SECURITY.md's checklist prescribes
  // — set at BUILD time — this field says what the SHIPPED BUNDLE does, and a
  // `warn` here means real browser batches are going into a 404. Trust it.
  //
  // THE ONE SHAPE IT OVER-REPORTS is the variable absent at build and set only
  // in the runtime environment. No define is emitted for a variable the build
  // never saw, so this expression stays a live `process.env` read in the
  // compiled server output — which is also how to tell the two builds apart,
  // see the grep in `instrumentation.test.ts` — and it answers `true` while the
  // bundle, built without it, posts nothing. That
  // deployment is already broken in its own right — a NEXT_PUBLIC_ variable set
  // only at runtime never reaches a browser at all — and the repair is the one
  // the notice already points at, stated in `.env.example` beside the variable
  // and in the deploy checklist: set it at BUILD time, rebuild to change it.
  const browserRemoteEnabled = process.env.NEXT_PUBLIC_LOG_REMOTE === 'true';

  // TRUST_PROXY degraded: it is one variable for the whole stack, and the two
  // apps can honour different amounts of it: the backend hands it to Express,
  // which resolves `true`, `loopback`, and CIDR forms against the socket
  // address, while a Next route handler has none and can only act on a hop
  // count. Those forms resolve to zero trusted hops here — safe, every caller
  // in one bucket — but silence would be the wrong way to do it: an operator
  // who set `TRUST_PROXY=true` for the stack would read their own config as
  // "per-client buckets are on" while /api/client-logs was actually running one
  // whole-app bucket. Say so at boot.
  const { unevaluatable } = resolveTrustedProxyHops(process.env.TRUST_PROXY);

  if (!ingestDisabled && unevaluatable === undefined) return;

  // The import is dynamic because the logger is `'server-only'` and this module
  // is also loaded on the edge runtime, where its node-stream sinks cannot go.
  try {
    const [{ serverLogger }, { FRONTEND_LOG_EVENTS }] = await Promise.all([
      import('./lib/logging/server-logger'),
      import('./lib/logging/log-events'),
    ]);
    if (ingestDisabled) {
      const notice = {
        variable: 'CLIENT_LOG_INGEST_ENABLED',
        route: '/api/client-logs',
        // Which of the two states this is, on the record itself, so a dashboard
        // can tell them apart without reading the level: `false` is the shipped
        // default behaving as documented, `true` is the mismatch. Reads as
        // "what the shipped bundle does" wherever the variable was set at build
        // time, which is how it is meant to be set — see the read above for the
        // one deployment shape where it over-reports.
        browserRemoteEnabled,
      };
      const event = FRONTEND_LOG_EVENTS['server.client_logs.ingest_disabled'];
      if (browserRemoteEnabled) serverLogger.warn(event, notice);
      else serverLogger.info(event, notice);
    }
    if (unevaluatable !== undefined) {
      serverLogger.warn(FRONTEND_LOG_EVENTS['server.trust_proxy.degraded'], {
        // The configured form, not a caller-supplied value — safe to record, and
        // the whole point is that the operator recognises what they typed.
        configuredValue: unevaluatable,
        resolvedHops: 0,
        reason: 'no_socket_address',
      });
    }
  } catch {
    // Reporting a boot-time notice must never be the thing that fails the boot.
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
