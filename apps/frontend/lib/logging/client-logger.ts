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

const resolveRemoteEnabled = (): boolean => {
  const flag = process.env.NEXT_PUBLIC_LOG_REMOTE;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return !isDev();
};

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
    const record = buildRecord(level, message, context, bindings);
    if (isDev()) writeToConsole(record);
    if (resolveRemoteEnabled()) enqueue(record);
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
