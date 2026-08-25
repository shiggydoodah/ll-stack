import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { listenTestServer } from './helpers/listen-test-server';

import { TraceIdInterceptor } from '../src/common/interceptors/trace-id.interceptor';
import { RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';

@Controller('test')
class TestController {
  @Get('object')
  object(): { name: string } {
    return { name: 'Louis' };
  }

  @Get('array')
  array(): number[] {
    return [1, 2, 3];
  }
}

async function compileInterceptorTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [TestController],
    providers: [
      {
        provide: APP_INTERCEPTOR,
        useClass: TraceIdInterceptor,
      },
    ],
  }).compile();

  module.useLogger(false);
  const app = module.createNestApplication();

  // Mirror production wiring: RequestIdMiddleware populates req.id from the
  // inbound x-request-id header before the interceptor resolves the trace id,
  // so the request-id -> trace-id hand-off is actually exercised.
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  await app.init();
  await listenTestServer(app);

  return app;
}

describe('TraceIdInterceptor Integration', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await compileInterceptorTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sets x-trace-id header and an additive traceId field on object responses', async () => {
    const response = await request(app.getHttpServer()).get('/test/object');

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Louis');
    expect(typeof response.body.traceId).toBe('string');
    expect(response.body.traceId.length).toBeGreaterThan(0);
    expect(response.headers['x-trace-id']).toBe(response.body.traceId);
  });

  it('echoes a client-supplied request id as the trace id when no OTel span is active', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/object')
      .set('x-request-id', 'req-id_123');

    // RequestIdMiddleware sets req.id from the header, so the interceptor's
    // fallback resolves to the client-supplied id (no active OTel span in test).
    expect(response.headers['x-trace-id']).toBe('req-id_123');
    expect(response.body.traceId).toBe('req-id_123');
  });

  it('leaves array responses untouched but still sets the header', async () => {
    const response = await request(app.getHttpServer()).get('/test/array');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([1, 2, 3]);
    expect(typeof response.headers['x-trace-id']).toBe('string');
  });
});
