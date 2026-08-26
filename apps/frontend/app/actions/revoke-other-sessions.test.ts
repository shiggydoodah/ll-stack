// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockRevokeAllSessions, mockRefresh, mockGetSession, mockValidateSession, mockRedirect } =
  vi.hoisted(() => ({
    mockRevokeAllSessions: vi.fn(),
    mockRefresh: vi.fn(),
    mockGetSession: vi.fn(),
    mockValidateSession: vi.fn(),
    mockRedirect: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ refresh: mockRefresh }));
vi.mock('next/navigation', () => ({ redirect: mockRedirect, unstable_rethrow: vi.fn() }));
vi.mock('@/lib/gateway/auth', () => ({ revokeAllSessions: mockRevokeAllSessions }));
vi.mock('@/lib/authentication/session-cookie', () => ({
  getSession: mockGetSession,
  clearSessionCookie: vi.fn(),
}));
vi.mock('@/lib/authentication/get-server-session', () => ({
  validateSession: mockValidateSession,
}));
vi.mock('@/lib/actions/with-request-context', () => ({
  withRequestContext: <T>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
}));
vi.mock('@/lib/logging/server-logger', () => ({
  serverLogger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { ERROR_MESSAGES } from '@/lib/constants';
import { revokeOtherSessionsAction } from './revoke-other-sessions';

/** A gateway result in the `ServiceResult` shape `gatewayWrapper` produces. */
const gatewayOk = (revokedSessions: number) => ({
  ok: true,
  status: 200,
  message: 'OK',
  data: { revokedSessions },
  response: new Response(null, { status: 200 }),
});

const gatewayFailed = (status: number) => ({
  ok: false,
  status,
  message: `HTTP ${status}`,
  error: undefined,
  response: new Response(null, { status }),
});

describe('revokeOtherSessionsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue('a-session-token');
  });

  it('always asks the gateway to keep the current session', async () => {
    // The invariant the action exists to hold: `keepCurrent` is hard-coded true,
    // because a false here signs the member out of the page they are standing on.
    mockRevokeAllSessions.mockResolvedValue(gatewayOk(3));

    const result = await revokeOtherSessionsAction();

    expect(mockRevokeAllSessions).toHaveBeenCalledTimes(1);
    expect(mockRevokeAllSessions).toHaveBeenCalledWith(true);
    expect(result).toEqual({ ok: true, revokedSessions: 3 });
  });

  it('refreshes the client router after a successful revoke', async () => {
    // The sessions list on screen has just gone stale, and the read behind it is
    // uncached — the client router is what holds the old rows.
    mockRevokeAllSessions.mockResolvedValue(gatewayOk(1));

    await revokeOtherSessionsAction();

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('maps a 429 to the too-many-attempts message and leaves the router alone', async () => {
    mockRevokeAllSessions.mockResolvedValue(gatewayFailed(429));

    const result = await revokeOtherSessionsAction();

    expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.TOO_MANY_ATTEMPTS_MESSAGE });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('maps any other failure to the generic message', async () => {
    mockRevokeAllSessions.mockResolvedValue(gatewayFailed(500));

    const result = await revokeOtherSessionsAction();

    expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.GENERIC_ERROR_MESSAGE });
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('treats a response-less network failure as the generic error, not a throw', async () => {
    // `gatewayWrapper` reports "no response received" as ok: false with an
    // undefined response and a synthesised 503 status. The action branches on
    // that normalised status, so a call that never reached the backend takes the
    // generic message like any other failure.
    mockRevokeAllSessions.mockResolvedValue({
      ok: false,
      status: 503,
      message: 'Network error — no response received',
      error: undefined,
      response: undefined,
    });

    const result = await revokeOtherSessionsAction();

    expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.GENERIC_ERROR_MESSAGE });
  });
});
