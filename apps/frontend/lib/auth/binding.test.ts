import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('./constants', () => ({ COOKIE_TTL_SECONDS: 1800 }));

const TEST_SECRET = 'test-binding-secret-that-is-at-least-32-chars';

beforeEach(() => {
  vi.stubEnv('BINDING_SECRET', TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

import { createBindingToken, verifyBindingToken } from './binding';

function signedExpiredToken(sessionToken: string): string {
  const expiry = Math.floor(Date.now() / 1000) - 1;
  const message = `${sessionToken}:${expiry}`;
  const hmac = createHmac('sha256', Buffer.from(TEST_SECRET, 'utf8'))
    .update(message)
    .digest('base64url');
  return `${hmac}.${expiry}`;
}

describe('createBindingToken', () => {
  it('returns a string in hmac.expiry format', () => {
    const token = createBindingToken('session-abc');
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(Number(parts[1])).toBeGreaterThan(0);
  });

  it('embeds an expiry approximately 1800 seconds from now', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = createBindingToken('session-abc');
    const after = Math.floor(Date.now() / 1000);
    const expiry = parseInt(token.split('.')[1]!, 10);
    expect(expiry).toBeGreaterThanOrEqual(before + 1800);
    expect(expiry).toBeLessThanOrEqual(after + 1800);
  });

  it('produces different tokens for different session tokens', () => {
    const t1 = createBindingToken('session-a');
    const t2 = createBindingToken('session-b');
    expect(t1.split('.')[0]).not.toBe(t2.split('.')[0]);
  });
});

describe('verifyBindingToken', () => {
  it('returns true for a valid token', () => {
    const token = createBindingToken('session-abc');
    expect(verifyBindingToken('session-abc', token)).toBe(true);
  });

  it('returns false when the session token does not match', () => {
    const token = createBindingToken('session-abc');
    expect(verifyBindingToken('session-xyz', token)).toBe(false);
  });

  it('returns false when the HMAC is tampered', () => {
    const token = createBindingToken('session-abc');
    const expiry = token.split('.')[1];
    // All-A HMAC is the wrong length for SHA-256 base64url (43 chars), use a correctly-sized fake
    const fakeHmac = 'A'.repeat(43);
    expect(verifyBindingToken('session-abc', `${fakeHmac}.${expiry}`)).toBe(false);
  });

  it('returns false when the expiry is tampered', () => {
    const token = createBindingToken('session-abc');
    const hmac = token.split('.')[0];
    const futureExpiry = Math.floor(Date.now() / 1000) + 99999;
    expect(verifyBindingToken('session-abc', `${hmac}.${futureExpiry}`)).toBe(false);
  });

  it('returns false when the token is expired', () => {
    const token = signedExpiredToken('session-abc');
    expect(verifyBindingToken('session-abc', token)).toBe(false);
  });

  it('returns false for a malformed token with no dot', () => {
    expect(verifyBindingToken('session-abc', 'nodothere')).toBe(false);
  });

  it('returns false for an empty token', () => {
    expect(verifyBindingToken('session-abc', '')).toBe(false);
  });

  it('returns false when BINDING_SECRET differs', () => {
    const token = createBindingToken('session-abc');
    vi.stubEnv('BINDING_SECRET', 'a-different-secret-that-is-also-at-least-32ch');
    expect(verifyBindingToken('session-abc', token)).toBe(false);
  });
});
