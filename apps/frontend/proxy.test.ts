// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// proxy.ts imports the binding-token helpers, which are server-only modules.
vi.mock('server-only', () => ({}));

// The rotation call is the proxy's only trip to the backend. Mocking it keeps
// this suite about the decisions the proxy makes with the answer.
const { requestSessionRotation } = vi.hoisted(() => ({ requestSessionRotation: vi.fn() }));
vi.mock('./lib/auth/session-rotation', () => ({ requestSessionRotation }));

import { proxy } from './proxy';
import { LOGOUT_TOKEN_PARAM, verifyLogoutToken } from './lib/auth/logout-token';
import { memberPageRoutes } from './lib/routes';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_COOKIE,
  SESSION_ID_HEADER,
} from './lib/logging/correlation';

const makeRequest = (
  path = '/',
  headers: Record<string, string> = {},
  method = 'GET',
): NextRequest => new NextRequest(new URL(path, 'http://localhost:4100'), { headers, method });

const BINDING_SECRET = 'test-binding-secret-at-least-32-chars-long';
const SESSION_TOKEN = 'some-session-token';

// Far enough out that the proxy has no reason to ask the backend anything, which
// is the state most of these cases want to be in.
const ROTATE_LATER = 4_000_000_000;

/** The rotation deadline the proxy recorded, read back out of the binding it wrote. */
const rotateAtIn = (bindingToken: string): number => Number(bindingToken.split('.')[2]);

/**
 * Asserts a redirect to /logout carrying a token this server minted FOR THIS
 * SESSION COOKIE. The route refuses a cross-site request without a matching
 * one, and every cross-site link into a member page that lands here arrives
 * cross-site — the redirect chain carries the value forward — so the token is
 * what keeps the sign-out working. Binding it to the session cookie is what
 * stops the same token working on anyone else's browser.
 */
const expectLogoutRedirect = (response: Response, sessionToken = SESSION_TOKEN): void => {
  const location = new URL(response.headers.get('location') ?? '');
  expect(location.pathname).toBe('/logout');
  expect(verifyLogoutToken(sessionToken, location.searchParams.get(LOGOUT_TOKEN_PARAM))).toBe(true);
};

// A signed-in member request: session cookie plus whichever binding cookies the
// browser would actually have sent.
const memberRequest = async (
  bindingCookies: ('strict' | 'entry')[],
  {
    method = 'GET',
    path = '/dashboard',
    rotateAt = ROTATE_LATER,
  }: { method?: string; path?: string; rotateAt?: number } = {},
): Promise<NextRequest> => {
  vi.stubEnv('BINDING_SECRET', BINDING_SECRET);
  const { createBindingToken } = await import('./lib/auth/binding');

  const request = makeRequest(path, {}, method);
  request.cookies.set('llstack_session', SESSION_TOKEN);

  const token = createBindingToken(SESSION_TOKEN, rotateAt);
  if (bindingCookies.includes('strict')) request.cookies.set('bind_dev', token);
  if (bindingCookies.includes('entry')) request.cookies.set('bind_entry_dev', token);

  // NextRequest's cookie jar does not write through to the Cookie header, and
  // the proxy forwards that header verbatim.
  request.headers.set(
    'cookie',
    request.cookies
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; '),
  );

  return request;
};

