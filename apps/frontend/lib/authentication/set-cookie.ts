import { SESSION_COOKIE_NAME } from './session-constants';

/**
 * Parsing for the backend's `Set-Cookie` header.
 *
 * The session cookie the browser holds is this app's, not the backend's: every
 * path that establishes or replaces a session reads the backend's header and
 * re-sets the value on its own jar. Login and account creation do that through
 * `next/headers`; `proxy.ts` does it on a `NextResponse` and cannot use
 * `next/headers` at all. This module is the parsing both of them share, and it
 * deliberately touches nothing request-scoped so either can import it.
 */
export interface ParsedSetCookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  maxAge?: number;
  expires?: Date;
}

export function parseSetCookieHeader(raw: string): ParsedSetCookie | null {
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

export function splitSetCookieString(raw: string): string[] {
  // Headers.get('set-cookie') joins multiple Set-Cookie values with ", ".
  // Expires= attribute values also contain commas ("Wed, 15 Jun 2026 12:00:00 GMT"),
  // so we only split on ", " that is immediately followed by a cookie-name= token
  // (one or more non-whitespace/non-special chars then "=").
  return raw.split(/,\s+(?=[^\s=;,]+=)/);
}

/** Picks the session cookie out of a `Set-Cookie` header, however it arrived. */
export function readSessionSetCookie(
  setCookieHeader: string | string[] | undefined,
): ParsedSetCookie | null {
  if (!setCookieHeader) return null;

  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : splitSetCookieString(setCookieHeader);
  const sessionHeader = headers.find((h) =>
    h.toLowerCase().startsWith(`${SESSION_COOKIE_NAME.toLowerCase()}=`),
  );
  if (!sessionHeader) return null;

  return parseSetCookieHeader(sessionHeader);
}
