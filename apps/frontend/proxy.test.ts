// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { proxy } from './proxy';
import {
  CORRELATION_ID_HEADER,
  SESSION_ID_COOKIE,
  SESSION_ID_HEADER,
} from './lib/logging/correlation';

const makeRequest = (path = '/', headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(new URL(path, 'http://localhost:4100'), { headers });

describe('proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets the security headers on every response', () => {
    const response = proxy(makeRequest());

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

  it('keeps the production CSP strict: no unsafe-inline/unsafe-eval in script-src, nonce required', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const csp = proxy(makeRequest()).headers.get('Content-Security-Policy') ?? '';
    const scriptSrc = csp.split('; ').find((directive) => directive.startsWith('script-src')) ?? '';

    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).not.toContain('strict-dynamic');
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('mints a session id cookie for a first-time visitor', () => {
    const response = proxy(makeRequest());

    const cookie = response.cookies.get(SESSION_ID_COOKIE);
    expect(cookie?.value).toEqual(expect.any(String));
    expect(cookie?.value.length).toBeGreaterThan(0);
  });

  it('propagates the correlation and session ids on the forwarded request headers', () => {
    const response = proxy(makeRequest('/', { [CORRELATION_ID_HEADER]: 'not-valid!' }));

    // Header names Next uses to override forwarded request headers.
    const forwarded = response.headers.get('x-middleware-request-' + CORRELATION_ID_HEADER);
    const forwardedSession = response.headers.get('x-middleware-request-' + SESSION_ID_HEADER);
    expect(forwarded).toEqual(expect.any(String));
    expect(forwardedSession).toEqual(expect.any(String));
  });
});
