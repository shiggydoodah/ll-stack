import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';

import type { BoundedThrottlerStorage } from '../src/common/throttling/bounded-throttler.storage';
import type { PrismaService } from '../src/prisma/prisma.service';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';
import { pinRateLimitingEnabled } from './helpers/rate-limiting';

const API_SECRET_HEADER = 'x-api-secret';
const TEST_API_SECRET = 'test-api-secret';
const SESSION_COOKIE_NAME = 'llstack_session';

const REGISTER_BODY = {
  name: 'Ada Whitcombe',
  email: 'ada@example.com',
  password: 'correct-horse-battery-1',
  consent: true,
};

function sessionCookieFrom(response: request.Response): string | undefined {
  const header = response.headers['set-cookie'];
  const cookies: string[] = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** HTTP contract for /auth/*: statuses, error envelope codes, cookies, throttles. */
describe('Auth endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerStorage: BoundedThrottlerStorage;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    applyAppModuleTestEnv(3196);
    pinRateLimitingEnabled();
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap/configure-app.js');
    const { PrismaService: PrismaServiceClass } = await import('../src/prisma/prisma.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaServiceClass);
    throttlerStorage = app.get<BoundedThrottlerStorage>(getStorageToken());
  });

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  beforeEach(async () => {
    throttlerStorage.storage.clear();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set(API_SECRET_HEADER, TEST_API_SECRET);

  describe('POST /auth/register', () => {
    it('creates the account, returns 201, and sets an httpOnly session cookie', async () => {
      const response = await post('/auth/register').send(REGISTER_BODY).expect(201);

      expect(response.body.account).toMatchObject({
        name: REGISTER_BODY.name,
        email: REGISTER_BODY.email,
        role: 'MEMBER',
      });
      expect(typeof response.body.account.userId).toBe('string');

      const cookie = sessionCookieFrom(response);
      expect(cookie).toBeDefined();
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    });

    it('rejects the api secret being absent with 401 (global guard)', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(REGISTER_BODY).expect(401);
    });

    it('rejects consent=false with 400 before any account is created', async () => {
      const response = await post('/auth/register')
        .send({ ...REGISTER_BODY, consent: false })
        .expect(400);

      expect(JSON.stringify(response.body.message)).toContain('consent must be true');
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects an invalid body with 400 (whitelist + validation)', async () => {
      await post('/auth/register')
        .send({ email: 'ada@example.com', password: 'short', consent: true, extra: 'field' })
        .expect(400);
    });

    it('answers a duplicate email with 409 EMAIL_ALREADY_REGISTERED', async () => {
      await post('/auth/register').send(REGISTER_BODY).expect(201);
      const response = await post('/auth/register')
        .send({ ...REGISTER_BODY, email: 'ADA@EXAMPLE.COM' })
        .expect(409);

      expect(response.body.error).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('throttles the per-email bucket after 3 attempts with Retry-After on the 429', async () => {
      await post('/auth/register').send(REGISTER_BODY).expect(201);
      await post('/auth/register').send(REGISTER_BODY).expect(409);
      await post('/auth/register').send(REGISTER_BODY).expect(409);

      const response = await post('/auth/register').send(REGISTER_BODY).expect(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await post('/auth/register').send(REGISTER_BODY).expect(201);
      throttlerStorage.storage.clear();
    });

    it('returns 200 with the account and a fresh session cookie', async () => {
      const response = await post('/auth/login')
        .send({ email: REGISTER_BODY.email, password: REGISTER_BODY.password })
        .expect(200);

      expect(response.body.account.email).toBe(REGISTER_BODY.email);
      expect(sessionCookieFrom(response)).toBeDefined();
    });

    it('answers unknown email and wrong password with an identical 400 envelope', async () => {
      const unknownEmail = await post('/auth/login')
        .send({ email: 'nobody@example.com', password: REGISTER_BODY.password })
        .expect(400);
      const wrongPassword = await post('/auth/login')
        .send({ email: REGISTER_BODY.email, password: 'wrong-password-1' })
        .expect(400);

      expect(unknownEmail.body.error).toBe('INVALID_CREDENTIALS');
      expect(wrongPassword.body.error).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.body.message).toEqual(wrongPassword.body.message);
    });

    it('throttles the per-email bucket after 5 attempts with Retry-After on the 429', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/auth/login')
          .send({ email: REGISTER_BODY.email, password: 'wrong-password-1' })
          .expect(400);
      }

      const response = await post('/auth/login')
        .send({ email: REGISTER_BODY.email, password: 'wrong-password-1' })
        .expect(429);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the presented session and clears the cookie', async () => {
      const registered = await post('/auth/register').send(REGISTER_BODY).expect(201);
      const cookie = sessionCookieFrom(registered);
      expect(cookie).toBeDefined();

      const response = await post('/auth/logout')
        .set('Cookie', cookie as string)
        .expect(204);
      expect(sessionCookieFrom(response)).toContain(`${SESSION_COOKIE_NAME}=;`);

      const sessions = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.revokedAt).not.toBeNull();
    });

    it('answers 204 with no session cookie present (idempotent)', async () => {
      await post('/auth/logout').expect(204);
    });
  });
});
