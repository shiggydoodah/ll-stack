import 'server-only';
import { getSession } from '../authentication/session-cookie';
import { SESSION_COOKIE_NAME } from '../authentication/session-constants';
import { normalizeServiceResponse } from '@repo/services/core';
import type { ServiceResult } from '@repo/services/core';
import { getCorrelationId, getSessionId } from '../logging/request-context';
import { REQUEST_ID_HEADER, SESSION_ID_HEADER } from '../logging/correlation';
import { serverLogger } from '../logging/server-logger';
import { FRONTEND_LOG_EVENTS } from '../logging/log-events';

const TRACE_ID_HEADER = 'x-trace-id';

// The backend stamps its trace id on every response (header + body). Reading it
// here lets a Next-server log line reference the matching backend log.
export const readBackendTraceId = (response: Response | undefined): string | undefined =>
  response?.headers?.get(TRACE_ID_HEADER) ?? undefined;

export const buildSessionCookieHeader = (session: string): Record<string, string> => ({
  Cookie: `${SESSION_COOKIE_NAME}=${session}`,
});

// Forwards the request-scoped ids to the backend so its log lines share them:
// the per-request correlation id as `x-request-id`, and the stable session/visitor
// id as `x-session-id`. Empty when outside a request context (e.g. cached reads —
// see request-context.ts).
export const buildCorrelationHeader = (): Record<string, string> => {
  const correlationId = getCorrelationId();
  const sessionId = getSessionId();
  return {
    ...(correlationId ? { [REQUEST_ID_HEADER]: correlationId } : {}),
    ...(sessionId ? { [SESSION_ID_HEADER]: sessionId } : {}),
  };
};

// Merges the correlation header into a generated-client options object. Used by
// uncached direct gateway calls; cached calls intentionally omit it.
export const withCorrelation = <T extends object>(options: T): T => {
  const correlation = buildCorrelationHeader();
  if (Object.keys(correlation).length === 0) return options;
  const existing =
    'headers' in options && options.headers && typeof options.headers === 'object'
      ? (options.headers as Record<string, unknown>)
      : {};
  return { ...options, headers: { ...existing, ...correlation } } as T;
};

type RawServiceResponse<T, E> = {
  data: T | undefined;
  error: E | undefined;
  response?: Response;
};

// Backend error payloads can carry submitted emails, validation detail, or
// tokens. Log only a safe code/message — never the raw object — so the structured
// log stream never becomes a PII/secret sink.
const sanitizeGatewayError = (error: unknown): { errorCode?: string; errorMessage?: string } => {
  if (typeof error !== 'object' || error === null) return {};
  const record = error as Record<string, unknown>;
  return {
    ...('code' in record ? { errorCode: String(record.code) } : {}),
    ...('message' in record ? { errorMessage: String(record.message) } : {}),
  };
};

const logGateway = (
  result: ServiceResult<unknown, unknown>,
  logContext: string,
  durationMs: number,
): void => {
  const traceId = readBackendTraceId(result.response);
  const base = {
    operation: logContext,
    status: result.status,
    durationMs,
    message: result.message ?? 'no message',
    ...(traceId ? { traceId } : {}),
  };

  if (!result.ok) {
    const body = { ...base, ...sanitizeGatewayError(result.error) };
    const status = result.status;
    if (status !== undefined && status >= 500) {
      serverLogger.fatal(FRONTEND_LOG_EVENTS['gateway.request.failed'], body);
    } else if (status === 429 || status === 400) {
      serverLogger.error(FRONTEND_LOG_EVENTS['gateway.request.failed'], body);
    } else {
      serverLogger.warn(FRONTEND_LOG_EVENTS['gateway.request.failed'], body);
    }
    return;
  }

  serverLogger.info(FRONTEND_LOG_EVENTS['gateway.response.successful'], {
    ...base,
    hasData: result.data != null,
  });
};

/**
 * Wraps a gateway call: normalises the raw service response and logs the
 * request outcome at the appropriate level.
 *
 * When `withAuth` is true (the default) the session cookie and correlation
 * headers are injected automatically. Set `withAuth: false` for public
 * endpoints — correlation headers are still forwarded, but no session cookie.
 *
 * For cached inner functions that receive `session` as a parameter, use
 * `buildSessionCookieHeader` directly instead.
 */
export async function gatewayWrapper<T, E = unknown>(
  call: (headers: Record<string, string> | undefined) => Promise<RawServiceResponse<T, E>>,
  logContext: string,
  { withAuth = true }: { withAuth?: boolean } = {},
): Promise<ServiceResult<T, E>> {
  const startedAt = performance.now();
  const correlationHeaders = buildCorrelationHeader();
  let headers: Record<string, string>;
  if (withAuth) {
    const session = await getSession();
    headers = {
      ...(session ? buildSessionCookieHeader(session) : {}),
      ...correlationHeaders,
    };
  } else {
    headers = correlationHeaders;
  }

  // Request-entry breadcrumb (dev + staging). Booleans only — never the session
  // cookie value or the correlation ids themselves.
  serverLogger.debug(FRONTEND_LOG_EVENTS['gateway.request.started'], {
    operation: logContext,
    withAuth,
    ...(withAuth ? { hasSession: !!headers.Cookie } : {}),
    hasCorrelation: Object.keys(correlationHeaders).length > 0,
  });

  // Fine-grained outbound detail (development only). Header *names* confirm what
  // was attached; values (including the session Cookie) are never logged.
  serverLogger.trace(FRONTEND_LOG_EVENTS['gateway.call.dispatched'], {
    operation: logContext,
    headerNames: Object.keys(headers),
  });

  const result = normalizeServiceResponse(
    await call(Object.keys(headers).length > 0 ? headers : undefined),
  );
  const durationMs = Math.round(performance.now() - startedAt);

  // Result boundary (development only). A safe outcome summary — never the raw
  // response body — that pairs with `gateway.call.dispatched` to bracket the call.
  serverLogger.trace(FRONTEND_LOG_EVENTS['gateway.call.completed'], {
    operation: logContext,
    ok: result.ok,
    status: result.status,
    durationMs,
    hasData: result.ok && result.data != null,
  });

  logGateway(result, logContext, durationMs);
  return result;
}
