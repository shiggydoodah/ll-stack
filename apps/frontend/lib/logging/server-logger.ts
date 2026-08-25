import 'server-only';
import { DEFAULT_LOG_LEVEL_BY_ENV, sanitizeLogValue, type LogLevel } from '@repo/logging/shared';
import { getServerEnv } from '../../config/env';
import { getCorrelationId, getSessionId } from './request-context';
import { LOG_LEVEL_NUMBERS, isLevelEnabled } from './levels';
import { writeServerLogRecord } from './log-emitter';
import type { FrontendLogEvent } from './log-events';

// Structured logger for the Next.js server runtime (gateway, server actions,
// route handlers). Reuses the shared sinks and redaction so its output is
// queryable alongside backend logs, joined by `requestId`/`correlationId`.

type LogContext = Record<string, unknown>;

const SOURCE = 'frontend-server';

const resolveThreshold = (): LogLevel => {
  const env = getServerEnv();
  return env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL_BY_ENV[env.NODE_ENV];
};

const emit = (level: LogLevel, event: FrontendLogEvent | string, context?: LogContext): void => {
  // Logging must never throw into the caller (env parse, sink init, etc.).
  try {
    if (!isLevelEnabled(level, resolveThreshold())) return;

    const correlationId = getCorrelationId();
    const sessionId = getSessionId();
    const sanitizedContext =
      context === undefined ? {} : (sanitizeLogValue(context) as Record<string, unknown>);

    // Reserved fields are written last so context can never overwrite the
    // event/source/correlation that make the record traceable. `application` and
    // `env` are stamped centrally by writeServerLogRecord.
    writeServerLogRecord({
      ...sanitizedContext,
      level: LOG_LEVEL_NUMBERS[level],
      timestamp: new Date().toISOString(),
      message: event,
      event,
      source: SOURCE,
      // Both keys carry the same id: `requestId` joins with backend log lines,
      // `correlationId` reads naturally across tiers. `sessionId` is the stable
      // visitor/session join key shared with browser and backend logs.
      ...(correlationId ? { requestId: correlationId, correlationId } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
  } catch {
    // Intentionally ignored.
  }
};

export interface ServerLogger {
  trace: (event: FrontendLogEvent | string, context?: LogContext) => void;
  debug: (event: FrontendLogEvent | string, context?: LogContext) => void;
  info: (event: FrontendLogEvent | string, context?: LogContext) => void;
  warn: (event: FrontendLogEvent | string, context?: LogContext) => void;
  error: (event: FrontendLogEvent | string, context?: LogContext) => void;
  fatal: (event: FrontendLogEvent | string, context?: LogContext) => void;
}

export const serverLogger: ServerLogger = {
  trace: (event, context) => emit('trace', event, context),
  debug: (event, context) => emit('debug', event, context),
  info: (event, context) => emit('info', event, context),
  warn: (event, context) => emit('warn', event, context),
  error: (event, context) => emit('error', event, context),
  fatal: (event, context) => emit('fatal', event, context),
};
