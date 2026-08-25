import 'server-only';
import type { Instrumentation } from 'next';
import { resolveRequestPath, sanitizeLogValue } from '@repo/logging/shared';
import { EXPECTED_DIGEST_PREFIX } from '../errors/expected-error';
import { isNextControlFlowSignal } from '../errors/next-control-flow';
import { CORRELATION_ID_HEADER, SESSION_ID_HEADER, isValidCorrelationId } from './correlation';
import { writeServerLogRecord } from './log-emitter';
import { FRONTEND_LOG_EVENTS } from './log-events';

// Builds and emits the `server.error.unhandled` record for Next's
// `onRequestError` hook (instrumentation.ts) — the server-side twin of the
// client boundary records, joined on `digest`. The hook runs OUTSIDE
// `withRequestContext` (no AsyncLocalStorage), so correlation ids are read
// straight from the request headers instead of the ambient context.

type RequestErrorRequest = Parameters<Instrumentation.onRequestError>[1];
type RequestErrorContext = Parameters<Instrumentation.onRequestError>[2];

const ERROR_LEVEL = 50;

const readDigest = (error: unknown): string | undefined => {
  const digest = (error as { digest?: unknown } | null | undefined)?.digest;
  return typeof digest === 'string' && digest.length > 0 ? digest : undefined;
};

// Name + digest only — stricter than sanitizeActionError (lib/actions/
// the server-action wrapper). `error.message` is deliberately never logged here: this
// hook captures EVERY unhandled server error, and the shared redaction only
// catches sensitive field names and whole-string token patterns, not values
// embedded in arbitrary message text ("lookup failed for a@b.com"). The digest
// still joins this record to the client boundary twin, which carries the
// message the browser already had. `error.stack` is likewise never logged
// server-side — it can embed file paths or interpolated values.
const sanitizeRequestError = (error: unknown): { errorName?: string; digest?: string } => {
  const digest = readDigest(error);
  return {
    ...(error instanceof Error ? { errorName: error.name } : {}),
    ...(digest === undefined ? {} : { digest }),
  };
};

const readHeader = (headers: RequestErrorRequest['headers'], name: string): string | undefined => {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Builds the sanitized `server.error.unhandled` record, or `null` when the
 * "error" is a Next control-flow signal and nothing should be emitted.
 * Request context is shapes only — `path` with no query string and no
 * credential-bearing segments, no headers dump, no body.
 */
export const buildRequestErrorRecord = (
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): Record<string, unknown> | null => {
  if (isNextControlFlowSignal(error)) return null;

  const sanitized = sanitizeRequestError(error);
  // Lets dashboards separate deliberate rung-5 ExpectedError throws from
  // genuine surprises without parsing the digest.
  const expected = sanitized.digest?.startsWith(EXPECTED_DIGEST_PREFIX) === true;

  const correlationId = readHeader(request.headers, CORRELATION_ID_HEADER);
  const sessionId = readHeader(request.headers, SESSION_ID_HEADER);

  // The variable payload passes the shared redaction (server-logger.ts
  // precedent). Reserved identity fields are written after it, so the payload
  // can never overwrite what makes the record traceable.
  const payload = sanitizeLogValue({
    ...sanitized,
    ...(expected ? { expected } : {}),
    // `resolveRequestPath`, NOT a hand-rolled query strip — a credential can sit
    // in the PATH, not only the query. A token-addressed route puts a long
    // bearer token in a route segment, and this hook captures EVERY unhandled
    // server error, so a throw on such a page would write a live token to the
    // shared sink. Neither redaction layer catches it: `path` is not a
    // sensitive field NAME, and a path is not token-SHAPED.
    // The helper masks the segment to `{id}` (LONG_TOKEN_PATH_SEGMENT_PATTERN)
    // and subsumes the query strip via its own `stripQueryString`. Same helper,
    // same reason, as `serializeRequestForLogging` backend-side
    // (packages/logging/src/log-redaction.ts).
    path: resolveRequestPath({ url: request.path }),
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    ...(context.renderSource === undefined ? {} : { renderSource: context.renderSource }),
    ...(context.revalidateReason === undefined
      ? {}
      : { revalidateReason: context.revalidateReason }),
  }) as Record<string, unknown>;

  return {
    ...payload,
    level: ERROR_LEVEL,
    timestamp: new Date().toISOString(),
    message: FRONTEND_LOG_EVENTS['server.error.unhandled'],
    event: FRONTEND_LOG_EVENTS['server.error.unhandled'],
    source: 'frontend-server',
    // Both keys carry the same id, matching server-logger.ts; omitted when the
    // header is missing or malformed rather than minted here — a fresh id
    // would join to nothing.
    ...(isValidCorrelationId(correlationId) ? { requestId: correlationId, correlationId } : {}),
    ...(isValidCorrelationId(sessionId) ? { sessionId } : {}),
  };
};

/**
 * Emits the record through the shared sink path. Must never throw or slow the
 * request path — every failure is swallowed (house logging rule), and
 * writeServerLogRecord already swallows sink errors.
 */
export const logRequestError = (
  error: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
): void => {
  try {
    const record = buildRequestErrorRecord(error, request, context);
    if (record !== null) writeServerLogRecord(record);
  } catch {
    // Intentionally ignored — capture must never break the failing request further.
  }
};
