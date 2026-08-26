// @vitest-environment node
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

process.env.BINDING_SECRET = 'test-binding-secret-must-be-at-least-32-chars';

import { createBindingToken } from './binding';
import {
  LOGOUT_TOKEN_PARAM,
  createLogoutToken,
  logoutRedirectPath,
  verifyLogoutToken,
} from './logout-token';

/** The session cookie a token is minted against, and one belonging to anyone else. */
const SESSION = 'a-session-token';
const OTHER_SESSION = 'someone-elses-session-token';

afterEach(() => {
  vi.useRealTimers();
  process.env.BINDING_SECRET = 'test-binding-secret-must-be-at-least-32-chars';
});

describe('logout token', () => {
  it('verifies a token it just minted for a session', () => {
    expect(verifyLogoutToken(SESSION, createLogoutToken(SESSION))).toBe(true);
  });

  it('puts the token on the /logout path ready to redirect to', () => {
    const path = logoutRedirectPath(SESSION);
    const token = new URL(path, 'https://example.com').searchParams.get(LOGOUT_TOKEN_PARAM);

    expect(path.startsWith('/logout?')).toBe(true);
    expect(verifyLogoutToken(SESSION, token)).toBe(true);
  });

  // The vector the binding exists to close. `/logout` mints a token for anyone
  // holding any session cookie — the proxy redirects here whenever a binding
  // fails — so an attacker can harvest a live one with curl and no account. It
  // is worth nothing pointed at somebody else.
  it('refuses a token minted for a different session', () => {
    expect(verifyLogoutToken(OTHER_SESSION, createLogoutToken(SESSION))).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['no separator', 'justonepart'],
    ['too many parts', 'a.b.c'],
    ['a non-numeric expiry', 'signature.soon'],
    ['a tampered signature', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.99999999999'],
  ])('refuses %s', (_label, token) => {
    expect(verifyLogoutToken(SESSION, token)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('refuses every token when the session cookie is %s', (_label, session) => {
    // Nothing to bind to means nothing to verify. A browser presenting no
    // session cookie is also a browser with no session to revoke.
    expect(verifyLogoutToken(session, createLogoutToken(SESSION))).toBe(false);
  });

  it('leaves the token off the redirect when there is no session to bind to', () => {
    // Untokened, so /logout serves it same-site and refuses it cross-site —
    // which costs nothing, because the browser is holding no session either way.
    expect(logoutRedirectPath(null)).toBe('/logout');
    expect(logoutRedirectPath('')).toBe('/logout');
  });

  it('refuses a token whose expiry has been pushed forward', () => {
    // The expiry is inside the signed message, so moving it invalidates the
    // HMAC rather than buying the holder more time.
    const [signature, expiresAt] = createLogoutToken(SESSION).split('.');
    expect(verifyLogoutToken(SESSION, `${signature}.${Number(expiresAt) + 3_600}`)).toBe(false);
  });

  it('refuses a token past its two-minute life', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createLogoutToken(SESSION);

    vi.setSystemTime(new Date('2026-01-01T00:01:59Z'));
    expect(verifyLogoutToken(SESSION, token)).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:02:01Z'));
    expect(verifyLogoutToken(SESSION, token)).toBe(false);
  });

  it('refuses a token minted under a different secret', () => {
    const token = createLogoutToken(SESSION);
    process.env.BINDING_SECRET = 'a-completely-different-secret-32-chars!!';

    expect(verifyLogoutToken(SESSION, token)).toBe(false);
  });

  it('refuses a binding token, which is signed with the same key', () => {
    // Both sign under BINDING_SECRET, so the message shapes are what keep one
    // from ever verifying as the other.
    expect(verifyLogoutToken(SESSION, createBindingToken(SESSION, 0))).toBe(false);
  });
});
