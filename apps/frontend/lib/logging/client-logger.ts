import {
  DEFAULT_LOG_LEVEL_BY_ENV,
  sanitizeLogValue,
  type LogLevel,
  type RuntimeEnvironment,
} from '@repo/logging/shared';
import { LOG_LEVEL_NUMBERS, isLevelEnabled } from './levels';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_COOKIE,
  generateCorrelationId,
  isValidCorrelationId,
} from './correlation';
import { FRONTEND_LOG_EVENTS } from './log-events';

// Browser logger. Mirrors the server logger's record shape so client logs are
// queryable alongside Next-server and backend logs. Ships batched records to
// /api/client-logs (same-origin — CSP connect-src 'self'), which re-emits them
// through the shared sink. Must never throw into the app.

const ENDPOINT = '/api/client-logs';
const SOURCE = 'frontend-client';
const FLUSH_THRESHOLD = 20;
const BUFFER_HARD_CAP = 100;
const FLUSH_INTERVAL_MS = 5_000;

type LogContext = Record<string, unknown> & { event?: string };

const resolveRuntimeEnv = (): RuntimeEnvironment => {
  const env = process.env.NODE_ENV;
  return env === 'production' || env === 'test' ? env : 'development';
};

const isDev = (): boolean => resolveRuntimeEnv() === 'development';

const resolveThreshold = (): LogLevel => {
  const configured = process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel | undefined;
  if (configured && configured in LOG_LEVEL_NUMBERS) return configured;
  return DEFAULT_LOG_LEVEL_BY_ENV[resolveRuntimeEnv()];
};

// The severity floor for the console fallback in `emit` — outside dev only.
// See the comment there for why the fallback needs a floor of its own rather
// than inheriting NEXT_PUBLIC_LOG_LEVEL's.
const CONSOLE_FALLBACK_MIN_LEVEL: LogLevel = 'warn';

// The events THE BROWSER ALREADY PRINTS ITSELF, excluded from that fallback.
// Both come from LoggingProvider.tsx's `window.onerror` / `unhandledrejection`
// listeners, which fire for throws and rejections the browser has already
// written to the console — with a source-mapped stack a structured duplicate
// cannot improve on. They are emitted at `error`, so no floor that keeps
// `client.error.expected` (`warn`) can reach them; without an exclusion every
// production visitor who hit an uncaught error saw it in their console twice.
//
// The case for the fallback is the evidence the browser does NOT print:
// `client.error.boundary` and `client.error.expected` come from a React
// boundary, which swallows the underlying throw. This narrows the fallback to
// exactly that, and narrows nothing else — remote posting still carries both
// events when it is on, and dev still prints them, because in dev the
// structured record with its session and correlation ids IS what a developer is
// reading.
const BROWSER_REPORTED_EVENTS: ReadonlySet<string> = new Set([
  FRONTEND_LOG_EVENTS['client.error.unhandled'],
  FRONTEND_LOG_EVENTS['client.error.rejection'],
]);

// OFF unless explicitly enabled — in every environment, not just dev. This is
// the browser half of a two-part switch whose server half
// (CLIENT_LOG_INGEST_ENABLED, config/env.schema.ts) is AUTHORITATIVE: with the
// server flag off, /api/client-logs answers 404 and this flag cannot turn
// ingestion back on; it only decides whether our own bundle posts. Defaulting
// on was the earlier design, and it meant a deployment that never chose remote
// browser logging was running an open anonymous ingest path anyway.
//
// Off does NOT mean "record discarded" — with no remote sink the BROWSER's
// console is the sink, in production as in dev, for `warn` and above except the
// two events the browser prints itself. See `emit` for all three bounds on that
// fallback, and for why a server render takes none of it.
const resolveRemoteEnabled = (): boolean => process.env.NEXT_PUBLIC_LOG_REMOTE === 'true';

// The stable session/visitor id lives in the `llstack_sid` cookie set by proxy.ts,
// so browser logs, Next-server logs, and backend logs all share it. Read it here
// (fallback: mint one — proxy will have set the cookie by the time this runs).
const readSessionCookie = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_ID_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
};

