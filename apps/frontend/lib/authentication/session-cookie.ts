import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './session-constants';
import { readSessionSetCookie } from './set-cookie';

export { SESSION_COOKIE_NAME } from './session-constants';

export async function setSessionCookieFromUpstream(
  setCookieHeader: string | string[] | undefined,
): Promise<void> {
  const parsed = readSessionSetCookie(setCookieHeader);
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
