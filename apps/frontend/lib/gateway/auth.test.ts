// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest';

const {
  mockRotateSessionGenerated,
  mockListSessionsGenerated,
  mockRevokeAllSessionsGenerated,
  mockGetSession,
} = vi.hoisted(() => ({
  mockRotateSessionGenerated: vi.fn(),
  mockListSessionsGenerated: vi.fn(),
  mockRevokeAllSessionsGenerated: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@repo/services/auth', () => ({
  listSessions: mockListSessionsGenerated,
  loginUser: vi.fn(),
  logoutSession: vi.fn(),
  registerUser: vi.fn(),
  revokeAllSessions: mockRevokeAllSessionsGenerated,
  rotateSession: mockRotateSessionGenerated,
}));
vi.mock('../authentication/session-cookie', () => ({ getSession: mockGetSession }));
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

import { ROTATE_SESSION_TIMEOUT_MS, listSessions, revokeAllSessions, rotateSession } from './auth';

const SESSION = 'a-session-token';

/** What the generated client returns for a call that reached the backend. */
const answered = () => ({
  data: { status: 'not_due', nextRotationInSeconds: 1800 },
  error: undefined,
  response: new Response(null, { status: 200 }),
});

/** The options object the gateway handed the generated client. */
const optionsPassed = (): { headers: Record<string, string>; signal: AbortSignal } => {
  const [call] = mockRotateSessionGenerated.mock.calls;
  if (call === undefined) throw new Error('the generated client was never called');
  return call[0] as { headers: Record<string, string>; signal: AbortSignal };
};

describe('rotateSession', () => {
  beforeEach(() => {
    mockRotateSessionGenerated.mockReset();
    mockGetSession.mockReset();
  });

  it('attaches the session cookie and never reads the jar for one', async () => {
    // Middleware has no `next/headers`, so the token arrives as an argument and
    // `withAuth: false` keeps the wrapper from reaching for a jar it cannot read.
    mockRotateSessionGenerated.mockResolvedValue(answered());

    await rotateSession(SESSION);

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(optionsPassed().headers).toMatchObject({ Cookie: `llstack_session=${SESSION}` });
  });

  it('carries an abort signal, because this call runs ahead of the render', async () => {
    mockRotateSessionGenerated.mockResolvedValue(answered());

    await rotateSession(SESSION);

    const { signal } = optionsPassed();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('gives up on a backend that accepts the connection and never answers', async () => {
    // The failure the budget exists for. Uncancelled, this promise never
    // settles, and a member navigation past its rotation deadline hangs inside
    // middleware ahead of any render — the one outcome `session-rotation.ts`
    // promises its fail-open handling rules out.
    mockRotateSessionGenerated.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(signal.reason);
          });
        }),
    );

    const settled: unknown = await rotateSession(SESSION).catch((error: unknown) => error);

    // A real fetch turns this into a response-less result the wrapper reports as
    // a 503; the mocked client rejects instead, so what is asserted here is that
    // the call ends at all.
    expect((settled as Error).name).toBe('TimeoutError');
  }, 10_000);

  it('waits long enough for a healthy rotation and not much longer', () => {
    expect(ROTATE_SESSION_TIMEOUT_MS).toBe(2_000);
  });
});

describe('listSessions', () => {
  beforeEach(() => {
    mockListSessionsGenerated.mockReset();
    mockGetSession.mockReset();
    mockListSessionsGenerated.mockResolvedValue({
      data: { sessions: [], truncated: false },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
  });

  it('reads the jar and attaches the session cookie', async () => {
    mockGetSession.mockResolvedValue(SESSION);

    const result = await listSessions();

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    const [call] = mockListSessionsGenerated.mock.calls;
    expect(call?.[0]).toMatchObject({
      headers: { Cookie: `llstack_session=${SESSION}` },
    });
    expect(result.ok).toBe(true);
  });
});

describe('revokeAllSessions', () => {
  beforeEach(() => {
    mockRevokeAllSessionsGenerated.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue(SESSION);
    mockRevokeAllSessionsGenerated.mockResolvedValue({
      data: { revokedSessions: 2 },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
  });

  it('puts the keepCurrent it was given in the body, alongside the session cookie', async () => {
    // Explicit at every call site because the backend defaults it to false — a
    // wrapper that dropped or flipped the argument would sign the caller out too.
    await revokeAllSessions(true);

    const [call] = mockRevokeAllSessionsGenerated.mock.calls;
    expect(call?.[0]).toMatchObject({
      body: { keepCurrent: true },
      headers: { Cookie: `llstack_session=${SESSION}` },
    });
  });

  it('passes keepCurrent false through untouched', async () => {
    await revokeAllSessions(false);

    const [call] = mockRevokeAllSessionsGenerated.mock.calls;
    expect(call?.[0]).toMatchObject({ body: { keepCurrent: false } });
  });
});
