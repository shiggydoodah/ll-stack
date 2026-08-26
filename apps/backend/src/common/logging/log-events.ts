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
  // A verified password was stored under an older scheme or a lower argon2
  // cost and has just been re-hashed at the current settings. Watch the rate
  // after an `AUTH_ARGON2_*` change: it should fall to zero as the population
  // signs in. The rehash is opportunistic, so a failed write logs and the login
  // still succeeds — an operator seeing `password_rehash_failed` at any
  // sustained rate is looking at a database problem, not an auth one.
  'auth.login.password_rehashed': 'auth.login.password_rehashed',
  'auth.login.password_rehash_failed': 'auth.login.password_rehash_failed',
  'auth.logout.no_session': 'auth.logout.no_session',

  // Session token rotation. `auth.session.reuse_detected` is the one worth
  // alerting on: a retired token was presented outside the rotation grace
  // window AND a token minted after it was retired had already been used, which
  // takes a second holder. It carries the userId and the family it revoked —
  // never the token or either hash of it.
  //
  // `auth.session.rotation_response_lost` is the same presentation with no such
  // successor. That is a rotation whose answer never reached the FRONTEND — an
  // aborted or timed-out rotate call — so the presented token is restored, the
  // successor nobody received is revoked, and the session survives. Do NOT alert
  // on it; watch it for a rate, since a rising one means rotation calls are
  // being dropped.
  //
  // A response lost between the frontend and the BROWSER lands on
  // `auth.session.reuse_detected` instead, because the frontend's own render
  // has already spent the successor. That is the known false positive on the
  // alarm; SECURITY.md sets out why it is the cheaper failure.
  //
  // A sign-out emits `auth.session.family_revoked` with `reason: 'logout'` and
  // nothing else — that event carries the family and the row count, so a second
  // line on the same condition would only double-count it.
  'auth.session.rotated': 'auth.session.rotated',
  'auth.session.reuse_detected': 'auth.session.reuse_detected',
  'auth.session.rotation_response_lost': 'auth.session.rotation_response_lost',
  'auth.session.family_revoked': 'auth.session.family_revoked',
  // A member ended every live sign-in on their own account from the account
  // page (`POST /auth/sessions/revoke-all`). One line for the whole sweep,
  // carrying the sign-in and token counts, rather than one `family_revoked` per
  // sign-in — a person clearing five browsers is one decision, not five.
  'auth.session.all_revoked': 'auth.session.all_revoked',
  'auth.session.rotation_throttled': 'auth.session.rotation_throttled',
  'auth.session.revoke_all_throttled': 'auth.session.revoke_all_throttled',

  'http.request.received': 'http.request.received',
  'http.request.completed': 'http.request.completed',
  'http.request.error': 'http.request.error',
  'http.request.warn': 'http.request.warn',
  'http.request.slow': 'http.request.slow',

  'db.query.slow': 'db.query.slow',
} as const;

export type BackendLogEvent = keyof typeof BACKEND_LOG_EVENTS;
export const BACKEND_LOG_EVENT_NAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+){2}$/;