const resolveSessionId = (): string => {
  const fromCookie = readSessionCookie();
  return isValidCorrelationId(fromCookie) ? fromCookie : generateCorrelationId();
};

const sessionId = resolveSessionId();
let buffer: Record<string, unknown>[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleInstalled = false;

const consoleMethodForLevel = (level: number): 'debug' | 'info' | 'warn' | 'error' => {
  if (level >= 50) return 'error';
  if (level >= 40) return 'warn';
  if (level >= 30) return 'info';
  return 'debug';
};

const writeToConsole = (record: Record<string, unknown>): void => {
  const level = typeof record.level === 'number' ? record.level : 30;
  console[consoleMethodForLevel(level)](record.message, record);
};

const sendRecords = (records: Record<string, unknown>[]): void => {
  if (typeof window === 'undefined' || records.length === 0) return;
  const body = JSON.stringify({ records });
  try {
    // Beacon survives unload but can't set headers — each record carries its own
    // sessionId, so the ingestion route doesn't depend on the header.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CORRELATION_ID_HEADER]: sessionId },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Swallow — a transport failure must not surface to the user or recurse.
  }
};

const flush = (): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const records = buffer;
  buffer = [];
  sendRecords(records);
};

const scheduleFlush = (): void => {
  if (flushTimer !== null || typeof window === 'undefined') return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
};

const enqueue = (record: Record<string, unknown>): void => {
  buffer.push(record);
  if (buffer.length > BUFFER_HARD_CAP) buffer.splice(0, buffer.length - BUFFER_HARD_CAP);
  if (buffer.length >= FLUSH_THRESHOLD) flush();
  else scheduleFlush();
};

const isEventName = (value: string): boolean =>
  Object.prototype.hasOwnProperty.call(FRONTEND_LOG_EVENTS, value);

const buildRecord = (
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
  bindings: Record<string, unknown>,
): Record<string, unknown> => {
  const merged = { ...bindings, ...context };
  const sanitized = sanitizeLogValue(merged) as Record<string, unknown>;
  const event =
    typeof context?.event === 'string' ? context.event : isEventName(message) ? message : undefined;

  // Reserved identity fields are written last so user-supplied context can never
  // overwrite the source/session/correlation that make the record traceable.
  return {
    ...sanitized,
    level: LOG_LEVEL_NUMBERS[level],
    timestamp: new Date().toISOString(),
    message,
    ...(event ? { event } : {}),
    source: SOURCE,
    sessionId,
    // Browser logs aren't per-request, so the session id is their correlation key.
    correlationId: sessionId,
    requestId: sessionId,
  };
};

