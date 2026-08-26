import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getBindingSecret } from './binding';
import { pageRoutes } from '../routes';

/**
 * Query parameter carrying the token. Short because it rides on a redirect the
 * visitor sees in their address bar.
 */
export const LOGOUT_TOKEN_PARAM = 't';

/**
 * How long a minted token is honoured. It has to survive one redirect hop and a
 * page load, not a session — the shorter this is, the less a token that leaks
 * through a Referer header or a shared URL is worth to anyone.
 */
const TOKEN_TTL_SECONDS = 120;

/**
 * Domain separator. `binding.ts` signs with the same key, and a token minted for
 * one purpose must never verify for the other.
 */
const MESSAGE_PREFIX = 'logout';

function sign(sessionToken: string, expiresAt: number): string {
  return createHmac('sha256', getBindingSecret())
    .update(`${MESSAGE_PREFIX}:${sessionToken}:${expiresAt}`)
    .digest('base64url');
}

/**
 * Mints proof that this app sent THIS browser to `/logout`.
 *
 * `/logout` is a GET route handler that revokes the session backend-side, so
 * any site that can make a browser issue that request can sign a visitor out.
 * `Sec-Fetch-Site` cannot separate a visitor arriving from another page firing
 * it, because the browser computes that header over the whole redirect chain
 * and this app's own 307 into `/logout` inherits the `cross-site` an external
 * link arrived with. Refusing every cross-site request therefore refused real
 * sign-outs, and admitting every cross-site top-level navigation admitted
 * `<a target="_blank">`, `window.open`, and a 302 from an attacker's page.
 *
 * THE SESSION TOKEN IS IN THE SIGNED MESSAGE, and that is what makes the proof
 * worth anything. "Only this server holds `BINDING_SECRET`" does not help on
 * its own, because an attacker never has to mint a token, only obtain one, and
 * the app hands them out: `proxy.ts` redirects here whenever a session cookie
 * arrives without a valid binding, so `curl -H 'Cookie: llstack_session=x'
 * /dashboard` reads a live token out of the `Location` header. Signed over the
 * cookie value, a harvested token fails against the session a victim's browser
 * actually sends. That cookie is `SameSite=Lax`, so the browser supplies it on
 * exactly the request being checked.
 *
 * It is bound to a session and nothing more, so a token that leaks inside its
 * two minutes can sign out the one session it names, exactly as a same-site
 * link already can. What no other origin can do is produce one that verifies
 * against a session it cannot read.
 */
export function createLogoutToken(sessionToken: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return `${sign(sessionToken, expiresAt)}.${expiresAt}`;
}

/**
 * The `/logout` path a redirect should point at, carrying a token bound to
 * `sessionToken`.
 *
 * A null or empty token means the browser is holding no session, which every
 * caller in this app rules out — `proxy.ts` will not reach a member route
 * without one, and the layout guards run behind it. There is nothing to bind to
 * and nothing to revoke, so the bare path is what comes back: still served on a
 * same-site or bookmarked request, refused cross-site like any other untokened
 * navigation.
 */
export function logoutRedirectPath(sessionToken: string | null | undefined): string {
  const path = pageRoutes.public.logout;
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) return path;
  return `${path}?${LOGOUT_TOKEN_PARAM}=${createLogoutToken(sessionToken)}`;
}

/**
 * Whether `token` was minted by this server for `sessionToken` and has not
 * expired.
 *
 * Splitting on `.` is safe: the HMAC is base64url, whose alphabet has no dot.
 */
export function verifyLogoutToken(
  sessionToken: string | null | undefined,
  token: string | null | undefined,
): boolean {
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) return false;
  if (typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [hmacPart, expiresAtPart] = parts;
  if (hmacPart === undefined || expiresAtPart === undefined) return false;

  const expiresAt = Number(expiresAtPart);
  if (!Number.isSafeInteger(expiresAt)) return false;
  if (Math.floor(Date.now() / 1000) > expiresAt) return false;

  const expectedBuf = Buffer.from(sign(sessionToken, expiresAt), 'utf8');
  const actualBuf = Buffer.from(hmacPart, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
