import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const {
  mockCookies,
  mockJarDelete,
  mockRedirect,
  mockGetSession,
  mockClearSessionCookie,
  mockRevokeSession,
  mockClearBindingCookies,
  mockWarn,
} = vi.hoisted(() => {
  const mockJarDelete = vi.fn();
  return {
    mockJarDelete,
    mockCookies: vi.fn().mockResolvedValue({ delete: mockJarDelete }),
    mockRedirect: vi.fn(),
    mockGetSession: vi.fn(),
    mockClearSessionCookie: vi.fn(),
    mockRevokeSession: vi.fn(),
    mockClearBindingCookies: vi.fn(),
    mockWarn: vi.fn(),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/authentication/session-cookie', () => ({
  getSession: mockGetSession,
  clearSessionCookie: mockClearSessionCookie,
}));
vi.mock('@/lib/gateway/auth', () => ({ logout: mockRevokeSession }));
vi.mock('@/lib/auth/binding-cookies', () => ({ clearBindingCookies: mockClearBindingCookies }));
vi.mock('@/lib/logging/server-logger', () => ({ serverLogger: { warn: mockWarn } }));
// Passthrough: the wrapper only puts a correlation id in AsyncLocalStorage, and
// the real one reads `next/headers`. Keeping it here proves the handler body
// still runs inside it without standing up a request.
vi.mock('@/lib/actions/with-request-context', () => ({
  withRequestContext: <T>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
}));

// The real (pure) modules — the redirect target, the cookie name under
// assertion, and the token minting should be the ones the app actually ships.
import { SESSION_ID_COOKIE } from '@/lib/logging/correlation';
import { pageRoutes } from '@/lib/routes';
import { LOGOUT_TOKEN_PARAM, createLogoutToken } from '@/lib/auth/logout-token';
import { GET } from './route';

process.env.BINDING_SECRET ??= 'test-binding-secret-must-be-at-least-32-chars';

const ENDPOINT = 'https://example.com/logout';

/**
 * The session cookie the browser is holding. Every token is signed over it, so
 * a request that carries one has to carry the cookie it was minted for.
 */
const SESSION_TOKEN = 'live-session-token';
const SESSION_COOKIE = `llstack_session=${SESSION_TOKEN}`;

/**
 * Next signals `redirect()` by throwing a tagged error
 * (lib/errors/next-control-flow.ts), and the mock throws too. A handler that
 * ran anything after the redirect, or swallowed it, fails here rather than
 * passing quietly on a mock that merely returned.
 */
const REDIRECT_SIGNAL = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' });

/**
 * `headers` omitted sends NO fetch metadata — an older browser or a non-browser
 * caller. Every case names the fetch-metadata headers it wants, because those
 * three and the session cookie are the only things this route branches on.
 *
 * The session cookie rides on every request unless a case overrides it: it is
 * `SameSite=Lax`, so a browser sends it on the top-level cross-site navigation
 * the token has to be checked against.
 */
const get = (headers: Record<string, string> = {}, token?: string): NextRequest =>
  new NextRequest(token === undefined ? ENDPOINT : `${ENDPOINT}?${LOGOUT_TOKEN_PARAM}=${token}`, {
    method: 'GET',
    headers: { cookie: SESSION_COOKIE, ...headers },
  });

/** What a browser sends on a top-level navigation, whatever started it. */
const NAVIGATION = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

/** Drives a request that must sign out, and holds it to the redirect throw. */
const signOut = async (headers: Record<string, string> = {}, token?: string): Promise<void> => {
  await expect(GET(get(headers, token))).rejects.toBe(REDIRECT_SIGNAL);
};

/** Every side effect a completed sign-out has, asserted as one set. */
const expectSignedOut = (): void => {
  expect(mockClearSessionCookie).toHaveBeenCalledOnce();
  expect(mockClearBindingCookies).toHaveBeenCalledOnce();
  expect(mockJarDelete).toHaveBeenCalledWith({ name: SESSION_ID_COOKIE, path: '/' });
  expect(mockRedirect).toHaveBeenCalledWith(pageRoutes.public.login);
};

/** The same set, none of it having happened. */
const expectUntouched = (): void => {
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockRevokeSession).not.toHaveBeenCalled();
  expect(mockClearSessionCookie).not.toHaveBeenCalled();
  expect(mockClearBindingCookies).not.toHaveBeenCalled();
  expect(mockJarDelete).not.toHaveBeenCalled();
  expect(mockRedirect).not.toHaveBeenCalled();
};

