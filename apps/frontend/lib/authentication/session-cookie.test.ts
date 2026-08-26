import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGet, mockSet, mockDelete, mockCookies } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockDelete = vi.fn();
  const mockCookies = vi.fn().mockResolvedValue({ get: mockGet, set: mockSet, delete: mockDelete });
  return { mockGet, mockSet, mockDelete, mockCookies };
});

vi.mock('server-only', () => ({}));
vi.mock('./session-constants', () => ({ SESSION_COOKIE_NAME: 'llstack_session' }));
vi.mock('next/headers', () => ({ cookies: mockCookies }));

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  getSession,
  setSessionCookieFromUpstream,
} from './session-cookie';

describe('session-cookie', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockClear();
    mockDelete.mockClear();
    mockCookies.mockResolvedValue({ get: mockGet, set: mockSet, delete: mockDelete });
  });

  describe('getSession', () => {
    it('returns null when the session cookie is absent', async () => {
      mockGet.mockReturnValue(undefined);

      const result = await getSession();

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    });

    it('returns null when the session cookie value is empty', async () => {
      mockGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: '' });

      const result = await getSession();

      expect(result).toBeNull();
    });

    it('returns the raw session cookie value without validating it', async () => {
      mockGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: 'valid-token' });

      const result = await getSession();

      expect(result).toBe('valid-token');
    });
  });

  describe('setSessionCookieFromUpstream', () => {
    it('parses a full Set-Cookie header and writes the same flags', async () => {
      const header = 'llstack_session=abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';
      await setSessionCookieFromUpstream(header);

      expect(mockSet).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'abc123', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 604800,
        expires: undefined,
      });
    });

    it('is a no-op when the header is undefined', async () => {
      await setSessionCookieFromUpstream(undefined);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('is a no-op when the array contains no llstack_session entry', async () => {
      await setSessionCookieFromUpstream(['other_cookie=xyz; Path=/']);
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('handles an array and picks the llstack_session cookie', async () => {
      const headers = [
        'other_cookie=xyz; Path=/',
        'llstack_session=tok456; Path=/; HttpOnly; SameSite=Lax',
      ];
      await setSessionCookieFromUpstream(headers);
      expect(mockSet).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'tok456',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
      );
    });

    it('handles a comma-joined string (Headers.get result) when llstack_session is not first', async () => {
      // Headers.get('set-cookie') joins multiple Set-Cookie values with ", "
      const joined =
        'other_cookie=xyz; Path=/, llstack_session=tok789; Path=/; HttpOnly; SameSite=Lax';
      await setSessionCookieFromUpstream(joined);
      expect(mockSet).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'tok789',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
      );
    });

    it('parses an Expires= attribute whose value contains a comma', async () => {
      const header =
        'llstack_session=expTok; Path=/; HttpOnly; Expires=Thu, 01 Jan 2026 00:00:00 GMT';
      await setSessionCookieFromUpstream(header);
      expect(mockSet).toHaveBeenCalledOnce();
      expect(mockSet).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'expTok', {
        httpOnly: true,
        secure: false,
        sameSite: undefined,
        path: '/',
        maxAge: undefined,
        expires: new Date('Thu, 01 Jan 2026 00:00:00 GMT'),
      });
    });
  });

  describe('clearSessionCookie', () => {
    it('deletes the session cookie with path /', async () => {
      await clearSessionCookie();
      expect(mockDelete).toHaveBeenCalledOnce();
      expect(mockDelete).toHaveBeenCalledWith({ name: SESSION_COOKIE_NAME, path: '/' });
    });
  });
});