const emit = (
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
  bindings: Record<string, unknown>,
): void => {
  try {
    if (!isLevelEnabled(level, resolveThreshold())) return;
    const remote = resolveRemoteEnabled();
    const record = buildRecord(level, message, context, bindings);
    // The console is dev's sink, and the ONLY sink whenever remote posting is
    // off — which is the default, in every environment. Writing it in dev alone
    // made a default production build a complete no-op: the record was built,
    // sanitised, and dropped, with nothing on either path. That cost
    // `client.error.boundary` and `client.error.expected` most of all — React
    // swallows the throw a boundary catches, so the browser's own error
    // reporting does not cover those two, and a production boundary render left
    // no evidence anywhere.
    //
    // OUTSIDE DEV THAT FALLBACK IS BOUNDED TWICE, because the threshold checked
    // above does not bound it at all: NEXT_PUBLIC_LOG_LEVEL ships unset and the
    // production default is `info` (DEFAULT_LOG_LEVEL_BY_ENV).
    //
    // BY A LEVEL FLOOR, because an unfloored fallback wrote a structured record
    // into every visitor's console on every page load — `client.session.start`
    // with captureUserEnv() attached. `warn` is where the floor has to sit to
    // keep all of `client.error.*`: `client.error.expected` is emitted at `warn`
    // (ErrorScreen.tsx), the rest at `error` or `fatal`. Nothing below that was
    // ever part of the case for this branch, and below the floor a build with no
    // remote sink drops the record — which is what "no sink configured" means
    // for a breadcrumb. NEXT_PUBLIC_LOG_LEVEL raises the bar from here and never
    // lowers it: a console-only deployment that wants `info` browser records
    // wants the remote sink, not every visitor's DevTools.
    //
    // AND BY AN EVENT EXCLUSION, because a floor cannot reach the other half of
    // the problem — the two events the browser prints itself sit at `error`,
    // above any floor that keeps `client.error.expected`. See
    // BROWSER_REPORTED_EVENTS.
    //
    // AND BY A BROWSER GUARD, because "the console is the sink" means THE
    // BROWSER'S console. This module is importable from any client component,
    // and a client component renders on the server too — a `warn` from a
    // module-level call, a `useState` initializer, or a catch on the render path
    // reaches this line during SSR, where `console.error(message, record)` is a
    // multi-line `util.inspect` blob on the Next server's stdout. That stream is
    // read a JSON line at a time (log-emitter.ts writes one `JSON.stringify` per
    // line), so the blob is not noise there — it is a malformed record at
    // whatever collects it, and the failure surfaces at the collector rather
    // than here. Nothing reaches it today (LoggingProvider.tsx and
    // ErrorScreen.tsx both emit from `useEffect`); the guard is what keeps that
    // true of code not yet written. Server-side records have their own path —
    // `serverLogger`, through the same sink — so nothing is lost by staying out
    // of stdout. `isDev()` below is deliberately NOT guarded: a dev terminal is
    // a person's screen, not a collector's input.
    //
    // THE FALLBACK KEYS OFF CONFIGURATION, NOT DELIVERY, and the gap is
    // deliberate: `remote` on means the record reached the transport, never that
    // it arrived, so a 404 (ingest off server-side), a 403 (refused), or a 429
    // drops it with no console copy either. This logger fires and forgets by
    // design — one that inspected its own responses and retried or re-reported
    // would amplify precisely the incident it exists to describe, from every
    // visitor's browser at once. Every one of those refusals is instead
    // accounted for SERVER-side, where it costs one record rather than a
    // browser-shaped flood: `server.client_logs.ingest_disabled` at boot,
    // `server.client_logs.refused`, and `server.client_logs.throttled`, each
    // budgeted to once per window. See SECURITY.md's deploy checklist.
    const consoleFallback =
      typeof window !== 'undefined' &&
      !remote &&
      LOG_LEVEL_NUMBERS[level] >= LOG_LEVEL_NUMBERS[CONSOLE_FALLBACK_MIN_LEVEL] &&
      !(typeof record.event === 'string' && BROWSER_REPORTED_EVENTS.has(record.event));
    if (isDev() || consoleFallback) writeToConsole(record);
    if (remote) enqueue(record);
  } catch {
    // Logging must never throw into the caller.
  }
};

export interface ClientLogger {
  trace: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  fatal: (message: string, context?: LogContext) => void;
  child: (bindings: Record<string, unknown>) => ClientLogger;
}

const createLogger = (bindings: Record<string, unknown>): ClientLogger => ({
  trace: (message, context) => emit('trace', message, context, bindings),
  debug: (message, context) => emit('debug', message, context, bindings),
  info: (message, context) => emit('info', message, context, bindings),
  warn: (message, context) => emit('warn', message, context, bindings),
  error: (message, context) => emit('error', message, context, bindings),
  fatal: (message, context) => emit('fatal', message, context, bindings),
  child: (childBindings) => createLogger({ ...bindings, ...childBindings }),
});

export const clientLogger = createLogger({});

export const getClientSessionId = (): string => sessionId;

export const flushClientLogs = (): void => flush();

// Flush on tab hide / unload so buffered records aren't lost. Idempotent.
export const installClientLoggerLifecycle = (): (() => void) => {
  if (lifecycleInstalled || typeof window === 'undefined') return () => undefined;
  lifecycleInstalled = true;

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flush);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', flush);
    lifecycleInstalled = false;
  };
};
