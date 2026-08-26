// The session-binding token (`binding.ts`) is an HMAC over the session token,
// carried in cookies of its own so the proxy can check that the browser holding
// the lax session cookie is the browser the session was issued to.
//
// The same token value is written to two cookies that differ only in SameSite:
//
//   COOKIE_NAME       Strict. The CSRF and session-fixation defence — never
//                     sent on a cross-site request, whatever the method.
//   ENTRY_COOKIE_NAME Lax. Sent on top-level cross-site GET navigations, which
//                     is the one case Strict legitimately drops.
//
// With only the strict cookie, following a link into /dashboard from an email
// or a chat client arrived carrying no binding at all. The proxy read that as a
// failed binding and redirected to /logout, so an external link cost the
// visitor their whole session. The lax companion cannot weaken the CSRF
// property, because a cross-site POST sends neither cookie, and it cannot be
// forged: it carries the same server-minted HMAC over the same session token.
// The proxy accepts it on safe methods only (`proxy.ts`).
//
// `__Host-` requires Secure, which local dev over http cannot set, hence the
// dev-only names.
export const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-bind' : 'bind_dev';
export const ENTRY_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-bind-entry' : 'bind_entry_dev';

/**
 * The idle timeout in seconds: the longest a signed-in browser may go without
 * touching a member route before the binding cookies lapse and it is signed
 * out. Eight hours covers a working day, so no interactive user meets it by
 * accident, and it is well under the backend's seven-day
 * `AUTH_SESSION_TTL_SECONDS`.
 *
 * It is a ceiling rather than an exact figure. `proxy.ts` re-stamps the binding
 * once it is half spent rather than on every request, so a browser whose last
 * member request landed just before that point lapses four hours later rather
 * than eight. The hourly rotation re-stamps it too, and only safe methods carry
 * a rotation, so reaching that short end takes a browser whose only member
 * traffic for over four hours was POSTs.
 *
 * These are two different clocks and both are real. The backend TTL is the
 * absolute ceiling on a session's life; this is the idle window inside it.
 * Before they were reconciled the binding cookie ran for 30 minutes and rolled
 * only on GET navigations, so the seven-day figure never described anything an
 * interactive user experienced.
 *
 * Raising this past the backend TTL is allowed and degrades cleanly: the
 * session cookie simply expires first and the proxy sends the visitor to
 * /login. This app cannot read the backend's value to check.
 */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 28_800;

/**
 * `AUTH_IDLE_TIMEOUT_SECONDS`, or the default above when it is unset.
 *
 * Read from `process.env` directly, the way `binding.ts` reads
 * `BINDING_SECRET`: this module is imported by `proxy.ts` on every request and
 * has no business pulling the whole server env schema in behind it.
 * `config/env.schema.ts` still owns the variable and validates it, and
 * `instrumentation.ts` parses that schema at boot, so a running app has already
 * rejected any value this function would have to fall back on. The fallback
 * covers the parse order, not a bad value reaching production.
 *
 * Read per call rather than resolved at module load: `cacheComponents` renders
 * some of this app at build time, and a module-scope read would bake the build
 * environment's value into the bundle.
 */
export function getIdleTimeoutSeconds(): number {
  const raw = process.env.AUTH_IDLE_TIMEOUT_SECONDS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_IDLE_TIMEOUT_SECONDS;

  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_TIMEOUT_SECONDS;
}

/**
 * The default for {@link getRotationRetrySeconds}, matching the backend's own
 * default for `AUTH_SESSION_ROTATION_GRACE_SECONDS`.
 */
export const DEFAULT_ROTATION_RETRY_SECONDS = 60;

/**
 * How long to wait before asking again after a rotation call that could not be
 * answered. Short enough that a blip costs one interval rather than a whole
 * session's worth of rotations, long enough that a backend outage does not turn
 * into a request-rate probe from every signed-in browser at once.
 *
 * IT IS THE BACKEND'S GRACE WINDOW THAT CAPS THIS, and the two apps cannot read
 * each other's env. That is the split `AUTH_IDLE_TIMEOUT_SECONDS` and
 * `AUTH_SESSION_TTL_SECONDS` already live with, documented the same way in both
 * `.env.example` files.
 *
 * When a rotation commits and only its answer to this app is lost, the browser
 * goes on holding the retired token. The grace window keeps that token served,
 * and a retry inside it is answered `superseded`, which writes nothing, so the
 * proxy re-asks on each navigation until one lands past the window and the
 * backend restores the token. Staying at or below the grace window keeps that
 * chain unbroken: set above it, there is a stretch where navigations do not ask
 * and every render's own backend call is refused, which is a forced sign-out
 * before the recovery can run.
 *
 * That is the case this covers and the only one. A rotation whose answer DID
 * arrive has already been spent by this request's own render (see
 * `rewriteSessionCookie` in `proxy.ts`), so a response lost after that point
 * looks like a second holder to the backend rather than a lost rotation.
 *
 * Read per call rather than at module load, for the reason
 * `getIdleTimeoutSeconds` gives: `cacheComponents` renders part of this app at
 * build time, and a module-scope read bakes the build environment's value in.
 */
export function getRotationRetrySeconds(): number {
  const raw = process.env.AUTH_ROTATION_RETRY_SECONDS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_ROTATION_RETRY_SECONDS;

  const parsed = Number(raw.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_ROTATION_RETRY_SECONDS;
}
