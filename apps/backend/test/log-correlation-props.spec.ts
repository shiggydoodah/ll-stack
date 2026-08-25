import type { IncomingMessage } from 'http';

import { trace } from '@opentelemetry/api';

import {
  buildLogCorrelationProps,
  resolveAccessLogLevel,
  resolveInboundRequestId,
} from '../src/common/logging/logger.config';

type FakeRequest = Parameters<typeof buildLogCorrelationProps>[0];

function makeRequest(headers: Record<string, string>, id = 'req-abc'): FakeRequest {
  return { id, headers } as unknown as IncomingMessage as FakeRequest;
}

function makeFreshRequest(headers: Record<string, string>): FakeRequest {
  // No id yet — mirrors genReqId time, before RequestIdMiddleware runs.
  return { headers } as unknown as IncomingMessage as FakeRequest;
}

describe('resolveAccessLogLevel', () => {
  it('maps status (and transport errors) to a level matching the event taxonomy', () => {
    expect(resolveAccessLogLevel(200, false)).toBe('info');
    expect(resolveAccessLogLevel(302, false)).toBe('info');
    expect(resolveAccessLogLevel(400, false)).toBe('warn'); // matches http.request.warn event
    expect(resolveAccessLogLevel(404, false)).toBe('warn');
    expect(resolveAccessLogLevel(500, false)).toBe('error');
    expect(resolveAccessLogLevel(200, true)).toBe('error'); // transport error
  });
});

describe('resolveInboundRequestId', () => {
  it('echoes a validated inbound x-request-id (so manual logs match the access log)', () => {
    expect(resolveInboundRequestId(makeFreshRequest({ 'x-request-id': 'fa41c326_ok' }))).toBe(
      'fa41c326_ok',
    );
  });

  it('generates a fresh UUID when x-request-id is absent or malformed', () => {
    const generated = resolveInboundRequestId(makeFreshRequest({}));
    expect(generated).toMatch(/^[A-Za-z0-9._-]{1,128}$/);

    const malformed = `${'a'.repeat(200)} bad\tchars`;
    const fallback = resolveInboundRequestId(makeFreshRequest({ 'x-request-id': malformed }));
    expect(fallback).not.toBe(malformed);
    expect(fallback).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });
});

describe('buildLogCorrelationProps', () => {
  it('emits requestId, correlationId, and (null) trace ids with no active span', () => {
    const props = buildLogCorrelationProps(makeRequest({}));

    expect(props.requestId).toBe('req-abc');
    expect(props.correlationId).toBe('req-abc'); // falls back to requestId
    expect(props.traceId).toBeNull();
    expect(props.spanId).toBeNull();
    expect(props.sessionId).toBeUndefined();
  });

  it('emits real traceId and spanId when an active OTel span is in context', () => {
    const fakeTraceId = 'abcdef1234567890abcdef1234567890';
    const fakeSpanId = 'abcdef1234567890';
    const fakeSpan = {
      spanContext: () => ({ traceId: fakeTraceId, spanId: fakeSpanId }),
    };
    const getActiveSpan = jest
      .spyOn(trace, 'getActiveSpan')
      .mockReturnValue(fakeSpan as ReturnType<typeof trace.getActiveSpan>);

    try {
      const props = buildLogCorrelationProps(makeRequest({}));

      expect(props.traceId).toBe(fakeTraceId);
      expect(props.spanId).toBe(fakeSpanId);
      expect(props.requestId).toBe('req-abc');
    } finally {
      getActiveSpan.mockRestore();
    }
  });

  it('accepts a well-formed x-correlation-id and logs it as correlationId', () => {
    const props = buildLogCorrelationProps(makeRequest({ 'x-correlation-id': 'corr_123.AB-xy' }));

    expect(props.correlationId).toBe('corr_123.AB-xy');
    expect(props.requestId).toBe('req-abc');
  });

  it('discards a malformed x-correlation-id and falls back to requestId', () => {
    const malformed = `${'a'.repeat(200)} bad\tchars`;
    const props = buildLogCorrelationProps(makeRequest({ 'x-correlation-id': malformed }));

    expect(props.correlationId).toBe('req-abc');
    // The raw rejected value is never surfaced.
    expect(props.correlationId).not.toContain('bad');
  });

  it('still emits a per-visit sessionId from a valid x-session-id', () => {
    const props = buildLogCorrelationProps(
      makeRequest({ 'x-session-id': 'sess_1', 'x-correlation-id': 'corr_1' }),
    );

    expect(props.sessionId).toBe('sess_1');
    expect(props.correlationId).toBe('corr_1');
  });
});
