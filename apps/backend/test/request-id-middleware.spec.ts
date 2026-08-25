import type { NextFunction, Request, Response } from 'express';

import { RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';

type Headers = Record<string, string | undefined>;

function runMiddleware(headers: Headers): {
  req: Request & { id?: string; requestId?: string; correlationId?: string };
  setHeaders: Record<string, unknown>;
  next: jest.Mock;
} {
  const middleware = new RequestIdMiddleware();
  const setHeaders: Record<string, unknown> = {};
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request & { id?: string; requestId?: string; correlationId?: string };
  const res = {
    setHeader: (name: string, value: unknown) => {
      setHeaders[name] = value;
    },
  } as unknown as Response;
  const next = jest.fn();

  middleware.use(req, res, next as unknown as NextFunction);

  return { req, setHeaders, next };
}

describe('RequestIdMiddleware', () => {
  it('stashes a valid inbound x-correlation-id on the request', () => {
    const { req, next } = runMiddleware({
      'x-request-id': 'req_1',
      'x-correlation-id': 'corr_1',
    });

    expect(req.requestId).toBe('req_1');
    expect(req.correlationId).toBe('corr_1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back correlationId to requestId when the header is absent', () => {
    const { req, next } = runMiddleware({ 'x-request-id': 'req_1' });

    expect(req.correlationId).toBe('req_1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('discards a malformed x-correlation-id and falls back to requestId', () => {
    const { req, next } = runMiddleware({
      'x-request-id': 'req_1',
      'x-correlation-id': 'bad value\nwith\tcontrol',
    });

    expect(req.correlationId).toBe('req_1');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
