export const BACKEND_LOG_EVENTS = {
  'system.startup.success': 'system.startup.success',
  'system.startup.failure': 'system.startup.failure',
  'system.shutdown.initiated': 'system.shutdown.initiated',
  // The in-process throttle store hit its key ceiling with nothing reclaimable,
  // so new buckets are being refused with a 429 (BoundedThrottlerStorage fails
  // closed rather than evicting a blocked caller). Reason only — throttle keys
  // embed an IP or a hashed identifier and are never logged.
  'system.throttle_store.saturated': 'system.throttle_store.saturated',
  // A request for the Swagger UI or the OpenAPI document was refused by the
  // admin-key gate (staging/production only — see bootstrap/openapi-docs.ts).
  // Reason only; the presented credential is never logged.
  'system.openapi_docs.denied': 'system.openapi_docs.denied',
  // A session-prune sweep finished. Counts only — session rows carry token
  // hashes and user ids, and neither belongs in a periodic maintenance log.
  'system.session_prune.completed': 'system.session_prune.completed',
  'system.session_prune.failure': 'system.session_prune.failure',

  // Auth lifecycle. `userId` may be logged; emails never are — throttler
  // guards log a truncated sha256 `emailHash` / `ipHash` instead, and tokens
  // are never logged in any form.
  'auth.register.success': 'auth.register.success',
  'auth.register.failure': 'auth.register.failure',
  'auth.register.denied_consent': 'auth.register.denied_consent',
  'auth.register.throttled': 'auth.register.throttled',
  'auth.register.session_issued': 'auth.register.session_issued',
  'auth.login.success': 'auth.login.success',
  'auth.login.failure_unknown_account': 'auth.login.failure_unknown_account',
  'auth.login.failure_password_mismatch': 'auth.login.failure_password_mismatch',
  'auth.login.throttled': 'auth.login.throttled',
  'auth.logout.success': 'auth.logout.success',
  'auth.logout.no_session': 'auth.logout.no_session',

  'http.request.received': 'http.request.received',
  'http.request.completed': 'http.request.completed',
  'http.request.error': 'http.request.error',
  'http.request.warn': 'http.request.warn',
  'http.request.slow': 'http.request.slow',

  'db.query.slow': 'db.query.slow',
} as const;

export type BackendLogEvent = keyof typeof BACKEND_LOG_EVENTS;
export const BACKEND_LOG_EVENT_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+){2}$/;
