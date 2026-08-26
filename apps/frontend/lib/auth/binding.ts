import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getIdleTimeoutSeconds } from './constants';

/**
 * What a valid binding token says about the session behind it. Both figures are
 * epoch seconds.
 *
 * `rotateAt` is when `proxy.ts` should next ask the backend whether the session
 * token is due for rotation. It rides inside the HMAC rather than in a cookie of
 * its own so it cannot be pushed forward by anyone but this server — a browser
 * that could move it could put off its own rotation indefinitely.
 *
 * Zero means "ask on the next member request", which is what a freshly signed-in
 * browser carries: this app never learns the backend's rotation interval, it is
 * told the next deadline in each answer.
 */
export interface BindingPayload {
  readonly expiresAt: number;
  readonly rotateAt: number;
}

/**
 * The server-only HMAC key behind every token this app mints itself — the
 * binding token here, and `logout-token.ts`'s proof that a `/logout` redirect
 * came from this server. Both sign under a distinct message shape, so one can
 * never verify as the other.
 */
export function getBindingSecret(): Buffer {
  const secret = process.env.BINDING_SECRET;
  if (!secret) throw new Error('BINDING_SECRET is not configured');
  return Buffer.from(secret, 'utf8');
}

function sign(sessionToken: string, expiresAt: number, rotateAt: number): string {
  const message = `${sessionToken}:${expiresAt}:${rotateAt}`;
  return createHmac('sha256', getBindingSecret()).update(message).digest('base64url');
}

export function createBindingToken(sessionToken: string, rotateAt: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + getIdleTimeoutSeconds();
  return `${sign(sessionToken, expiresAt, rotateAt)}.${expiresAt}.${rotateAt}`;
}

/**
 * Verifies `token` against `sessionToken` and returns what it carries, or null
 * when it is malformed, expired, or not signed for this session.
 *
 * Splitting on `.` is safe: the HMAC is base64url, whose alphabet has no dot.
 */
export function readBindingToken(sessionToken: string, token: string): BindingPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [hmacPart, expiresAtPart, rotateAtPart] = parts;
  if (hmacPart === undefined || expiresAtPart === undefined || rotateAtPart === undefined) {
    return null;
  }

  const expiresAt = Number(expiresAtPart);
  const rotateAt = Number(rotateAtPart);
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(rotateAt)) return null;
  if (Math.floor(Date.now() / 1000) > expiresAt) return null;

  const expectedBuf = Buffer.from(sign(sessionToken, expiresAt, rotateAt), 'utf8');
  const actualBuf = Buffer.from(hmacPart, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  return { expiresAt, rotateAt };
}
