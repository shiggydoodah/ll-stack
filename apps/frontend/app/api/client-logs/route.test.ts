import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockWrite } = vi.hoisted(() => ({ mockWrite: vi.fn() }));
vi.mock('@/lib/logging/log-emitter', () => ({ writeServerLogRecord: mockWrite }));
// Resolve the `@/` alias the route uses to the real (pure) correlation module so
// the id-precedence logic stays under test.
vi.mock('@/lib/logging/correlation', async () => import('../../../lib/logging/correlation'));

import { POST } from './route';

const ENDPOINT = 'https://example.com/api/client-logs';

const postJson = (body: string, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(ENDPOINT, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('POST /api/client-logs', () => {
  beforeEach(() => {
    mockWrite.mockReset();
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(postJson('not json'));
    expect(res.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 when records is not an array', async () => {
    const res = await POST(postJson(JSON.stringify({ records: 'nope' })));
    expect(res.status).toBe(400);
  });

  it('returns 413 when the declared content-length is too large', async () => {
    const res = await POST(postJson('{}', { 'content-length': String(1024 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('returns 413 when the actual body exceeds the byte cap despite a spoofed content-length', async () => {
    // A small/spoofed content-length passes the up-front guard, so only the
    // post-text() byte-length re-check can reject this oversized body.
    const oversized = JSON.stringify({ records: [{ message: 'x'.repeat(64 * 1024 + 1) }] });
    const res = await POST(postJson(oversized, { 'content-length': '10' }));
    expect(res.status).toBe(413);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('emits each record and responds 204', async () => {
    const res = await POST(
      postJson(JSON.stringify({ records: [{ message: 'a' }, { message: 'b' }] })),
    );
    expect(res.status).toBe(204);
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it('forces server-authoritative fields and clamps the level', async () => {
    await POST(
      postJson(
        JSON.stringify({
          records: [{ message: 'x', level: 999, source: 'spoofed', ingestedAt: 'fake' }],
        }),
      ),
    );
    const record = mockWrite.mock.calls[0]![0];
    expect(record.source).toBe('frontend-client');
    expect(record.level).toBe(60);
    expect(typeof record.ingestedAt).toBe('string');
    expect(record.ingestedAt).not.toBe('fake');
  });

  it('re-runs redaction server-side on untrusted records', async () => {
    await POST(postJson(JSON.stringify({ records: [{ message: 'x', password: 'hunter2' }] })));
    const record = mockWrite.mock.calls[0]![0];
    expect(record.password).toBe('[REDACTED]');
  });

  it('prefers a valid per-record correlationId, else the request header', async () => {
    await POST(
      postJson(
        JSON.stringify({
          records: [{ message: 'a', correlationId: 'rec-corr_1' }, { message: 'b' }],
        }),
        { 'x-correlation-id': 'hdr-corr_2' },
      ),
    );
    const [first, second] = mockWrite.mock.calls.map((call) => call[0]);
    expect(first.correlationId).toBe('rec-corr_1');
    expect(first.requestId).toBe('rec-corr_1');
    expect(second.correlationId).toBe('hdr-corr_2');
  });

  it('caps the number of records processed per request', async () => {
    const records = Array.from({ length: 250 }, (_, index) => ({ message: String(index) }));
    await POST(postJson(JSON.stringify({ records })));
    expect(mockWrite).toHaveBeenCalledTimes(100);
  });
});
