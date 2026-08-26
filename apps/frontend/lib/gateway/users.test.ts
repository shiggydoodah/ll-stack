// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetCurrentUserGenerated, mockGetSession } = vi.hoisted(() => ({
  mockGetCurrentUserGenerated: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@repo/services/users', () => ({ getCurrentUser: mockGetCurrentUserGenerated }));
vi.mock('../authentication/session-cookie', () => ({ getSession: mockGetSession }));
vi.mock('../cache/utils', () => ({ withSessionCache: <T>(fn: T) => fn }));
vi.mock('../logging/server-logger', () => ({
  serverLogger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { getCurrentUserForSession } from './users';

const ACCOUNT = { userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'MEMBER' };

/** What the generated client returns for each backend answer. */
const raw = (status: number, body: { data?: unknown; error?: unknown } = {}) => ({
  data: body.data,
  error: body.error,
  response: new Response(null, { status }),
});

describe('getCurrentUserForSession', () => {
  beforeEach(() => {
    mockGetCurrentUserGenerated.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue('a-session-token');
  });

  it('returns the account on a 200', async () => {
    mockGetCurrentUserGenerated.mockResolvedValue(raw(200, { data: { account: ACCOUNT } }));

    await expect(getCurrentUserForSession()).resolves.toEqual(ACCOUNT);
  });

  it('returns null without a call when the jar holds no session', async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getCurrentUserForSession()).resolves.toBeNull();
    expect(mockGetCurrentUserGenerated).not.toHaveBeenCalled();
  });

  it('returns null only for the backend refusing the session itself', async () => {
    // 401 + SESSION_INVALID is SessionGuard's answer for a dead cookie. Callers
    // turn null into /logout, so nothing weaker may produce it.
    mockGetCurrentUserGenerated.mockResolvedValue(
      raw(401, { error: { message: 'Session no longer valid', error: 'SESSION_INVALID' } }),
    );

    await expect(getCurrentUserForSession()).resolves.toBeNull();
  });

  it('throws on a bare 401, which is a wrong api secret, not a dead session', async () => {
    mockGetCurrentUserGenerated.mockResolvedValue(
      raw(401, { error: { message: 'Invalid API secret', error: 'Unauthorized' } }),
    );

    await expect(getCurrentUserForSession()).rejects.toThrow('unavailable');
  });

  it('throws on a 429 rather than reading throttling as a sign-out', async () => {
    mockGetCurrentUserGenerated.mockResolvedValue(raw(429, { error: { message: 'Too many' } }));

    await expect(getCurrentUserForSession()).rejects.toThrow('unavailable');
  });

  it('throws on a 5xx and on a response-less network failure', async () => {
    mockGetCurrentUserGenerated.mockResolvedValue(raw(503));
    await expect(getCurrentUserForSession()).rejects.toThrow('unavailable');

    mockGetCurrentUserGenerated.mockResolvedValue({
      data: undefined,
      error: new Error('fetch failed'),
      response: undefined,
    });
    await expect(getCurrentUserForSession()).rejects.toThrow('unavailable');
  });
});
