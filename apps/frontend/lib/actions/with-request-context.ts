import 'server-only';
import { headers } from 'next/headers';
import { runWithRequestContext } from '../logging/request-context';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_HEADER,
  isValidCorrelationId,
  normalizeCorrelationId,
} from '../logging/correlation';

// Wraps a server action or route-handler body so a per-request correlation id is
// available ambiently via request-context AsyncLocalStorage. The gateway and
// server logger read it without it being threaded through their signatures.
//
// The id comes from the inbound `x-correlation-id` header set by proxy.ts, which
// runs on every request (navigations and server-action POSTs alike). When the
// header is absent, `normalizeCorrelationId(null)` mints a fresh id, so an id is
// always produced. Callers no longer pass anything — the stable cross-tier join
// key is the `llstack_sid` cookie (see session-id.ts), which the proxy sets and
// the gateway forwards.
//
// Usage:
//   export const someAction = (values: T) =>
//     withRequestContext(() => runSomeAction(values));
export const withRequestContext = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  const requestHeaders = await headers();
  const correlationId = normalizeCorrelationId(requestHeaders.get(CORRELATION_ID_HEADER));
  const sessionHeader = requestHeaders.get(SESSION_ID_HEADER);
  const sessionId = isValidCorrelationId(sessionHeader) ? sessionHeader : undefined;
  return runWithRequestContext({ correlationId, sessionId }, () => Promise.resolve(fn()));
};