describe('GET /logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({ delete: mockJarDelete });
    mockGetSession.mockResolvedValue({ token: 'session-token' });
    mockRevokeSession.mockResolvedValue(undefined);
    mockRedirect.mockImplementation(() => {
      throw REDIRECT_SIGNAL;
    });
  });

  describe('cross-site refusal', () => {
    // Every cross-site vector, subresource and navigation alike. Serving any of
    // them hands another site a logout button for every visitor it can reach,
    // and the sign-out revokes the backend session rather than only clearing
    // cookies.
    it.each([
      ['image', 'no-cors', '<img src="https://app/logout"> on someone else’s page'],
      ['iframe', 'navigate', 'a hidden frame pointed at /logout'],
      ['script', 'no-cors', 'a <script src> tag'],
      ['empty', 'cors', 'a fetch() from another origin'],
      ['document', 'navigate', '<a target="_blank">, window.open, or an attacker’s 302'],
    ])('403s a cross-site %s request and changes nothing', async (dest, mode) => {
      const res = await GET(
        get({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': mode, 'sec-fetch-dest': dest }),
      );

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it.each([
      ['image', 'no-cors', '<img src> replaying a token read out of an access log'],
      ['empty', 'cors', 'a fetch() from another origin'],
      ['iframe', 'navigate', 'a hidden frame, which navigates but is not the document'],
    ])('403s a cross-site %s request even when it carries a valid token', async (dest, mode) => {
      // A valid token proves the request came through one of our redirects, and
      // those are always top-level navigations. It does not excuse a
      // subresource: the token sits in a query string for two minutes, so the
      // address bar, the browser history, and every access log in front of the
      // app hold a copy that a page on another origin could replay.
      const res = await GET(
        get(
          { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': mode, 'sec-fetch-dest': dest },
          createLogoutToken(SESSION_TOKEN),
        ),
      );

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it('403s a cross-site request that names no mode or destination', async () => {
      const res = await GET(get({ 'sec-fetch-site': 'cross-site' }));

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it.each([
      ['a forged token', 'not-a-real-token.99999999999'],
      ['an empty token', ''],
      ['a token signed for nothing', `${'A'.repeat(43)}.99999999999`],
    ])('403s a cross-site navigation carrying %s', async (_label, token) => {
      // Only this server holds BINDING_SECRET, so another origin cannot mint
      // one — which is the whole reason the navigation case is gated on it.
      const res = await GET(get({ ...NAVIGATION, 'sec-fetch-site': 'cross-site' }, token));

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it('403s a cross-site navigation carrying a token minted for another session', async () => {
      // THE VECTOR THE BINDING CLOSES. Minting is not the bar an attacker has
      // to clear, because this app mints on demand: `proxy.ts` answers any
      // request for a member page that carries a session cookie it cannot match
      // a binding to with a 307 to `/logout?t=…`, so a live token is one curl
      // away with no account and no browser. Signed over the session cookie, it
      // verifies only against the browser it was minted for.
      const harvested = createLogoutToken('an-attackers-own-session-token');

      const res = await GET(get({ ...NAVIGATION, 'sec-fetch-site': 'cross-site' }, harvested));

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it('403s a cross-site navigation from a browser sending no session cookie', async () => {
      // Nothing to bind the token to, and nothing to revoke either.
      const res = await GET(
        get({ ...NAVIGATION, 'sec-fetch-site': 'cross-site', cookie: '' }, createLogoutToken('')),
      );

      expect(res?.status).toBe(403);
      expectUntouched();
    });

    it('403s a cross-site navigation carrying an expired token', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const token = createLogoutToken(SESSION_TOKEN);
        vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));

        const res = await GET(get({ ...NAVIGATION, 'sec-fetch-site': 'cross-site' }, token));

        expect(res?.status).toBe(403);
        expectUntouched();
      } finally {
        vi.useRealTimers();
      }
    });

    it('refuses before reading the session, whatever cookies the browser sent', async () => {
      // The guard sits ahead of every await in the handler, so a rejected
      // request never reaches the backend — not even to look.
      mockGetSession.mockRejectedValue(new Error('must not be called'));

      const res = await GET(
        get({
          'sec-fetch-site': 'cross-site',
          'sec-fetch-dest': 'image',
          'sec-fetch-mode': 'no-cors',
          cookie: 'llstack_session=live-token',
        }),
      );

      expect(res?.status).toBe(403);
      expectUntouched();
    });
  });

  describe('requests it must still serve', () => {
    // `none` is the one that would break a real person: a bookmarked or typed
    // /logout carries it, and refusing that leaves them unable to sign out.
    it.each([
      ['same-origin', 'an in-app link'],
      ['none', 'a typed address or a bookmark'],
      ['same-site', 'a sibling host on the same registrable domain'],
    ])('signs out on sec-fetch-site: %s (%s)', async (site) => {
      await signOut({ ...NAVIGATION, 'sec-fetch-site': site });

      expect(mockRevokeSession).toHaveBeenCalledOnce();
      expectSignedOut();
    });

    it('signs out a visitor the proxy redirected here from an external link', async () => {
      // Browsers compute Sec-Fetch-Site over the whole URL list, so the proxy's
      // own 307 from /dashboard to /logout keeps the `cross-site` the original
      // emailed link arrived with. Refusing it outright left the visitor holding
      // a session cookie only this route clears, bouncing between /login,
      // /dashboard and a 403 — and admitting every cross-site navigation to fix
      // that handed the same route back to any page on the internet. The token
      // the proxy mints is what separates the two.
      await signOut(
        { ...NAVIGATION, 'sec-fetch-site': 'cross-site' },
        createLogoutToken(SESSION_TOKEN),
      );

      expect(mockRevokeSession).toHaveBeenCalledOnce();
      expectSignedOut();
    });

    it('signs out when the request carries no fetch metadata at all', async () => {
      // Absent is not cross-site. The guard needs that one value before it
      // refuses anything, so an older browser still signs out.
      await signOut();

      expect(mockRevokeSession).toHaveBeenCalledOnce();
      expectSignedOut();
    });
  });

  describe('sign-out', () => {
    it('skips the backend revoke when there is no session, and still clears', async () => {
      mockGetSession.mockResolvedValue(null);

      await signOut({ ...NAVIGATION, 'sec-fetch-site': 'same-origin' });

      expect(mockRevokeSession).not.toHaveBeenCalled();
      expectSignedOut();
    });

    it('clears and redirects even when the backend revoke fails', async () => {
      // A backend outage must never leave the browser holding a cookie it
      // cannot clear.
      mockRevokeSession.mockRejectedValue(new Error('backend down'));

      await signOut({ ...NAVIGATION, 'sec-fetch-site': 'same-origin' });

      expect(mockWarn).toHaveBeenCalledOnce();
      expectSignedOut();
    });
  });
});
