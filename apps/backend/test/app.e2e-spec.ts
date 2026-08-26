import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';

import type { BoundedThrottlerStorage } from '../src/common/throttling/bounded-throttler.storage';
import { TRACE_ID_HEADER } from '../src/common/utils/trace-context';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';
import { pinRateLimitingEnabled } from './helpers/rate-limiting';

const API_SECRET_HEADER = 'x-api-secret';
const TEST_API_SECRET = 'test-api-secret';

/**
 * The one spec that boots the FULL `AppModule` graph and drives it over HTTP:
 * the env schema, the global guards/filter/interceptor wiring in
 * `app.module.ts`, `configureApp`, and the health route. Everything else gets
 * narrower harnesses; this exists so a wiring mistake between them cannot pass
 * every narrow spec and still fail on boot.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let throttlerStorage: BoundedThrottlerStorage;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    // Env BEFORE the import: `ConfigModule.forRoot` validates eagerly while the
    // decorator metadata is evaluated, i.e. at module load, not at app init.
    applyAppModuleTestEnv(3199);
    pinRateLimitingEnabled();
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap/configure-app.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { openapi: true });
    await app.init();

    throttlerStorage = app.get<BoundedThrottlerStorage>(getStorageToken());
  });

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  it('serves /health without the api secret (infrastructure probes hold no credentials)', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toMatchObject({
      status: expect.any(String),
      database: { status: expect.any(String) },
    });
  });

  // NOTE: the global ApiSecretGuard runs per MATCHED route, so an unknown URL
  // is a 404 before the guard is consulted — and /health, the only route so
  // far, deliberately skips the secret. The 401 arm becomes testable (and
  // tested) when the first guarded route lands with the auth feature.
  it('answers the error envelope with a trace id on unknown routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist')
      .set(API_SECRET_HEADER, TEST_API_SECRET)
      .expect(404);

    expect(response.headers[TRACE_ID_HEADER]).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: expect.any(String),
      message: expect.anything(),
      path: '/does-not-exist',
      timestamp: expect.any(String),
      traceId: response.headers[TRACE_ID_HEADER],
    });
  });

  it('mounts the OpenAPI document when opted in', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(response.body.paths['/health'].get.operationId).toBe('getHealth');
    // /health is published as unauthenticated; the doc must say so.
    expect(response.body.paths['/health'].get.security).toEqual([]);
  });

  // Runs last: it deliberately exhausts the global per-IP bucket, and every
  // request in this file comes from the same loopback address.
  it('counts a wrong api secret against the global throttle before rejecting it', async () => {
    // GUARD ORDER, ASSERTED THROUGH BEHAVIOUR. `app.module.ts` provides
    // AppThrottlerGuard before ApiSecretGuard, and Nest runs global guards in
    // provider order. With the two the other way round — which is how they were
    // registered — a wrong `x-api-secret` was answered 401 without the request
    // ever being counted, so the single header protecting every internal route
    // could be guessed at line rate, forever, from one IP.
    throttlerStorage.storage.clear();

    const globalLimit = 60;
    for (let attempt = 0; attempt < globalLimit; attempt += 1) {
      await request(app.getHttpServer())
        .get('/users/me')
        .set(API_SECRET_HEADER, 'wrong-api-secret')
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .get('/users/me')
      .set(API_SECRET_HEADER, 'wrong-api-secret')
      .expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    throttlerStorage.storage.clear();
  });
});
