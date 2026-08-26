import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

// Request-scoped context for the Next.js server runtime. Populated at server
// boundaries (server actions, route handlers) from the inbound `x-correlation-id`
// and `x-session-id` headers (both set by proxy.ts), then read ambiently by the
// gateway and the server logger so neither needs the ids threaded through its
// signature.
//
// `correlationId` is per-request; `sessionId` is the stable visitor/session join
// key carried in the `llstack_sid` cookie.
//
// NOTE: AsyncLocalStorage context does NOT cross Next's `'use cache'` boundary,
// so cached gateway reads are intentionally correlation-blind. Only inject the
// forwarded `x-request-id`/`x-session-id` on uncached backend calls.
export interface RequestContext {
  readonly correlationId: string;
  readonly sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getCorrelationId = (): string | undefined => storage.getStore()?.correlationId;

export const getSessionId = (): string | undefined => storage.getStore()?.sessionId;
