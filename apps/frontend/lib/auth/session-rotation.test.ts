// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { rotateSession } = vi.hoisted(() => ({ rotateSession: vi.fn() }));
vi.mock('../gateway/auth', () => ({ rotateSession }));
vi.mock('../logging/server-logger', () => ({
  serverLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { requestSessionRotation } from './session-rotation';

const SESSION = 'some-session-token';
const ROTATED_COOKIE =
  'llstack_session=a-rotated-token; Max-Age=604793; Path=/; HttpOnly; SameSite=Lax';

const upstream = (setCookie?: string) => ({
  headers: new Headers(setCookie === undefined ? {} : { 'set-cookie': setCookie }),
});

beforeEach(() => {
  rotateSession.mockReset();
});

describe('requestSessionRotation', () => {
  it('returns the parsed cookie and the next deadline on a rotation', async () => {
    rotateSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'rotated', nextRotationInSeconds: 3600 },
      response: upstream(ROTATED_COOKIE),
    });

    const outcome = await requestSessionRotation(SESSION);

    expect(outcome).toEqual({
      status: 'rotated',
      cookie: expect.objectContaining({ name: 'llstack_session', value: 'a-rotated-token' }),
      rotateInSeconds: 3600,
    });
  });

  it('passes the backend’s deadline through on not_due', async () => {
    rotateSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'not_due', nextRotationInSeconds: 1800 },
      response: upstream(),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({
      status: 'not_due',
      rotateInSeconds: 1800,
    });
  });

  it('carries no deadline on superseded, because the caller must write nothing', async () => {
    rotateSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'superseded', nextRotationInSeconds: 3600 },
      response: upstream(),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'superseded' });
  });

  // 401 + SESSION_INVALID is the backend refusing the session — expired,
  // revoked, or a retired token presented late enough to have just revoked its
  // whole family.
  it('reports a 401 carrying SESSION_INVALID as signed out', async () => {
    rotateSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: { statusCode: 401, error: 'SESSION_INVALID', message: 'session invalid' },
      response: upstream(),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'signed_out' });
  });

  // This route's 401 is overloaded: the global ApiSecretGuard answers it too,
  // under the generic `Unauthorized` code (pinned by the backend's
  // auth.integration.spec.ts). A BACKEND_API_SECRET that is present but wrong —
  // a half-finished secret rotation, one replica on a stale env — would
  // otherwise 401 every rotation call and march the whole signed-in user base
  // through /logout, revoking each session on the way out.
  it.each([
    ['Unauthorized', 'the global ApiSecretGuard refusing the request'],
    ['ForbiddenException', 'anything else that answers 401 without a session verdict'],
  ])('keeps the session alive on a 401 carrying %s', async (code) => {
    rotateSession.mockResolvedValue({
      ok: false,
      status: 401,
      error: { statusCode: 401, error: code, message: 'Unauthorized' },
      response: upstream(),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  it('keeps the session alive on a 401 with no error body at all', async () => {
    rotateSession.mockResolvedValue({ ok: false, status: 401, response: upstream() });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  // Everything below is the fail-open half: a rotation that could not happen is
  // a missed improvement, while one that signs people out on a blip is worse
  // than never having rotated at all.
  it.each([500, 429, 404, undefined])('keeps the session alive on status %s', async (status) => {
    rotateSession.mockResolvedValue({ ok: false, status, response: upstream() });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  it('keeps the session alive when the call throws', async () => {
    rotateSession.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  it('keeps the session alive when the response carries no body', async () => {
    rotateSession.mockResolvedValue({ ok: true, status: 200, response: upstream() });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  it('keeps the session alive when a rotation arrives with no Set-Cookie', async () => {
    // The backend has retired the old token and this app cannot store the new
    // one. Signing out here would turn a bug into a sign-out; the grace window
    // covers the gap instead.
    rotateSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'rotated', nextRotationInSeconds: 3600 },
      response: upstream(),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });

  it('ignores a Set-Cookie that is not the session cookie', async () => {
    rotateSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'rotated', nextRotationInSeconds: 3600 },
      response: upstream('some_other_cookie=value; Path=/'),
    });

    expect(await requestSessionRotation(SESSION)).toEqual({ status: 'unavailable' });
  });
});