describe('proxy', () => {
  beforeEach(() => {
    // Every redirect into /logout signs a token with this, so it is needed on
    // more paths than the ones that mint a binding.
    vi.stubEnv('BINDING_SECRET', BINDING_SECRET);
    requestSessionRotation.mockReset();
    requestSessionRotation.mockResolvedValue({ status: 'not_due', rotateInSeconds: 3600 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('sets the security headers on every response', async () => {
    const response = await proxy(makeRequest());

    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });

  it('keeps the production CSP strict: no unsafe-inline/unsafe-eval in script-src, nonce required', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const csp = (await proxy(makeRequest())).headers.get('Content-Security-Policy') ?? '';
    const scriptSrc = csp.split('; ').find((directive) => directive.startsWith('script-src')) ?? '';

    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).not.toContain('strict-dynamic');
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('mints a session id cookie for a first-time visitor', async () => {
    const response = await proxy(makeRequest());

    const cookie = response.cookies.get(SESSION_ID_COOKIE);
    expect(cookie?.value).toEqual(expect.any(String));
    expect(cookie?.value.length).toBeGreaterThan(0);
  });

  it('redirects a session-cookie holder off guest pages before any HTML is served', async () => {
    const request = makeRequest('/login');
    request.cookies.set('llstack_session', 'some-session-token');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:4100/dashboard');
  });

  it('redirects member pages to login when no session cookie is present', async () => {
    const response = await proxy(makeRequest('/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:4100/login');
  });

  // Every entry in `memberPageRoutes` is guarded, not just /dashboard. A member
  // route this proxy does not recognise renders with no binding check, no idle
  // roll, and no rotation, and nothing about it looks broken until a session
  // outlives one of them.
  it.each(Object.values(memberPageRoutes))(
    'guards the member route %s the same way',
    async (route) => {
      const response = await proxy(makeRequest(route));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost:4100/login');
    },
  );

  it('guards a nested path under a member route', async () => {
    const response = await proxy(makeRequest(`${memberPageRoutes.account}/security`));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:4100/login');
  });

  it('bounces a member page to logout when the binding cookie is missing or invalid', async () => {
    const request = makeRequest('/dashboard');
    request.cookies.set('llstack_session', SESSION_TOKEN);

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expectLogoutRedirect(response);
  });

  it('admits a member navigation carrying a valid binding', async () => {
    const response = await proxy(await memberRequest(['strict', 'entry']));

    expect(response.status).toBe(200);
  });

  // SameSite=Strict withholds the primary cookie on a cross-site navigation, so
  // following a link in from email arrives with only the lax companion. That
  // used to read as a failed binding and cost the visitor their session.
  it('admits a cold entry carrying only the lax binding cookie', async () => {
    const response = await proxy(await memberRequest(['entry']));

    expect(response.status).toBe(200);
  });

  it('refuses a POST carrying only the lax binding cookie, redirecting with 303', async () => {
    const response = await proxy(await memberRequest(['entry'], { method: 'POST' }));

    // 303, never the redirect default of 307: a 307 replays the POST and its
    // body against /logout, which only exports GET and answers 405 — the
    // sign-out never lands and the visitor sees an opaque failure instead.
    expect(response.status).toBe(303);
    expectLogoutRedirect(response);
  });

  it('keeps 307 for a safe-method navigation with a lapsed binding', async () => {
    const request = await memberRequest([], {});

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expectLogoutRedirect(response);
  });

  it('writes no cookies on a request with nothing new to record', async () => {
    // A fresh binding and a rotation deadline still in the future. Writing here
    // bought nothing and widened the window in which a slow response could land
    // after a rotation and overwrite the new binding with a stale one.
    const response = await proxy(await memberRequest(['strict', 'entry']));

    expect(response.cookies.get('bind_dev')).toBeUndefined();
    expect(response.cookies.get('bind_entry_dev')).toBeUndefined();
    expect(requestSessionRotation).not.toHaveBeenCalled();
  });

  // The idle timeout only means "idle" if every kind of member request counts as
  // activity. Rolling on GET/HEAD alone signed out anyone whose work was a long
  // form, because a server action is a POST and nothing else.
  it.each(['GET', 'POST'])(
    'rolls both binding cookies on a %s once they are past half their idle life',
    async (method) => {
      vi.stubEnv('AUTH_IDLE_TIMEOUT_SECONDS', '1000');
      const request = await memberRequest(['strict', 'entry'], { method });

      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 600_000));
      const response = await proxy(request);

      expect(response.status).toBe(200);
      expect(response.cookies.get('bind_dev')?.value).toEqual(expect.any(String));
      expect(response.cookies.get('bind_entry_dev')?.value).toEqual(expect.any(String));
    },
  );

  describe('session rotation', () => {
    it('does not ask the backend until the deadline in the binding has passed', async () => {
      await proxy(await memberRequest(['strict', 'entry'], { rotateAt: ROTATE_LATER }));

      expect(requestSessionRotation).not.toHaveBeenCalled();
    });

    it('asks the backend once the deadline has passed', async () => {
      await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(requestSessionRotation).toHaveBeenCalledWith(SESSION_TOKEN);
    });

    // A navigation's response is the one the browser is certain to process. A
    // rotation landing on anything else risks the new token never reaching the
    // jar, which leaves the browser holding exactly what the reuse alarm looks for.
    it('does not ask on a server-action POST, however overdue the deadline', async () => {
      await proxy(await memberRequest(['strict', 'entry'], { method: 'POST', rotateAt: 0 }));

      expect(requestSessionRotation).not.toHaveBeenCalled();
    });

    it('records the backend’s next deadline so the following request does not ask again', async () => {
      requestSessionRotation.mockResolvedValue({ status: 'not_due', rotateInSeconds: 3600 });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      const recorded = rotateAtIn(response.cookies.get('bind_dev')!.value);
      expect(recorded).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000) + 3599);
    });

    it('writes the rotated session cookie and re-mints the binding over the new token', async () => {
      requestSessionRotation.mockResolvedValue({
        status: 'rotated',
        cookie: { name: 'llstack_session', value: 'a-rotated-token', path: '/', maxAge: 604_800 },
        rotateInSeconds: 3600,
      });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(response.cookies.get('llstack_session')?.value).toBe('a-rotated-token');
      expect(response.cookies.get('llstack_session')?.httpOnly).toBe(true);

      // The binding has to follow the token it is an HMAC over, or the very next
      // request reads a binding that no longer matches the session cookie.
      const { readBindingToken } = await import('./lib/auth/binding');
      const binding = response.cookies.get('bind_dev')!.value;
      expect(readBindingToken('a-rotated-token', binding)).not.toBeNull();
      expect(readBindingToken(SESSION_TOKEN, binding)).toBeNull();
    });

    it('forwards the rotated token so this request’s render uses it too', async () => {
      // Load-bearing beyond this request. Because the render spends the new
      // token, an unused successor is proof the rotation call never came back —
      // which is the signal the backend's lost-rotation recovery reads. Dropping
      // the rewrite would leave that signal meaning only "the browser has not
      // come back yet"; see `rewriteSessionCookie` and SECURITY.md.
      requestSessionRotation.mockResolvedValue({
        status: 'rotated',
        cookie: { name: 'llstack_session', value: 'a-rotated-token', path: '/' },
        rotateInSeconds: 3600,
      });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      const forwarded = response.headers.get('x-middleware-request-cookie') ?? '';
      expect(forwarded).toContain('llstack_session=a-rotated-token');
      expect(forwarded).not.toContain(SESSION_TOKEN);
      // Every other cookie survives the rewrite untouched.
      expect(forwarded).toContain('bind_dev=');
    });

    it.each([
      ['production', true],
      ['development', false],
    ])('marks the rotated cookie Secure in %s', async (nodeEnv, secure) => {
      // The flag is this app's own call, not the backend's: dev serves plain
      // http, where a Secure cookie is one the browser never sends back. Every
      // other attribute comes off the upstream Set-Cookie.
      vi.stubEnv('NODE_ENV', nodeEnv);
      requestSessionRotation.mockResolvedValue({
        status: 'rotated',
        cookie: {
          name: 'llstack_session',
          value: 'a-rotated-token',
          path: '/',
          sameSite: 'lax',
          maxAge: 604_800,
        },
        rotateInSeconds: 3600,
      });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(response.cookies.get('llstack_session')).toMatchObject({
        value: 'a-rotated-token',
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 604_800,
      });
    });

    it('writes nothing at all when another request already won the rotation', async () => {
      // The winner's cookies are already on their way to the browser. A binding
      // minted here would be over the retired token, and arriving second it
      // would leave the jar self-inconsistent — a forced sign-out next request.
      requestSessionRotation.mockResolvedValue({ status: 'superseded' });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(response.status).toBe(200);
      expect(response.cookies.get('bind_dev')).toBeUndefined();
      expect(response.cookies.get('bind_entry_dev')).toBeUndefined();
      expect(response.cookies.get('llstack_session')).toBeUndefined();
    });

    it('sends the browser to logout when the backend refuses the session', async () => {
      requestSessionRotation.mockResolvedValue({ status: 'signed_out' });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(response.status).toBe(307);
      expectLogoutRedirect(response);
    });

    it('keeps the session and backs off by AUTH_ROTATION_RETRY_SECONDS', async () => {
      // A rotation that could not happen is a missed improvement. Signing people
      // out on a network blip would be worse than never having rotated at all.
      //
      // How long to wait is the operator's call, because it has to clear the
      // backend's rotation grace window and neither app can read the other's
      // env. Tuned to a non-default here, so a back-off that ignored the
      // variable and used the 60-second default fails this.
      vi.stubEnv('AUTH_ROTATION_RETRY_SECONDS', '300');
      requestSessionRotation.mockResolvedValue({ status: 'unavailable' });

      const response = await proxy(await memberRequest(['strict', 'entry'], { rotateAt: 0 }));

      expect(response.status).toBe(200);
      const recorded = rotateAtIn(response.cookies.get('bind_dev')!.value);
      const nowSeconds = Math.floor(Date.now() / 1000);
      expect(recorded).toBeGreaterThan(nowSeconds + 60);
      expect(recorded).toBeLessThanOrEqual(nowSeconds + 300);
    });
  });

  it('forwards the CSP on the request headers so Next nonces request-time inline scripts', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await proxy(makeRequest());

    // Next reads the render nonce from the request's CSP header, not the response's.
    const forwardedCsp = response.headers.get('x-middleware-request-content-security-policy');
    expect(forwardedCsp).toBe(response.headers.get('Content-Security-Policy'));
    expect(forwardedCsp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('propagates the correlation and session ids on the forwarded request headers', async () => {
    const response = await proxy(makeRequest('/', { [CORRELATION_ID_HEADER]: 'not-valid!' }));

    // Header names Next uses to override forwarded request headers.
    const forwarded = response.headers.get('x-middleware-request-' + CORRELATION_ID_HEADER);
    const forwardedSession = response.headers.get('x-middleware-request-' + SESSION_ID_HEADER);
    expect(forwarded).toEqual(expect.any(String));
    expect(forwardedSession).toEqual(expect.any(String));
  });
});
