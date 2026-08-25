import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './session-constants';

export { SESSION_COOKIE_NAME } from './session-constants';

interface ParsedSetCookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
  expires?: Date;
}

function parseSetCookieHeader(raw: string): ParsedSetCookie | null {
  const parts = raw.split(';').map((s) => s.trim());
  const nameValuePart = parts[0];
  if (!nameValuePart) return null;

  const eqIdx = nameValuePart.indexOf('=');
  if (eqIdx === -1) return null;

  const name = nameValuePart.slice(0, eqIdx).trim();
  const value = nameValuePart.slice(eqIdx + 1).trim();
  const result: ParsedSetCookie = { name, value };

  for (const attr of parts.slice(1)) {
    const lower = attr.toLowerCase();
    if (lower === 'httponly') {
      result.httpOnly = true;
    } else if (lower === 'secure') {
      result.secure = true;
    } else if (lower.startsWith('samesite=')) {
      const val = lower.slice('samesite='.length);
      if (val === 'strict' || val === 'lax' || val === 'none') {
        result.sameSite = val;
      }
    } else if (lower.startsWith('path=')) {
      result.path = attr.slice(lower.indexOf('=') + 1);
    } else if (lower.startsWith('max-age=')) {
      const n = parseInt(attr.slice(lower.indexOf('=') + 1), 10);
      if (!isNaN(n)) result.maxAge = n;
    } else if (lower.startsWith('expires=')) {
      const d = new Date(attr.slice(lower.indexOf('=') + 1));
      if (!isNaN(d.getTime())) result.expires = d;
    }
  }

  return result;
}

function splitSetCookieString(raw: string): string[] {
  // Headers.get('set-cookie') joins multiple Set-Cookie values with ", ".
  // Expires= attribute values also contain commas ("Wed, 15 Jun 2026 12:00:00 GMT"),
  // so we only split on ", " that is immediately followed by a cookie-name= token
  // (one or more non-whitespace/non-special chars then "=").
  return raw.split(/,\s+(?=[^\s=;,]+=)/);
}

export async function setSessionCookieFromUpstream(
  setCookieHeader: string | string[] | undefined,
): Promise<void> {
  if (!setCookieHeader) return;

  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : splitSetCookieString(setCookieHeader);
  const sessionHeader = headers.find((h) =>
    h.toLowerCase().startsWith(`${SESSION_COOKIE_NAME.toLowerCase()}=`),
  );
  if (!sessionHeader) return;

  const parsed = parseSetCookieHeader(sessionHeader);
  if (!parsed) return;

  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, parsed.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: parsed.sameSite,
    path: parsed.path,
    maxAge: parsed.maxAge,
    expires: parsed.expires,
  });
}

export async function getSession(): Promise<string | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE_NAME);
  return cookie?.value ? cookie.value : null;
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: SESSION_COOKIE_NAME, path: '/' });
}
