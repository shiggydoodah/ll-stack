import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// Pinned rather than imported: this suite is about the token format and the
// HMAC, so it must not start failing when the shipped default changes.
// `vi.hoisted` because `vi.mock` is hoisted above ordinary consts.
const { IDLE_TIMEOUT_SECONDS } = vi.hoisted(() => ({ IDLE_TIMEOUT_SECONDS: 1800 }));

vi.mock('server-only', () => ({}));
vi.mock('./constants', () => ({ getIdleTimeoutSeconds: () => IDLE_TIMEOUT_SECONDS }));

const TEST_SECRET = 'test-binding-secret-that-is-at-least-32-chars';
const ROTATE_AT = 1_800_000_000;

beforeEach(() => {
  vi.stubEnv('BINDING_SECRET', TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

import { createBindingToken, readBindingToken } from './binding';

function sign(sessionToken: string, expiresAt: number, rotateAt: number): string {
  return createHmac('sha256', Buffer.from(TEST_SECRET, 'utf8'))
    .update(`${sessionToken}:${expiresAt}:${rotateAt}`)
    .digest('base64url');
}

function signedExpiredToken(sessionToken: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) - 1;
  return `${sign(sessionToken, expiresAt, ROTATE_AT)}.${expiresAt}.${ROTATE_AT}`;
}

describe('createBindingToken', () => {
  it('returns a string in hmac.expiry.rotateAt format', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    const parts = token.split('.');
    expect(parts.length).toBe(3);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(Number(parts[2])).toBe(ROTATE_AT);
  });

  it('embeds an expiry one idle timeout from now', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = createBindingToken('session-abc', ROTATE_AT);
    const after = Math.floor(Date.now() / 1000);
    const expiry = parseInt(token.split('.')[1]!, 10);
    expect(expiry).toBeGreaterThanOrEqual(before + IDLE_TIMEOUT_SECONDS);
    expect(expiry).toBeLessThanOrEqual(after + IDLE_TIMEOUT_SECONDS);
  });

  it('produces different tokens for different session tokens', () => {
    const t1 = createBindingToken('session-a', ROTATE_AT);
    const t2 = createBindingToken('session-b', ROTATE_AT);
    expect(t1.split('.')[0]).not.toBe(t2.split('.')[0]);
  });

  it('produces different tokens for different rotation deadlines', () => {
    const t1 = createBindingToken('session-abc', ROTATE_AT);
    const t2 = createBindingToken('session-abc', ROTATE_AT + 1);
    expect(t1.split('.')[0]).not.toBe(t2.split('.')[0]);
  });
});

describe('readBindingToken', () => {
  it('returns the payload for a valid token', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    expect(readBindingToken('session-abc', token)).toEqual({
      expiresAt: expect.any(Number),
      rotateAt: ROTATE_AT,
    });
  });

  it('returns null when the session token does not match', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    expect(readBindingToken('session-xyz', token)).toBeNull();
  });

  it('returns null when the HMAC is tampered', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    const [, expiry, rotateAt] = token.split('.');
    // All-A HMAC is the wrong length for SHA-256 base64url (43 chars), use a correctly-sized fake
    const fakeHmac = 'A'.repeat(43);
    expect(readBindingToken('session-abc', `${fakeHmac}.${expiry}.${rotateAt}`)).toBeNull();
  });

  it('returns null when the expiry is tampered', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    const [hmac, , rotateAt] = token.split('.');
    const futureExpiry = Math.floor(Date.now() / 1000) + 99999;
    expect(readBindingToken('session-abc', `${hmac}.${futureExpiry}.${rotateAt}`)).toBeNull();
  });

  it('returns null when the rotation deadline is pushed forward', () => {
    // The whole reason the deadline is inside the HMAC: a browser that could
    // move it could put off its own rotation for as long as it liked.
    const token = createBindingToken('session-abc', ROTATE_AT);
    const [hmac, expiry] = token.split('.');
    expect(readBindingToken('session-abc', `${hmac}.${expiry}.${ROTATE_AT + 86_400}`)).toBeNull();
  });

  it('returns null when the token is expired', () => {
    expect(readBindingToken('session-abc', signedExpiredToken('session-abc'))).toBeNull();
  });

  it('returns null for a two-field token from before rotation existed', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + IDLE_TIMEOUT_SECONDS;
    const hmac = createHmac('sha256', Buffer.from(TEST_SECRET, 'utf8'))
      .update(`session-abc:${expiresAt}`)
      .digest('base64url');
    expect(readBindingToken('session-abc', `${hmac}.${expiresAt}`)).toBeNull();
  });

  it('returns null for a non-numeric rotation deadline', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    const [hmac, expiry] = token.split('.');
    expect(readBindingToken('session-abc', `${hmac}.${expiry}.soon`)).toBeNull();
  });

  it('returns null for a malformed token with no dot', () => {
    expect(readBindingToken('session-abc', 'nodothere')).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(readBindingToken('session-abc', '')).toBeNull();
  });

  it('returns null when BINDING_SECRET differs', () => {
    const token = createBindingToken('session-abc', ROTATE_AT);
    vi.stubEnv('BINDING_SECRET', 'a-different-secret-that-is-also-at-least-32ch');
    expect(readBindingToken('session-abc', token)).toBeNull();
  });
});
