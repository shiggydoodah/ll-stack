import 'server-only';
import { createBindingToken, readBindingToken, type BindingPayload } from './binding';
import { COOKIE_NAME, ENTRY_COOKIE_NAME, getIdleTimeoutSeconds } from './constants';

// The binding token lives in two cookies (see `constants.ts`), so every writer
// must set both and every reader must know which one it may trust. That is
// three call sites for the write — the proxy's roll, the login action, the
// create-account action — plus /logout for the clear, and this module is the
// only place the pair is spelled out.
//
// The jar types are structural: `proxy.ts` holds a `NextResponse`'s
// `ResponseCookies`, the actions and the route handler hold `next/headers`'
// jar, and the three methods below are all that is used of either.

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

interface CookieWriter {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'strict' | 'lax';
      path: string;
      maxAge: number;
    },
  ): unknown;
}

interface CookieDeleter {
  delete(options: { name: string; path: string }): unknown;
}

/** Epoch seconds meaning "ask the backend about rotation on the next request". */
export const ROTATE_IMMEDIATELY = 0;

/**
 * Mint a binding token for `sessionToken` and write both cookies.
 *
 * Called on login, on account creation, and by the proxy whenever it has
 * something new to record — a rotation, a fresh rotation deadline, or a binding
 * that is far enough through its life to be worth rolling. That roll is what
 * makes the TTL an idle timeout rather than a fixed session length.
 *
 * `rotateAt` is when the proxy should next ask the backend about rotation. Pass
 * {@link ROTATE_IMMEDIATELY} when there is no deadline to record yet, which is
 * every path that has just established a session: the backend owns the interval
 * and hands the deadline back on the first ask.
 *
 * Throws when `BINDING_SECRET` is missing. Callers that are establishing a
 * session must clear it rather than leave a half-authenticated browser; the
 * proxy's roll is on an already-verified request, where a throw is the correct
 * loud failure.
 */
export function setBindingCookies(jar: CookieWriter, sessionToken: string, rotateAt: number): void {
  const token = createBindingToken(sessionToken, rotateAt);
  const maxAge = getIdleTimeoutSeconds();
  const secure = process.env.NODE_ENV === 'production';

  jar.set(COOKIE_NAME, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge });
  jar.set(ENTRY_COOKIE_NAME, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
}

export function clearBindingCookies(jar: CookieDeleter): void {
  jar.delete({ name: COOKIE_NAME, path: '/' });
  jar.delete({ name: ENTRY_COOKIE_NAME, path: '/' });
}

/**
 * Reads the binding this request arrived with, or null when the browser cannot
 * prove it is the one `sessionToken` was issued to.
 *
 * Returning the payload rather than a boolean is what lets the proxy schedule
 * against the two deadlines the token carries — the idle expiry and the next
 * rotation check — without a second parse.
 *
 * `allowEntryCookie` must be true only for safe methods. The strict cookie is
 * the real check; the lax one exists so a top-level GET navigation from another
 * site — an emailed link, a shared URL — is not read as a binding failure.
 *
 * A cross-site POST sends neither cookie, so admitting the lax one there would
 * not open a CSRF hole by SameSite's own rules. It is withheld anyway to keep
 * the strict cookie load-bearing on every state-changing request, which is the
 * only reason it exists. Cold entry is a navigation, and safe methods are
 * enough to cover it.
 *
 * Both cookies carry the same token, so an idle timeout expires the pair
 * together and this returns null however the request arrived.
 */
export function readBindingState(
  cookies: CookieReader,
  sessionToken: string,
  { allowEntryCookie }: { allowEntryCookie: boolean },
): BindingPayload | null {
  const strict = cookies.get(COOKIE_NAME)?.value;
  if (strict !== undefined) {
    const payload = readBindingToken(sessionToken, strict);
    if (payload !== null) return payload;
  }

  if (!allowEntryCookie) return null;

  const entry = cookies.get(ENTRY_COOKIE_NAME)?.value;
  return entry === undefined ? null : readBindingToken(sessionToken, entry);
}
