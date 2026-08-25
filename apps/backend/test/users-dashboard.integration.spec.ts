import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';

import type { BoundedThrottlerStorage } from '../src/common/throttling/bounded-throttler.storage';
import type { PrismaService } from '../src/prisma/prisma.service';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';

const API_SECRET_HEADER = 'x-api-secret';
const TEST_API_SECRET = 'test-api-secret';
const SESSION_COOKIE_NAME = 'llstack_session';

const REGISTER_BODY = {
  name: 'Ada Whitcombe',
  email: 'ada@example.com',
  password: 'correct-horse-battery-1',
  consent: true,
};

/** HTTP contract for the session-guarded reads: GET /users/me and GET /dashboard. */
describe('Users + dashboard endpoints (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerStorage: BoundedThrottlerStorage;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    applyAppModuleTestEnv(3195);
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
    // These specs mint accounts through the real /auth/register route as setup,
    // and that route carries a 5/hr per-IP throttle. Without this, how many
    // cases a suite may contain depends on a rate limit it is not testing —
    // adding one made an unrelated case fail with a 429. Same reasoning as
    // auth.integration.spec.ts.
    throttlerStorage.storage.clear();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  async function registerAndGetCookie(
    overrides: Partial<typeof REGISTER_BODY> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set(API_SECRET_HEADER, TEST_API_SECRET)
      .send({ ...REGISTER_BODY, ...overrides })
      .expect(201);

    const header = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(header) ? header : header ? [header] : [];
    const cookie = cookies.find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('register did not set a session cookie');
    return cookie;
  }

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set(API_SECRET_HEADER, TEST_API_SECRET);

  describe('GET /users/me', () => {
    it('returns the account behind the session cookie', async () => {
      const cookie = await registerAndGetCookie();

      const response = await get('/users/me').set('Cookie', cookie).expect(200);
      expect(response.body.account).toMatchObject({
        name: REGISTER_BODY.name,
        email: REGISTER_BODY.email,
        role: 'MEMBER',
      });
    });

    it('rejects a missing session cookie with 401', async () => {
      await get('/users/me').expect(401);
    });

    it('rejects a garbage session cookie with 401 and clears it', async () => {
      const response = await get('/users/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-token`)
        .expect(401);

      const header = response.headers['set-cookie'];
      const cookies: string[] = Array.isArray(header) ? header : header ? [header] : [];
      expect(cookies.some((value) => value.startsWith(`${SESSION_COOKIE_NAME}=;`))).toBe(true);
    });

    it('rejects a revoked session with 401', async () => {
      const cookie = await registerAndGetCookie();
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(API_SECRET_HEADER, TEST_API_SECRET)
        .set('Cookie', cookie)
        .expect(204);

      await get('/users/me').set('Cookie', cookie).expect(401);
    });
  });

  describe('GET /dashboard', () => {
    it('returns the member summary, newest first', async () => {
      const cookie = await registerAndGetCookie();
      await registerAndGetCookie({ name: 'Marcus Reid', email: 'marcus@example.com' });

      const response = await get('/dashboard').set('Cookie', cookie).expect(200);

      expect(response.body.totalMembers).toBe(2);
      expect(response.body.members).toHaveLength(2);
      expect(response.body.members[0]).toMatchObject({
        name: 'Marcus Reid',
        emailMasked: 'm***@example.com',
        role: 'MEMBER',
      });
      expect(typeof response.body.members[0].joinedAt).toBe('string');
      // The wire DTO never exposes hashes or consent flags.
      expect(response.body.members[0].passwordHash).toBeUndefined();
      expect(response.body.members[0].consent).toBeUndefined();
    });

    it("never publishes a member's stored email address", async () => {
      // The caller here is an ordinary self-service signup with no relationship
      // to the other member — which is the whole population of this endpoint.
      const cookie = await registerAndGetCookie();
      await registerAndGetCookie({ name: 'Marcus Reid', email: 'marcus@example.com' });

      const response = await get('/dashboard').set('Cookie', cookie).expect(200);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain('marcus@example.com');
      expect(body).not.toContain(REGISTER_BODY.email);
      for (const member of response.body.members) {
        expect(member.email).toBeUndefined();
        expect(member.emailMasked).toMatch(/^.\*\*\*@/);
      }
    });

    it('rejects a missing session cookie with 401', async () => {
      await get('/dashboard').expect(401);
    });
  });
});
