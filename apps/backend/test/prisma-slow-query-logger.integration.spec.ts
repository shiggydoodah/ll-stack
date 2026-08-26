import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { BACKEND_LOG_EVENTS } from '../src/common/logging/log-events';
import { createSlowQueryHandler } from '../src/prisma/prisma-slow-query-logger';

function makeQueryEvent(duration: number): Prisma.QueryEvent {
  return {
    timestamp: new Date(),
    query: 'SELECT * FROM users WHERE id = ?',
    params: '["user-id-value"]',
    duration,
    target: 'prisma',
  };
}

describe('createSlowQueryHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not log when query duration is below threshold', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const handler = createSlowQueryHandler(500);

    handler(makeQueryEvent(499));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs warn when query duration meets the threshold', () => {
    const capturedArgs: unknown[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((data) => {
      capturedArgs.push(data);
    });
    const handler = createSlowQueryHandler(500);

    handler(makeQueryEvent(500));

    expect(capturedArgs).toHaveLength(1);
    expect(capturedArgs[0]).toMatchObject({
      event: BACKEND_LOG_EVENTS['db.query.slow'],
      durationMs: 500,
      thresholdMs: 500,
    });
  });

  it('logs warn when query duration exceeds the threshold', () => {
    const capturedArgs: unknown[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((data) => {
      capturedArgs.push(data);
    });
    const handler = createSlowQueryHandler(100);

    handler(makeQueryEvent(850));

    expect(capturedArgs[0]).toMatchObject({
      event: BACKEND_LOG_EVENTS['db.query.slow'],
      durationMs: 850,
      thresholdMs: 100,
    });
  });

  it('does not include query or params in the log payload', () => {
    const capturedArgs: unknown[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((data) => {
      capturedArgs.push(data);
    });
    const handler = createSlowQueryHandler(100);

    handler(makeQueryEvent(500));

    const logPayload = capturedArgs[0] as Record<string, unknown>;
    expect(logPayload).not.toHaveProperty('query');
    expect(logPayload).not.toHaveProperty('params');
  });

  it('includes the target field without exposing query content', () => {
    const capturedArgs: unknown[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((data) => {
      capturedArgs.push(data);
    });
    const handler = createSlowQueryHandler(100);

    handler(makeQueryEvent(500));

    const logPayload = capturedArgs[0] as Record<string, unknown>;
    expect(logPayload).toHaveProperty('target', 'prisma');
  });
});
