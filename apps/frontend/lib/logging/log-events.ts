// Frontend log event catalog. Mirrors the backend's BACKEND_LOG_EVENTS naming
// convention (apps/backend/src/common/logging/log-events.ts) so logs from the
// browser, the Next server, and the backend share one vocabulary.
//
// Every name is exactly three dot-separated segments matching
// FRONTEND_LOG_EVENT_NAME_PATTERN.
export const FRONTEND_LOG_EVENTS = {
  // Server-side gateway / server-action lifecycle.
  'gateway.request.started': 'gateway.request.started',
  'gateway.call.dispatched': 'gateway.call.dispatched',
  'gateway.call.completed': 'gateway.call.completed',
  'gateway.request.failed': 'gateway.request.failed',
  'gateway.network_error': 'gateway.network_error',
  'gateway.response.successful': 'gateway.response.successful',
  'action.request.called': 'action.request.called',
  'action.request.details': 'action.request.details',
  'action.request.completed': 'action.request.completed',
  'action.request.failed': 'action.request.failed',
  'action.auth.missing': 'action.auth.missing',

  // Auth flow (server actions, logout route, layout guards). Reasons only —
  // never emails, tokens, or cookie values.
  'auth.login.session_missing': 'auth.login.session_missing',
  'auth.register.session_missing': 'auth.register.session_missing',
  'auth.logout.revocation_failed': 'auth.logout.revocation_failed',
  'session.validation.failed': 'session.validation.failed',
  'user.current.account_missing': 'user.current.account_missing',

  // Server-side error capture (instrumentation.ts onRequestError): an
  // unhandled server error — RSC render, route handler, or server action —
  // recorded with pre-stripping detail (name/message/digest, never a stack).
  // Its `digest` joins it to the client.error.boundary/client.error.expected
  // record for the same failure: the deliberate double record (server = full
  // detail, client = what the member saw). Do not deduplicate.
  'server.error.unhandled': 'server.error.unhandled',

  // Client (browser) events.
  'client.session.start': 'client.session.start',
  'client.error.unhandled': 'client.error.unhandled',
  'client.error.rejection': 'client.error.rejection',
  'client.error.boundary': 'client.error.boundary',
  // The warn-level expected-classification twin of client.error.boundary: a
  // boundary caught a typed ExpectedError (lib/errors) — a deliberate rung-5
  // "page cannot render" throw, not a surprise. Payload is `code` + `scope`.
  'client.error.expected': 'client.error.expected',
} as const;

export type FrontendLogEvent = keyof typeof FRONTEND_LOG_EVENTS;

export const FRONTEND_LOG_EVENT_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+){2}$/;
