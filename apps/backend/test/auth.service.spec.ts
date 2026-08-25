import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { AuthService } from '../src/auth/auth.service';
import { AuthError } from '../src/auth/auth.errors';
import type { SessionToken, UserId } from '../src/auth/auth.types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';

const REGISTER_INPUT = {
  name: 'Ada Whitcombe',
  email: 'ada@example.com',
  password: 'correct-horse-battery-1',
  consent: true,
};

async function expectAuthErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'AuthError', code });
  await promise.catch((error: unknown) => {
    expect(error).toBeInstanceOf(AuthError);
  });
}

/**
 * Service-level contract spec for AuthService against the real test database:
 * hashing, normalization, the typed error codes, and the session round trip.
 * The HTTP layer (statuses, cookies, throttles) is covered by
 * auth.integration.spec.ts.
 */
describe('AuthService (contract)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    applyAppModuleTestEnv(3197);
    const { AppModule } = await import('../src/app.module.js');
    const { AuthService: AuthServiceClass } = await import('../src/auth/auth.service.js');
    const { PrismaService: PrismaServiceClass } = await import('../src/prisma/prisma.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    authService = app.get(AuthServiceClass);
    prisma = app.get(PrismaServiceClass);
  });

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('registers an account with a trimmed name, normalized email, and an argon2id hash', async () => {
    const account = await authService.register({
      ...REGISTER_INPUT,
      name: '  Ada Whitcombe  ',
      email: '  ADA@Example.COM ',
    });

    expect(account.name).toBe('Ada Whitcombe');
    expect(account.email).toBe('ada@example.com');
    expect(account.role).toBe('MEMBER');

    const row = await prisma.user.findFirstOrThrow({
      where: { userId: account.userId },
      select: { passwordHash: true, consent: true, hashVersion: true },
    });
    expect(row.consent).toBe(true);
    expect(row.hashVersion).toBe(1);
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row.passwordHash).not.toContain(REGISTER_INPUT.password);
  });

  it('rejects registration without consent (CONSENT_REQUIRED)', async () => {
    await expectAuthErrorCode(
      authService.register({ ...REGISTER_INPUT, consent: false }),
      'CONSENT_REQUIRED',
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects a duplicate email case-insensitively (EMAIL_ALREADY_REGISTERED)', async () => {
    await authService.register(REGISTER_INPUT);
    await expectAuthErrorCode(
      authService.register({ ...REGISTER_INPUT, email: 'ADA@EXAMPLE.COM' }),
      'EMAIL_ALREADY_REGISTERED',
    );
  });

  it('frees a soft-deleted account’s email for re-registration', async () => {
    const account = await authService.register(REGISTER_INPUT);
    await prisma.user.update({
      where: { userId: account.userId },
      data: { deletedAt: new Date() },
    });

    const reRegistered = await authService.register(REGISTER_INPUT);
    expect(reRegistered.userId).not.toBe(account.userId);
  });

  it('logs in with valid credentials and persists only the token hash', async () => {
    const account = await authService.register(REGISTER_INPUT);
    const issued = await authService.login({
      email: REGISTER_INPUT.email,
      password: REGISTER_INPUT.password,
    });

    expect(issued.session.userId).toBe(account.userId);
    expect(issued.token.length).toBeGreaterThan(20);

    const stored = await prisma.session.findFirstOrThrow({
      where: { sessionId: issued.session.sessionId },
      select: { tokenHash: true, hashVersion: true },
    });
    expect(stored.tokenHash).not.toBe(issued.token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.hashVersion).toBe(1);

    const session = await authService.getSession(issued.token);
    expect(session?.userId).toBe(account.userId);
  });

  it('rejects an unknown email and a wrong password with the same code (INVALID_CREDENTIALS)', async () => {
    await authService.register(REGISTER_INPUT);

    await expectAuthErrorCode(
      authService.login({ email: 'nobody@example.com', password: REGISTER_INPUT.password }),
      'INVALID_CREDENTIALS',
    );
    await expectAuthErrorCode(
      authService.login({ email: REGISTER_INPUT.email, password: 'wrong-password-1' }),
      'INVALID_CREDENTIALS',
    );
  });

  it('rejects login for a soft-deleted account (INVALID_CREDENTIALS)', async () => {
    const account = await authService.register(REGISTER_INPUT);
    await prisma.user.update({
      where: { userId: account.userId },
      data: { deletedAt: new Date() },
    });

    await expectAuthErrorCode(
      authService.login({ email: REGISTER_INPUT.email, password: REGISTER_INPUT.password }),
      'INVALID_CREDENTIALS',
    );
  });

  it('revokes a session on logout, idempotently', async () => {
    await authService.register(REGISTER_INPUT);
    const issued = await authService.login({
      email: REGISTER_INPUT.email,
      password: REGISTER_INPUT.password,
    });

    await authService.logout(issued.token);
    expect(await authService.getSession(issued.token)).toBeNull();

    // Second logout is a no-op — the revokedAt guard filters the row out.
    await expect(authService.logout(issued.token)).resolves.toBeUndefined();
  });

  it('treats an expired session as invalid', async () => {
    await authService.register(REGISTER_INPUT);
    const issued = await authService.login({
      email: REGISTER_INPUT.email,
      password: REGISTER_INPUT.password,
    });

    await prisma.session.update({
      where: { sessionId: issued.session.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await authService.getSession(issued.token)).toBeNull();
  });

  it('returns null session metadata for a garbage token instead of throwing', async () => {
    expect(await authService.getSession('not-a-real-token' as SessionToken)).toBeNull();
  });

  it('refuses to issue a session for an unknown or malformed account id (ACCOUNT_NOT_FOUND)', async () => {
    await expectAuthErrorCode(
      authService.issueSessionForAccount('not-a-uuid' as UserId),
      'ACCOUNT_NOT_FOUND',
    );
    await expectAuthErrorCode(
      authService.issueSessionForAccount('01890c4b-1d6a-7c00-93b6-2c9c0a3d5f10' as UserId),
      'ACCOUNT_NOT_FOUND',
    );
  });
});
