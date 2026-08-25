// Correlation id primitives shared by browser and server logging.
//
// A single id links a browser event -> the Next.js server request -> the
// backend log line. The browser/proxy mints it; the gateway forwards it to the
// backend as `x-request-id`, which the backend validates against this exact
// shape (apps/backend/src/common/middleware/request-id.middleware.ts) and
// stamps onto every log line. Keep the format in lockstep with that middleware.

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';
// Forwarded to the backend so its log lines carry the visitor/session join key.
export const SESSION_ID_HEADER = 'x-session-id';

// Client-readable cookie holding the stable session/visitor id. The browser and
// the Next server both read it (the browser can't add headers to a server-action
// fetch — a cookie is the one thing both see), so logs across tiers share an id
// without it being threaded through any call. Not httpOnly by design.
export const SESSION_ID_COOKIE = 'llstack_sid';

// Persist the visitor/session id across browser restarts so the cross-tier join
// key is stable rather than session-only. One year, matching a typical
// first-party analytics/visitor cookie horizon.
export const SESSION_ID_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// UUID/trace-id shaped, bounded — matches the backend's VALID_REQUEST_ID so a
// forwarded id is accepted verbatim instead of being discarded.
const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const generateCorrelationId = (): string => crypto.randomUUID();

export const isValidCorrelationId = (value: string | null | undefined): value is string =>
  typeof value === 'string' && VALID_CORRELATION_ID.test(value);

// Accept a trusted inbound id when it is well-formed, otherwise mint a fresh one.
export const normalizeCorrelationId = (value: string | null | undefined): string =>
  isValidCorrelationId(value) ? value : generateCorrelationId();
