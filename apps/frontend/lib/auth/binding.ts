import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { COOKIE_TTL_SECONDS } from './constants';

function getSecret(): Buffer {
  const secret = process.env.BINDING_SECRET;
  if (!secret) throw new Error('BINDING_SECRET is not configured');
  return Buffer.from(secret, 'utf8');
}

export function createBindingToken(sessionToken: string): string {
  const expiry = Math.floor(Date.now() / 1000) + COOKIE_TTL_SECONDS;
  const message = `${sessionToken}:${expiry}`;
  const hmac = createHmac('sha256', getSecret()).update(message).digest('base64url');
  return `${hmac}.${expiry}`;
}

export function verifyBindingToken(sessionToken: string, token: string): boolean {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) return false;

  const hmacPart = token.slice(0, dotIdx);
  const expiryStr = token.slice(dotIdx + 1);
  const expiry = parseInt(expiryStr, 10);

  if (!Number.isFinite(expiry) || Math.floor(Date.now() / 1000) > expiry) return false;

  const message = `${sessionToken}:${expiry}`;
  const expected = createHmac('sha256', getSecret()).update(message).digest('base64url');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(hmacPart, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
