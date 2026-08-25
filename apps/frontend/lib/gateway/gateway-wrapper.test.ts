import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetSession, mockTrace, mockDebug, mockFatal, mockError, mockWarn, mockInfo } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockTrace: vi.fn(),
    mockDebug: vi.fn(),
    mockFatal: vi.fn(),
    mockError: vi.fn(),
    mockWarn: vi.fn(),
    mockInfo: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('../authentication/session-cookie', () => ({ getSession: mockGetSession }));
vi.mock('../authentication/session-constants', () => ({ SESSION_COOKIE_NAME: 'llstack_session' }));
vi.mock('../logging/server-logger', () => ({
  serverLogger: {
    trace: mockTrace,
    debug: mockDebug,
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
    fatal: mockFatal,
  },
}));

import { gatewayWrapper, buildSessionCookieHeader } from './gateway-wrapper';

const okRaw = (data: unknown) => ({
  data,
  error: undefined,
  response: new Response(null, { status: 200 }),
});

const errRaw = (status: number, error: unknown) => ({
  data: undefined,
  error,
  response: new Response(null, { status }),
});

describe('gatewayWrapper', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockTrace.mockClear();
    mockDebug.mockClear();
    mockFatal.mockClear();
    mockError.mockClear();
    mockWarn.mockClear();
    mockInfo.mockClear();
  });

  // --- Header behaviour ---

  it('passes the session cookie header to the call when a session exists', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(call).toHaveBeenCalledWith({ Cookie: 'llstack_session=valid-token' });
  });

  it('passes undefined headers to the call when no session exists', async () => {
    mockGetSession.mockResolvedValue(null);
    const call = vi.fn().mockResolvedValue(errRaw(401, { message: 'Unauthorized' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(call).toHaveBeenCalledWith(undefined);
  });

  it('skips auth and does not read the session when withAuth is false', async () => {
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource', { withAuth: false });

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(undefined);
  });

  // --- Result normalisation ---

  it('returns the normalised ok result', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ name: 'Louis' }));

    const result = await gatewayWrapper(call, '[test] fetch resource');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'Louis' });
  });

  it('returns the normalised error result', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(500, { message: 'Internal Server Error' }));

    const result = await gatewayWrapper(call, '[test] fetch resource');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });

  // --- Logging: 2XX → info ---

  it('logs info on a successful response and does not log error/warn/fatal', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ name: 'Louis' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockInfo).toHaveBeenCalledWith(
      'gateway.response.successful',
      expect.objectContaining({ operation: '[test] fetch resource', status: 200 }),
    );
    expect(mockFatal).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('includes hasData:true in the success log when data is present', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ name: 'Louis' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockInfo).toHaveBeenCalledWith(
      'gateway.response.successful',
      expect.objectContaining({ hasData: true }),
    );
  });

  it('includes hasData:false in the success log when data is absent', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw(null));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockInfo).toHaveBeenCalledWith(
      'gateway.response.successful',
      expect.objectContaining({ hasData: false }),
    );
  });

  // --- Logging: 5XX → fatal ---

  it('logs fatal for 5XX errors and does not log error/warn', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(500, { message: 'Internal Server Error' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockFatal).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ operation: '[test] fetch resource', status: 500 }),
    );
    expect(mockError).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  // --- Logging: 429 → error ---

  it('logs error for 429 responses and does not log fatal/warn', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(429, { message: 'Too Many Requests' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockError).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ operation: '[test] fetch resource', status: 429 }),
    );
    expect(mockFatal).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  // --- Logging: 400 → error ---

  it('logs error for 400 responses and does not log fatal/warn', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(400, { message: 'Bad Request' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockError).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ operation: '[test] fetch resource', status: 400 }),
    );
    expect(mockFatal).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  // --- Logging: other 4XX → warn ---

  it('logs warn for other 4XX errors (e.g. 401) and does not log fatal/error', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(401, { message: 'Unauthorized' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockWarn).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ operation: '[test] fetch resource', status: 401 }),
    );
    expect(mockFatal).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  it('logs warn for 403 and does not log fatal/error', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(403, { message: 'Forbidden' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockWarn).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ status: 403 }),
    );
    expect(mockFatal).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });

  // --- Logging: only sanitised error fields on failure (never the raw payload) ---

  it('logs a sanitised error code/message and never the raw error payload', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    // Raw backend errors can carry PII (e.g. a submitted email); only code/message
    // should reach the log.
    const error = { message: 'something went wrong', code: 'ERR_001', email: 'leak@example.com' };
    const call = vi.fn().mockResolvedValue(errRaw(500, error));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockFatal).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ errorCode: 'ERR_001', errorMessage: 'something went wrong' }),
    );
    const loggedBody = mockFatal.mock.calls[0]![1];
    expect(loggedBody).not.toHaveProperty('error');
    expect(JSON.stringify(loggedBody)).not.toContain('leak@example.com');
  });

  // --- Logging: traceId propagated ---

  it('includes the backend traceId in the failure log when the response carries it', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue({
      data: undefined,
      error: { message: 'boom' },
      response: new Response(null, { status: 500, headers: { 'x-trace-id': 'trace-abc_1' } }),
    });

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockFatal).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ traceId: 'trace-abc_1' }),
    );
  });

  it('includes the backend traceId in the success log when the response carries it', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue({
      data: { id: 1 },
      error: undefined,
      response: new Response(null, { status: 200, headers: { 'x-trace-id': 'trace-ok_1' } }),
    });

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockInfo).toHaveBeenCalledWith(
      'gateway.response.successful',
      expect.objectContaining({ traceId: 'trace-ok_1' }),
    );
  });

  // --- Logging: debug request-started breadcrumb (dev + staging) ---

  it('logs a debug request-started breadcrumb with auth booleans and no token', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockDebug).toHaveBeenCalledWith(
      'gateway.request.started',
      expect.objectContaining({
        operation: '[test] fetch resource',
        withAuth: true,
        hasSession: true,
      }),
    );
    // The breadcrumb carries booleans only — never the raw session token.
    expect(JSON.stringify(mockDebug.mock.calls[0]![1])).not.toContain('valid-token');
  });

  it('omits hasSession from the debug breadcrumb when withAuth is false', async () => {
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource', { withAuth: false });

    expect(mockDebug).toHaveBeenCalledWith(
      'gateway.request.started',
      expect.objectContaining({ operation: '[test] fetch resource', withAuth: false }),
    );
    expect(mockDebug.mock.calls[0]![1]).not.toHaveProperty('hasSession');
  });

  // --- Logging: trace dispatch line logs header names, never values ---

  it('logs a trace dispatch line with header names including Cookie, never the token', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockTrace).toHaveBeenCalledWith(
      'gateway.call.dispatched',
      expect.objectContaining({ operation: '[test] fetch resource' }),
    );
    const body = mockTrace.mock.calls.find((c) => c[0] === 'gateway.call.dispatched')![1] as {
      headerNames: string[];
    };
    expect(body.headerNames).toContain('Cookie');
    expect(JSON.stringify(body)).not.toContain('valid-token');
  });

  // --- Logging: trace call-completed result summary, never the raw body ---

  it('logs a trace call-completed line with a safe result summary on success', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ secret: 'leak-me' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockTrace).toHaveBeenCalledWith(
      'gateway.call.completed',
      expect.objectContaining({
        operation: '[test] fetch resource',
        ok: true,
        status: 200,
        hasData: true,
        durationMs: expect.any(Number),
      }),
    );
    // The result trace summarises the outcome — it never carries the raw body.
    const completed = mockTrace.mock.calls.find((c) => c[0] === 'gateway.call.completed')![1];
    expect(JSON.stringify(completed)).not.toContain('leak-me');
  });

  it('logs a trace call-completed line with ok:false on failure', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(500, { message: 'boom' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockTrace).toHaveBeenCalledWith(
      'gateway.call.completed',
      expect.objectContaining({ ok: false, status: 500, hasData: false }),
    );
  });

  // --- Logging: durationMs on every outcome ---

  it('includes a numeric durationMs in the success log', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(okRaw({ id: 1 }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockInfo).toHaveBeenCalledWith(
      'gateway.response.successful',
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
  });

  it('includes a numeric durationMs in the failure log', async () => {
    mockGetSession.mockResolvedValue('valid-token');
    const call = vi.fn().mockResolvedValue(errRaw(500, { message: 'boom' }));

    await gatewayWrapper(call, '[test] fetch resource');

    expect(mockFatal).toHaveBeenCalledWith(
      'gateway.request.failed',
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
  });
});

describe('buildSessionCookieHeader', () => {
  it('builds a Cookie header from the session token', () => {
    expect(buildSessionCookieHeader('abc123')).toEqual({ Cookie: 'llstack_session=abc123' });
  });
});
