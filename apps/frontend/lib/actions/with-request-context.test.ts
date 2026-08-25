import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockHeaders, mockRun } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockRun: vi.fn((_ctx: { correlationId: string }, fn: () => unknown) => fn()),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mockHeaders }));
vi.mock('../logging/request-context', () => ({ runWithRequestContext: mockRun }));

import { withRequestContext } from './with-request-context';

const headersWith = (value: string | null) => ({
  get: (name: string) => (name === 'x-correlation-id' ? value : null),
});

const contextCorrelationId = (): string => mockRun.mock.calls[0]![0].correlationId;

describe('withRequestContext', () => {
  beforeEach(() => {
    mockHeaders.mockReset();
    mockRun.mockClear();
  });

  it('uses the inbound x-correlation-id header set by proxy.ts', async () => {
    mockHeaders.mockResolvedValue(headersWith('proxy-id_2'));

    await withRequestContext(() => 'ok');

    expect(contextCorrelationId()).toBe('proxy-id_2');
  });

  it('mints a valid id when the header is absent', async () => {
    mockHeaders.mockResolvedValue(headersWith(null));

    await withRequestContext(() => 'ok');

    expect(contextCorrelationId()).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it('mints a valid id when the header is malformed', async () => {
    mockHeaders.mockResolvedValue(headersWith('not a valid id!'));

    await withRequestContext(() => 'ok');

    expect(contextCorrelationId()).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it('runs and returns the wrapped function result', async () => {
    mockHeaders.mockResolvedValue(headersWith(null));

    const result = await withRequestContext(() => 'value');

    expect(result).toBe('value');
  });
});
