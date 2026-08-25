import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWriteServerLogRecord } = vi.hoisted(() => ({
  mockWriteServerLogRecord: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('./log-emitter', () => ({ writeServerLogRecord: mockWriteServerLogRecord }));

import { ExpectedError } from '../errors/expected-error';
import { buildRequestErrorRecord, logRequestError } from './request-error';

type OnRequestErrorArgs = Parameters<typeof buildRequestErrorRecord>;

const request = (headers: Record<string, string | string[]> = {}): OnRequestErrorArgs[1] => ({
  path: '/home',
  method: 'GET',
  headers,
});

const context = (overrides: Partial<OnRequestErrorArgs[2]> = {}): OnRequestErrorArgs[2] => ({
  routerKind: 'App Router',
  routePath: '/home',
  routeType: 'render',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
  ...overrides,
});

beforeEach(() => {
  mockWriteServerLogRecord.mockReset();
});

describe('buildRequestErrorRecord', () => {
  it('builds a sanitized record with route context and no stack or message keys', () => {
    const error = new Error('lookup failed for alice@example.com');
    const record = buildRequestErrorRecord(error, request(), context());

    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      level: 50,
      message: 'server.error.unhandled',
      event: 'server.error.unhandled',
      source: 'frontend-server',
      errorName: 'Error',
      path: '/home',
      method: 'GET',
      routerKind: 'App Router',
      routePath: '/home',
      routeType: 'render',
      renderSource: 'react-server-components',
    });
    // The raw message can embed PII/secrets the shared redaction cannot catch —
    // it must never reach the record.
    expect(record).not.toHaveProperty('errorMessage');
    expect(record).not.toHaveProperty('stack');
    expect(record).not.toHaveProperty('revalidateReason');
    expect(record).not.toHaveProperty('expected');
  });

  it('strips the query string from the request path', () => {
    const record = buildRequestErrorRecord(
      new Error('boom'),
      { ...request(), path: '/search?q=secret%40email.com' },
      context(),
    );
    expect(record?.path).toBe('/search');
  });

  // A token-addressed page puts a BEARER CREDENTIAL in a route segment, and a
  // failed read there throws straight into this hook. Anyone with log access
  // could replay a leaked token, so the masking below is a security boundary,
  // not tidiness (LONG_TOKEN_PATH_SEGMENT_PATTERN in @repo/logging).
  describe('masks credential-bearing route segments', () => {
    const token = `ses_test_${'a1B2c3D4e5'.repeat(4)}xyz`;

    it('holds the shape the mask depends on', () => {
      expect(token).toMatch(/^ses_(?:test|live)_[0-9A-Za-z]{43}$/);
    });

    it.each([
      ['the token page', `/session/${token}`, '/session/{id}'],
      ['a token sub-page', `/session/${token}/result`, '/session/{id}/result'],
    ])('masks the token on %s', (_label, path, expected) => {
      const record = buildRequestErrorRecord(new Error('boom'), { ...request(), path }, context());

      expect(record?.path).toBe(expected);
      expect(JSON.stringify(record)).not.toContain(token);
    });

    it('masks the token when it arrives alongside a query string', () => {
      const record = buildRequestErrorRecord(
        new Error('boom'),
        { ...request(), path: `/session/${token}/result?from=elsewhere` },
        context(),
      );

      expect(record?.path).toBe('/session/{id}/result');
    });

    it('leaves ordinary static route segments untouched', () => {
      const record = buildRequestErrorRecord(
        new Error('boom'),
        { ...request(), path: '/dashboard/settings' },
        context(),
      );

      expect(record?.path).toBe('/dashboard/settings');
    });
  });

  it('flags an ExpectedError digest with expected: true', () => {
    const record = buildRequestErrorRecord(
      new ExpectedError('PAGE_DATA_UNAVAILABLE'),
      request(),
      context(),
    );
    expect(record).toMatchObject({
      digest: 'expected:PAGE_DATA_UNAVAILABLE',
      expected: true,
      errorName: 'ExpectedError',
    });
  });

  it('returns null for Next control-flow signals so nothing is emitted', () => {
    for (const digest of [
      'NEXT_REDIRECT;replace;/login;307;',
      'NEXT_NOT_FOUND',
      'NEXT_HTTP_ERROR_FALLBACK;404',
    ]) {
      const signal = new Error(digest) as Error & { digest?: string };
      signal.digest = digest;
      expect(buildRequestErrorRecord(signal, request(), context())).toBeNull();
    }
  });

  it('carries a valid correlation header as requestId + correlationId and a session header as sessionId', () => {
    const record = buildRequestErrorRecord(
      new Error('boom'),
      request({ 'x-correlation-id': 'corr-1_2.3', 'x-session-id': 'sid-9' }),
      context(),
    );
    expect(record).toMatchObject({
      requestId: 'corr-1_2.3',
      correlationId: 'corr-1_2.3',
      sessionId: 'sid-9',
    });
  });

  it('omits correlation keys when the header is absent or malformed', () => {
    const absent = buildRequestErrorRecord(new Error('boom'), request(), context());
    expect(absent).not.toHaveProperty('correlationId');
    expect(absent).not.toHaveProperty('requestId');
    expect(absent).not.toHaveProperty('sessionId');

    const malformed = buildRequestErrorRecord(
      new Error('boom'),
      request({ 'x-correlation-id': 'bad value with spaces!' }),
      context(),
    );
    expect(malformed).not.toHaveProperty('correlationId');
  });

  it('takes the first value of a multi-value header', () => {
    const record = buildRequestErrorRecord(
      new Error('boom'),
      request({ 'x-correlation-id': ['first-id', 'second-id'] }),
      context(),
    );
    expect(record?.correlationId).toBe('first-id');
  });

  it('sanitizes non-Error throwables to a digest-only record — never their message', () => {
    const record = buildRequestErrorRecord(
      { message: 'token abc123 was rejected', digest: 'deadbeef' },
      request(),
      context(),
    );
    expect(record).toMatchObject({ digest: 'deadbeef' });
    expect(record).not.toHaveProperty('errorName');
    expect(record).not.toHaveProperty('errorMessage');
  });
});

describe('logRequestError', () => {
  it('emits the built record through writeServerLogRecord', () => {
    logRequestError(new Error('boom'), request(), context());
    expect(mockWriteServerLogRecord).toHaveBeenCalledTimes(1);
    expect(mockWriteServerLogRecord.mock.calls[0]![0]).toMatchObject({
      event: 'server.error.unhandled',
    });
  });

  it('emits nothing for control-flow signals', () => {
    const signal = new Error('redirect') as Error & { digest?: string };
    signal.digest = 'NEXT_REDIRECT;push;/home;307;';
    logRequestError(signal, request(), context());
    expect(mockWriteServerLogRecord).not.toHaveBeenCalled();
  });

  it('never throws, even when the emitter does', () => {
    mockWriteServerLogRecord.mockImplementation(() => {
      throw new Error('sink down');
    });
    expect(() => logRequestError(new Error('boom'), request(), context())).not.toThrow();
  });
});
