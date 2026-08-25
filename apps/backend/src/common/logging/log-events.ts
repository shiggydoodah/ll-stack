export const BACKEND_LOG_EVENTS = {
  'system.startup.success': 'system.startup.success',
  'system.startup.failure': 'system.startup.failure',
  'system.shutdown.initiated': 'system.shutdown.initiated',
  // The in-process throttle store hit its key ceiling with nothing reclaimable,
  // so new buckets are being refused with a 429 (BoundedThrottlerStorage fails
  // closed rather than evicting a blocked caller). Reason only — throttle keys
  // embed an IP or a hashed identifier and are never logged.
  'system.throttle_store.saturated': 'system.throttle_store.saturated',

  'http.request.received': 'http.request.received',
  'http.request.completed': 'http.request.completed',
  'http.request.error': 'http.request.error',
  'http.request.warn': 'http.request.warn',
  'http.request.slow': 'http.request.slow',

  'db.query.slow': 'db.query.slow',
} as const;

export type BackendLogEvent = keyof typeof BACKEND_LOG_EVENTS;
export const BACKEND_LOG_EVENT_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+){2}$/;
