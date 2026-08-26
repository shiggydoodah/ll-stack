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

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set(API_SECRET_HEADER, TEST_API_SECRET);

  /** Registers (or signs in again) and returns the cookie header a browser would hold. */
  async function signInCookie(email = REGISTER_BODY.email): Promise<string> {
    const created =
      email === REGISTER_BODY.email && (await prisma.user.count({ where: { email } })) > 0
        ? await post('/auth/login').send({ email, password: REGISTER_BODY.password }).expect(200)
        : await post('/auth/register')
            .send({ ...REGISTER_BODY, email })
            .expect(201);
    const cookie = sessionCookieFrom(created);
    if (cookie === undefined) throw new Error('sign-in did not set a session cookie');
    return cookie;
  }

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

  describe('POST /auth/session/rotate', () => {
    /** Ages every live session past the rotation interval. */
    async function makeRotationDue(): Promise<void> {
      await prisma.session.updateMany({
        data: { issuedAt: new Date(Date.now() - 2 * 3_600 * 1000) },
      });
    }

    it('answers 200 not_due with no cookie while the token is still fresh', async () => {
      const cookie = await signInCookie();

      const response = await post('/auth/session/rotate').set('Cookie', cookie).expect(200);

      expect(response.body.status).toBe('not_due');
      expect(response.body.nextRotationInSeconds).toBeGreaterThan(0);
      expect(sessionCookieFrom(response)).toBeUndefined();
    });

    it('answers 200 rotated with a new session cookie once the interval has passed', async () => {
      const cookie = await signInCookie();
      await makeRotationDue();

      const response = await post('/auth/session/rotate').set('Cookie', cookie).expect(200);

      expect(response.body.status).toBe('rotated');
      const rotated = sessionCookieFrom(response);
      expect(rotated).toBeDefined();
      expect(rotated).toContain('HttpOnly');
      expect(rotated).toContain('SameSite=Lax');
      expect(rotated).not.toBe(cookie);
    });

    it('answers 200 superseded with no cookie when the token was already rotated away', async () => {
      const cookie = await signInCookie();
      await makeRotationDue();
      await post('/auth/session/rotate').set('Cookie', cookie).expect(200);

      const response = await post('/auth/session/rotate').set('Cookie', cookie).expect(200);

      expect(response.body.status).toBe('superseded');
      // Writing here would overwrite the winner's cookie with a retired token.
      expect(sessionCookieFrom(response)).toBeUndefined();
    });

    it('answers 401 SESSION_INVALID and clears the cookie for a dead token', async () => {
      const response = await post('/auth/session/rotate')
        .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-token`)
        .expect(401);

      expect(response.body.error).toBe('SESSION_INVALID');
      expect(sessionCookieFrom(response)).toContain(`${SESSION_COOKIE_NAME}=;`);
    });

    it('answers 401 with no session cookie at all', async () => {
      await post('/auth/session/rotate').expect(401);
    });

    it('rejects the api secret being absent with 401 (global guard)', async () => {
      // The SAME status as a dead session, and the error code is the only thing
      // that separates them. `apps/frontend/lib/auth/session-rotation.ts` signs a
      // browser out on SESSION_INVALID alone, because reading a bare 401 as a
      // sign-out turns one wrong BACKEND_API_SECRET into a mass sign-out.
      const response = await request(app.getHttpServer())
        .post('/auth/session/rotate')
        .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-token`)
        .expect(401);

      expect(response.body.error).not.toBe('SESSION_INVALID');
      expect(response.body.error).toBe('Unauthorized');
    });

    it('throttles one session after 10 attempts with Retry-After on the 429', async () => {
      const cookie = await signInCookie();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await post('/auth/session/rotate').set('Cookie', cookie).expect(200);
      }

      const throttled = await post('/auth/session/rotate').set('Cookie', cookie).expect(429);
      expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('throttles per session token, not per caller address', async () => {
      // Every call to this route arrives from a BFF, so one address is every
      // signed-in user at once. A second session must be unaffected by the first
      // one exhausting its bucket.
      const first = await signInCookie();
      const secondRegistered = await post('/auth/register')
        .send({ ...REGISTER_BODY, email: 'grace@example.com' })
        .expect(201);
      const second = sessionCookieFrom(secondRegistered);
      expect(second).toBeDefined();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await post('/auth/session/rotate').set('Cookie', first).expect(200);
      }
      await post('/auth/session/rotate').set('Cookie', first).expect(429);

      await post('/auth/session/rotate')
        .set('Cookie', second as string)
        .expect(200);
    });
  });

  describe('GET /auth/sessions', () => {
    it('returns 200 with one entry per sign-in and marks the caller’s own', async () => {
      const first = await signInCookie();
      const second = await signInCookie();

      const response = await get('/auth/sessions').set('Cookie', second).expect(200);

      expect(response.body.truncated).toBe(false);
      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.sessions[0].current).toBe(true);
      expect(response.body.sessions[1].current).toBe(false);
      expect(typeof response.body.sessions[0].sessionId).toBe('string');
      expect(typeof response.body.sessions[0].startedAt).toBe('string');
      expect(first).not.toBe(second);
    });

    it('never returns a token, a hash, or another account’s rows', async () => {
      const cookie = await signInCookie();
      await signInCookie('grace@example.com');

      const response = await get('/auth/sessions').set('Cookie', cookie).expect(200);

      expect(response.body.sessions).toHaveLength(1);
      const token = cookie.split(';')[0]?.split('=')[1] ?? '';
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect(JSON.stringify(response.body)).not.toMatch(/[0-9a-f]{64}/);
    });

    it('answers 401 without a session cookie', async () => {
      await get('/auth/sessions').expect(401);
    });

    it('rejects the api secret being absent with 401 (global guard)', async () => {
      const cookie = await signInCookie();
      await request(app.getHttpServer()).get('/auth/sessions').set('Cookie', cookie).expect(401);
    });
  });

  describe('POST /auth/sessions/revoke-all', () => {
    it('spares the caller when asked, and ends everything else', async () => {
      const other = await signInCookie();
      const mine = await signInCookie();

      const response = await post('/auth/sessions/revoke-all')
        .set('Cookie', mine)
        .send({ keepCurrent: true })
        .expect(200);

      expect(response.body).toMatchObject({ revokedSessions: 1, currentSessionRevoked: false });
      // The cookie survives, because the sign-in behind it did.
      expect(sessionCookieFrom(response)).toBeUndefined();
      await get('/auth/sessions').set('Cookie', mine).expect(200);
      await get('/auth/sessions').set('Cookie', other).expect(401);
    });

    it('revokes all of them by default and clears the caller’s cookie', async () => {
      await signInCookie();
      const mine = await signInCookie();

      const response = await post('/auth/sessions/revoke-all').set('Cookie', mine).expect(200);

      expect(response.body).toMatchObject({ revokedSessions: 2, currentSessionRevoked: true });
      expect(sessionCookieFrom(response)).toContain(`${SESSION_COOKIE_NAME}=;`);
      await get('/auth/sessions').set('Cookie', mine).expect(401);
    });

    it('rejects a non-boolean keepCurrent and an unknown field with 400', async () => {
      const cookie = await signInCookie();

      await post('/auth/sessions/revoke-all')
        .set('Cookie', cookie)
        .send({ keepCurrent: 'yes' })
        .expect(400);
      await post('/auth/sessions/revoke-all')
        .set('Cookie', cookie)
        .send({ everyone: true })
        .expect(400);
    });

    it('answers 401 without a session cookie', async () => {
      await post('/auth/sessions/revoke-all').expect(401);
    });

    it('throttles one account after 5 attempts with Retry-After on the 429', async () => {
      const cookie = await signInCookie();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/auth/sessions/revoke-all')
          .set('Cookie', cookie)
          .send({ keepCurrent: true })
          .expect(200);
      }

      const throttled = await post('/auth/sessions/revoke-all')
        .set('Cookie', cookie)
        .send({ keepCurrent: true })
        .expect(429);
      expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('throttles per account, not per caller address', async () => {
      // Every call arrives from the BFF, so one address is every signed-in user.
      const mine = await signInCookie();
      const theirs = await signInCookie('grace@example.com');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await post('/auth/sessions/revoke-all')
          .set('Cookie', mine)
          .send({ keepCurrent: true })
          .expect(200);
      }
      await post('/auth/sessions/revoke-all')
        .set('Cookie', mine)
        .send({ keepCurrent: true })
        .expect(429);

      await post('/auth/sessions/revoke-all')
        .set('Cookie', theirs)
        .send({ keepCurrent: true })
        .expect(200);
    });
  });
});
