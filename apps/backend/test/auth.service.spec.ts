import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash as argon2Hash, needsRehash } from 'argon2';

import type { AuthService } from '../src/auth/auth.service';
import { AuthError } from '../src/auth/auth.errors';
import type { SessionIssued, SessionToken, UserId } from '../src/auth/auth.types';
import { BACKEND_LOG_EVENTS } from '../src/common/logging/log-events';
import type { PrismaService } from '../src/prisma/prisma.service';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';

const REGISTER_INPUT = {
  name: 'Ada Whitcombe',
  email: 'ada@example.com',
  password: 'correct-horse-battery-1',
  consent: true,
};

/** What `applyAppModuleTestEnv` pins `AUTH_ARGON2_*` to for this suite. */
const CURRENT_ARGON2_COST = { memoryCost: 8, timeCost: 1, parallelism: 1 } as const;

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

  it("treats a soft-deleted account's live session as invalid", async () => {
    // Soft-deleting a user has to sign them out. `login` already refused a
    // deleted account, but a session issued BEFORE the deletion kept
    // authenticating every guarded route until its 7-day TTL ran out.
    const account = await authService.register(REGISTER_INPUT);
    const issued = await authService.login({
      email: REGISTER_INPUT.email,
      password: REGISTER_INPUT.password,
    });
    expect(await authService.getSession(issued.token)).not.toBeNull();

    await prisma.user.update({
      where: { userId: account.userId },
      data: { deletedAt: new Date() },
    });

    expect(await authService.getSession(issued.token)).toBeNull();
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

  describe('token rotation', () => {
    /** Registers, logs in, and returns the issued session. */
    async function signIn(): Promise<SessionIssued> {
      await authService.register(REGISTER_INPUT);
      return authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });
    }

    /**
     * Ages a session's `issuedAt` past the rotation interval. Rotation runs on
     * the default hour-long interval here rather than a shortened one, so these
     * cases exercise the shipped configuration and not a test-only variant of it.
     */
    async function makeRotationDue(sessionId: string): Promise<void> {
      await prisma.session.update({
        where: { sessionId },
        data: { issuedAt: new Date(Date.now() - 2 * 3_600 * 1000) },
      });
    }

    /** Ages a superseded row's `rotatedAt` past the grace window. */
    async function expireGraceWindow(sessionId: string): Promise<void> {
      await prisma.session.update({
        where: { sessionId },
        data: { rotatedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
    }

    it('starts every sign-in as its own single-member family', async () => {
      const issued = await signIn();

      const row = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { familyId: true, rotatedAt: true },
      });
      expect(row.familyId).toBe(issued.session.sessionId);
      expect(row.rotatedAt).toBeNull();
    });

    it('leaves a fresh token alone (not_due)', async () => {
      const issued = await signIn();

      const rotation = await authService.rotateSession(issued.token);

      expect(rotation.status).toBe('not_due');
      expect(await prisma.session.count()).toBe(1);
      expect(await authService.getSession(issued.token)).not.toBeNull();
    });

    it('issues a successor in the same family once the interval has passed', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);

      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated')
        throw new Error(`expected rotated, got ${rotation.status}`);

      expect(rotation.issued.token).not.toBe(issued.token);
      expect(rotation.issued.session.sessionId).not.toBe(issued.session.sessionId);

      const rows = await prisma.session.findMany({
        select: { sessionId: true, familyId: true, rotatedAt: true, expiresAt: true },
        orderBy: { issuedAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.familyId))).toEqual(new Set([issued.session.sessionId]));
      expect(rows[0]?.rotatedAt).not.toBeNull();
      expect(rows[1]?.rotatedAt).toBeNull();

      // Rotation is not a renewal: the successor inherits the family's ceiling.
      expect(rows[1]?.expiresAt.getTime()).toBe(issued.session.expiresAt.getTime());
    });

    it('persists only the successor’s hash, never its raw token', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      const hashes = await prisma.session.findMany({ select: { tokenHash: true } });
      for (const { tokenHash } of hashes) {
        expect(tokenHash).not.toBe(rotation.issued.token);
        expect(tokenHash).not.toContain(rotation.issued.token);
      }
    });

    it('serves the retired token inside the grace window without rotating again', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      await authService.rotateSession(issued.token);

      // The request that was already in flight when the rotation landed.
      expect(await authService.getSession(issued.token)).not.toBeNull();
      expect((await authService.rotateSession(issued.token)).status).toBe('superseded');
      expect(await prisma.session.count()).toBe(2);
    });

    it('revokes the whole family when a retired token is presented after the grace window', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      // The successor reached a browser and that browser used it, which is the
      // half of the alarm that takes a SECOND holder. Without it the retired
      // token being presented late means only that the rotation never arrived.
      expect(await authService.getSession(rotation.issued.token)).not.toBeNull();
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();

      // The successor the legitimate browser holds goes down with it — that is
      // the point.
      expect(await authService.getSession(rotation.issued.token)).toBeNull();
      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('stamps first use once and leaves it alone on every later request', async () => {
      const issued = await signIn();

      const beforeUse = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { firstUsedAt: true },
      });
      expect(beforeUse.firstUsedAt).toBeNull();

      await authService.getSession(issued.token);
      const firstUse = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { firstUsedAt: true },
      });
      expect(firstUse.firstUsedAt).not.toBeNull();

      await authService.getSession(issued.token);
      const secondUse = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { firstUsedAt: true },
      });
      expect(secondUse.firstUsedAt?.getTime()).toBe(firstUse.firstUsedAt?.getTime());
    });

    it('survives two requests racing the same first use', async () => {
      // `markFirstUse` is guarded on the column, not serialised. Both writers
      // land microseconds apart and the column answers "was this ever used", so
      // a lost tie changes nothing — but an unhandled write conflict here would
      // fail an ordinary authenticated request.
      const issued = await signIn();

      const [first, second] = await Promise.all([
        authService.getSession(issued.token),
        authService.getSession(issued.token),
      ]);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      const row = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { firstUsedAt: true },
      });
      expect(row.firstUsedAt).not.toBeNull();
    });

    it('restores the token when a rotation the browser never received expires its grace', async () => {
      // The lost-response case: the backend committed the rotation, the
      // Set-Cookie never reached the browser, and the browser goes on presenting
      // the token it still holds. Identical to theft from the outside, except
      // that nobody ever used the successor — so there is one holder, and it is
      // the browser in front of us. Refusing it here used to end the session on
      // nothing worse than a cancelled navigation.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      const retry = await authService.rotateSession(issued.token);
      if (retry.status !== 'rotated') throw new Error(`expected rotated, got ${retry.status}`);

      // The un-retire is not directly observable, because the same call re-runs
      // the rotation it recovered from — but the shape it leaves is. The
      // presented row was rotated a SECOND time rather than left alone or
      // revoked, and the token the caller was handed was minted from it at that
      // instant.
      const presented = await prisma.session.findFirstOrThrow({
        where: { sessionId: issued.session.sessionId },
        select: { rotatedAt: true, revokedAt: true },
      });
      expect(presented.revokedAt).toBeNull();
      expect(presented.rotatedAt?.getTime()).toBe(retry.issued.session.issuedAt.getTime());

      // The successor nobody received is revoked, so a response that was
      // intercepted rather than dropped is worth nothing to whoever took it.
      expect(await authService.getSession(rotation.issued.token)).toBeNull();
    });

    it('leaves a delivered-but-unused successor alone on an ordinary request', async () => {
      // `firstUsedAt: null` proves a successor was never PRESENTED, which is
      // weaker than never DELIVERED: a member route that renders without calling
      // the backend leaves its successor unspent in the jar until the next
      // navigation. Recovering on that would revoke the token the browser is
      // holding and hand the session to whoever presented the retired one first,
      // so only `rotateSession` may do it.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();

      // Refused, and nothing else: no second holder was proven, so the family is
      // intact and the successor the browser is holding still works.
      expect(await prisma.session.count({ where: { revokedAt: { not: null } } })).toBe(0);
      expect(await authService.getSession(rotation.issued.token)).not.toBeNull();
    });

    it('survives two requests racing the same recovery', async () => {
      // A page render fans several calls out at once, all carrying the same
      // cookie, so both requests can hold a reading taken before either wrote.
      // The claim is guarded on the exact `rotatedAt` that reading carried:
      // without that guard the loser revoked the successor the winner had just
      // minted and handed to the browser, and the next request was a silent
      // sign-out.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const lost = await authService.rotateSession(issued.token);
      if (lost.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      const [first, second] = await Promise.all([
        authService.rotateSession(issued.token),
        authService.rotateSession(issued.token),
      ]);

      // Neither racer is told the session is over...
      expect(first.status).not.toBe('invalid');
      expect(second.status).not.toBe('invalid');

      // ...and the family ends on exactly one live current token, whichever of
      // them minted it.
      const current = await prisma.session.findMany({
        where: { revokedAt: null, rotatedAt: null },
        select: { sessionId: true },
      });
      expect(current).toHaveLength(1);

      const rotated = [first, second].find((outcome) => outcome.status === 'rotated');
      if (rotated?.status !== 'rotated') throw new Error('expected one racer to rotate');
      expect(rotated.issued.session.sessionId).toBe(current[0]?.sessionId);
    });

    it('re-runs the lost rotation on the next ask', async () => {
      // Recovery restores the state rotation started from, so the rotation that
      // was lost simply happens again — and this time its answer carries a token
      // the caller can store.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const lost = await authService.rotateSession(issued.token);
      if (lost.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      const retry = await authService.rotateSession(issued.token);
      if (retry.status !== 'rotated') throw new Error(`expected rotated, got ${retry.status}`);

      expect(retry.issued.token).not.toBe(issued.token);
      expect(retry.issued.token).not.toBe(lost.issued.token);
      expect(await authService.getSession(retry.issued.token)).not.toBeNull();
    });

    it('leaves a recovered family able to raise reuse on the next rotation', async () => {
      // The reason recovery un-retires the presented row rather than minting a
      // replacement for it. A second holder that kept a copy of the same token
      // is caught by the rotation that follows, exactly as it would have been by
      // the one that was lost.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const lost = await authService.rotateSession(issued.token);
      if (lost.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      // The owner recovers and rotates away; the copy is still on the old token.
      const retry = await authService.rotateSession(issued.token);
      if (retry.status !== 'rotated') throw new Error('expected rotated');
      expect(await authService.getSession(retry.issued.token)).not.toBeNull();
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();
      expect(await authService.getSession(retry.issued.token)).toBeNull();
      const rows = await prisma.session.findMany({
        where: { revokedAt: null },
        select: { sessionId: true },
      });
      expect(rows).toHaveLength(0);
    });

    it('does not recover once the successor has been used', async () => {
      // The whole gate, and the boundary of what recovery covers. The frontend
      // proxy forwards a rotated token into its own render, so a successor the
      // frontend received is a successor already spent. Being spent means a
      // second holder here, which is the alarm rather than a lost response to
      // undo — and a response dropped between the frontend and the browser lands
      // in this case too. SECURITY.md states that residual.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      expect(await authService.getSession(rotation.issued.token)).not.toBeNull();
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();
      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('raises reuse when a successor is spent mid-recovery, rather than refusing quietly', async () => {
      // The narrow race inside the recovery. The probe that chooses between a
      // lost response and a second holder finds no used successor, and one is
      // spent before the transaction reads the family again — so the recovery
      // puts its claim back and the presented token stays retired.
      //
      // A plain refusal there filed a real theft as an ordinary sign-out. The
      // caller is `rotateSession`, whose `invalid` sends the proxy to `/logout`,
      // and `logout` revokes the family under `reason: 'logout'`. Nothing waits
      // to catch it on a later presentation, because there is no later
      // presentation.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      // Forced rather than raced, so it is deterministic: the successor comes
      // into use in the gap the recovery cannot see across. The recovery's is
      // the first transaction on this path, and `mockImplementationOnce` leaves
      // the rotation's own claim alone.
      const openTransaction = prisma.$transaction.bind(prisma);
      const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce((async (
        run: unknown,
      ) => {
        expect(await authService.getSession(rotation.issued.token)).not.toBeNull();
        return openTransaction(run as never);
      }) as never);
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      try {
        expect((await authService.rotateSession(issued.token)).status).toBe('invalid');

        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: BACKEND_LOG_EVENTS['auth.session.reuse_detected'],
            familyId: issued.session.sessionId,
            supersededSessionId: issued.session.sessionId,
          }),
        );
      } finally {
        warn.mockRestore();
        spy.mockRestore();
      }

      // And the family is over, revoked by the alarm rather than by the
      // sign-out the proxy would have driven next.
      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('ends the family on a sign-out that follows a lost rotation response', async () => {
      // `logout` looks a token up unfiltered on purpose — a retired token still
      // names its family — so signing out of a recovered session takes the
      // successor nobody ever received with it.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      await expireGraceWindow(issued.session.sessionId);

      await authService.logout(issued.token);

      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('still raises reuse when the used successor is not the family’s current token', async () => {
      // Two rotations deep: a second holder keeps the first token, the browser
      // moved on to the second, and the third was minted but never delivered.
      // The family's CURRENT token being unused must not excuse a token retired
      // two rotations back — what counts is whether anything minted after that
      // retirement was used, not whether the newest row was.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const first = await authService.rotateSession(issued.token);
      if (first.status !== 'rotated') throw new Error('expected rotated');

      await makeRotationDue(first.issued.session.sessionId);
      const second = await authService.rotateSession(first.issued.token);
      if (second.status !== 'rotated') throw new Error('expected rotated');

      // `makeRotationDue` backdated the middle token to force that second
      // rotation, which leaves it looking older than the token it succeeded.
      // Put the family back in its real order before asserting on a check that
      // reads that order.
      await prisma.session.update({
        where: { sessionId: first.issued.session.sessionId },
        data: { issuedAt: new Date() },
      });
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();
      expect(await authService.getSession(second.issued.token)).toBeNull();
      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('refuses to rotate a retired token after the grace window once a successor is in use', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      expect(await authService.getSession(rotation.issued.token)).not.toBeNull();
      await expireGraceWindow(issued.session.sessionId);

      expect((await authService.rotateSession(issued.token)).status).toBe('invalid');
    });

    it('reports a session revoked mid-rotation as invalid, not superseded', async () => {
      // `superseded` tells the caller to carry on because someone else holds the
      // successor. A row revoked out from under the claim — a sign-out in
      // another tab — refuses the same guarded write for a different reason, and
      // carrying on there renders a page whose every backend call then 401s.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);

      // The claim is only reachable once `resolveSession` has read a live row,
      // so land the revoke in the gap between the two. `rotateSession` is the
      // only thing on this path that opens a transaction.
      const openTransaction = prisma.$transaction.bind(prisma);
      const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce((async (
        run: unknown,
      ) => {
        await prisma.session.update({
          where: { sessionId: issued.session.sessionId },
          data: { revokedAt: new Date() },
        });
        return openTransaction(run as never);
      }) as never);

      try {
        expect((await authService.rotateSession(issued.token)).status).toBe('invalid');
      } finally {
        spy.mockRestore();
      }
    });

    it('does not raise reuse when a retired token is presented after sign-out', async () => {
      // A browser holding a stale cookie after logout is not a thief, and the
      // family is already revoked — an alarm here would be noise on every
      // sign-out that happened to follow a rotation.
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      await authService.logout(rotation.issued.token);
      await expireGraceWindow(issued.session.sessionId);

      expect(await authService.getSession(issued.token)).toBeNull();
      expect((await authService.rotateSession(issued.token)).status).toBe('invalid');
    });

    it('revokes every token in the family on logout, not just the presented one', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      await authService.logout(rotation.issued.token);

      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('lets exactly one of two concurrent rotations win', async () => {
      const issued = await signIn();
      await makeRotationDue(issued.session.sessionId);

      const [first, second] = await Promise.all([
        authService.rotateSession(issued.token),
        authService.rotateSession(issued.token),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual(['rotated', 'superseded']);

      // One successor, not two — a family with two live tokens would leave the
      // browser holding whichever cookie happened to arrive last.
      expect(await prisma.session.count({ where: { rotatedAt: null } })).toBe(1);
    });

    it('refuses to rotate a session whose owner was soft-deleted', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const issued = await authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });
      await makeRotationDue(issued.session.sessionId);
      await prisma.user.update({
        where: { userId: account.userId },
        data: { deletedAt: new Date() },
      });

      expect((await authService.rotateSession(issued.token)).status).toBe('invalid');
    });

    it('refuses to rotate a garbage token instead of throwing', async () => {
      expect((await authService.rotateSession('not-a-real-token' as SessionToken)).status).toBe(
        'invalid',
      );
    });
  });

  describe('rehash on login', () => {
    /** Replaces a live account's stored hash with one produced some other way. */
    async function storeLegacyHash(
      userId: string,
      options: { readonly cost?: Record<string, number>; readonly hashVersion: number },
    ): Promise<string> {
      const passwordHash = await argon2Hash(REGISTER_INPUT.password, {
        ...CURRENT_ARGON2_COST,
        ...(options.cost ?? {}),
      });
      await prisma.user.update({
        where: { userId },
        data: { passwordHash, hashVersion: options.hashVersion },
      });
      return passwordHash;
    }

    async function storedCredential(
      userId: string,
    ): Promise<{ passwordHash: string; hashVersion: number }> {
      return prisma.user.findFirstOrThrow({
        where: { userId },
        select: { passwordHash: true, hashVersion: true },
      });
    }

    it('leaves a password already at the current settings alone', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const before = await storedCredential(account.userId);

      await authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });

      // Byte-identical: a rehash would salt afresh and produce a different digest.
      expect(await storedCredential(account.userId)).toEqual(before);
    });

    it('rehashes a password stored below the configured argon2 cost', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const legacy = await storeLegacyHash(account.userId, {
        cost: { timeCost: 3 },
        hashVersion: 1,
      });
      expect(needsRehash(legacy, CURRENT_ARGON2_COST)).toBe(true);

      await authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });

      const after = await storedCredential(account.userId);
      expect(after.passwordHash).not.toBe(legacy);
      expect(needsRehash(after.passwordHash, CURRENT_ARGON2_COST)).toBe(false);
      expect(after.hashVersion).toBe(1);
    });

    it('rehashes a password stored under an older scheme even at the current cost', async () => {
      // `needsRehash` cannot see this one — the cost parameters match and only
      // the version column says the scheme moved. That is the case the column
      // exists for.
      const account = await authService.register(REGISTER_INPUT);
      const legacy = await storeLegacyHash(account.userId, { hashVersion: 0 });
      expect(needsRehash(legacy, CURRENT_ARGON2_COST)).toBe(false);

      await authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });

      const after = await storedCredential(account.userId);
      expect(after.passwordHash).not.toBe(legacy);
      expect(after.hashVersion).toBe(1);
    });

    it('still authenticates when the rehash write fails', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const legacy = await storeLegacyHash(account.userId, { hashVersion: 0 });
      const spy = jest
        .spyOn(prisma.user, 'updateMany')
        .mockRejectedValueOnce(new Error('database is on fire'));

      try {
        const issued = await authService.login({
          email: REGISTER_INPUT.email,
          password: REGISTER_INPUT.password,
        });
        expect(issued.session.userId).toBe(account.userId);
      } finally {
        spy.mockRestore();
      }

      // Unchanged, and the next sign-in will try again.
      expect((await storedCredential(account.userId)).passwordHash).toBe(legacy);
    });

    it('does not rehash on a failed login', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const legacy = await storeLegacyHash(account.userId, { hashVersion: 0 });

      await expectAuthErrorCode(
        authService.login({ email: REGISTER_INPUT.email, password: 'wrong-password-1' }),
        'INVALID_CREDENTIALS',
      );

      expect((await storedCredential(account.userId)).passwordHash).toBe(legacy);
    });
  });

  describe('listing and revoking a member’s own sessions', () => {
    async function signInAgain(): Promise<SessionIssued> {
      return authService.login({
        email: REGISTER_INPUT.email,
        password: REGISTER_INPUT.password,
      });
    }

    it('returns one entry per sign-in, marking the caller’s own', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const first = await signInAgain();
      const second = await signInAgain();

      const list = await authService.listActiveSessions(account.userId, second.session.sessionId);

      expect(list.truncated).toBe(false);
      expect(list.sessions).toHaveLength(2);
      // Most recently started first.
      expect(list.sessions.map((entry) => entry.sessionId)).toEqual([
        second.session.sessionId,
        first.session.sessionId,
      ]);
      expect(list.sessions.map((entry) => entry.current)).toEqual([true, false]);
      expect(list.sessions[0]?.expiresAt.getTime()).toBe(second.session.expiresAt.getTime());
    });

    it('counts a rotated sign-in once and keeps its id and start time', async () => {
      // A row is one token; a week-old browser owns a hundred-odd of them. The
      // listing is per sign-in or it is useless for the thing it exists for.
      const account = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      await prisma.session.update({
        where: { sessionId: issued.session.sessionId },
        data: { issuedAt: new Date(Date.now() - 2 * 3_600 * 1000) },
      });
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      expect(await prisma.session.count()).toBe(2);

      const list = await authService.listActiveSessions(
        account.userId,
        rotation.issued.session.sessionId,
      );

      expect(list.sessions).toHaveLength(1);
      expect(list.sessions[0]?.sessionId).toBe(issued.session.sessionId);
      expect(list.sessions[0]?.current).toBe(true);
      // The sign-in's start, not the successor token's mint time.
      expect(list.sessions[0]?.startedAt.getTime()).toBeLessThan(
        rotation.issued.session.issuedAt.getTime(),
      );
    });

    it('omits revoked and expired sign-ins', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const kept = await signInAgain();
      const signedOut = await signInAgain();
      const stale = await signInAgain();

      await authService.logout(signedOut.token);
      await prisma.session.update({
        where: { sessionId: stale.session.sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const list = await authService.listActiveSessions(account.userId, kept.session.sessionId);
      expect(list.sessions.map((entry) => entry.sessionId)).toEqual([kept.session.sessionId]);
    });

    it('never lists another account’s sign-ins', async () => {
      const mine = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      const theirs = await authService.register({ ...REGISTER_INPUT, email: 'bo@example.com' });
      await authService.issueSessionForAccount(theirs.userId);

      const list = await authService.listActiveSessions(mine.userId, issued.session.sessionId);
      expect(list.sessions.map((entry) => entry.sessionId)).toEqual([issued.session.sessionId]);
    });

    it('reports truncation rather than showing a partial list as a whole one', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      for (let i = 0; i < 20; i += 1) {
        await authService.issueSessionForAccount(account.userId);
      }

      const list = await authService.listActiveSessions(account.userId, issued.session.sessionId);
      expect(list.sessions).toHaveLength(20);
      expect(list.truncated).toBe(true);
    });

    it('ends every sign-in when nothing is kept', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const first = await signInAgain();
      const second = await signInAgain();

      expect(await authService.revokeAllSessions(account.userId, null)).toBe(2);

      expect(await authService.getSession(first.token)).toBeNull();
      expect(await authService.getSession(second.token)).toBeNull();
    });

    it('spares the caller’s sign-in, and only that one', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const keep = await signInAgain();
      const other = await signInAgain();

      expect(await authService.revokeAllSessions(account.userId, keep.session.sessionId)).toBe(1);

      expect(await authService.getSession(keep.token)).not.toBeNull();
      expect(await authService.getSession(other.token)).toBeNull();
    });

    it('spares the whole family behind the kept token, not just its row', async () => {
      // Sparing one row would leave the caller holding a token whose ancestors
      // were revoked, and the next rotation would read its own family as dead.
      const account = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      await prisma.session.update({
        where: { sessionId: issued.session.sessionId },
        data: { issuedAt: new Date(Date.now() - 2 * 3_600 * 1000) },
      });
      const rotation = await authService.rotateSession(issued.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');

      await authService.revokeAllSessions(account.userId, rotation.issued.session.sessionId);

      const rows = await prisma.session.findMany({ select: { revokedAt: true } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt === null)).toBe(true);
    });

    it('revokes every token of an ended sign-in, ancestors included', async () => {
      // A retired ancestor left unrevoked is what reuse detection reads.
      const account = await authService.register(REGISTER_INPUT);
      const doomed = await signInAgain();
      await prisma.session.update({
        where: { sessionId: doomed.session.sessionId },
        data: { issuedAt: new Date(Date.now() - 2 * 3_600 * 1000) },
      });
      const rotation = await authService.rotateSession(doomed.token);
      if (rotation.status !== 'rotated') throw new Error('expected rotated');
      const keep = await signInAgain();

      expect(await authService.revokeAllSessions(account.userId, keep.session.sessionId)).toBe(1);

      const revoked = await prisma.session.findMany({
        where: { familyId: doomed.session.sessionId },
        select: { revokedAt: true },
      });
      expect(revoked).toHaveLength(2);
      expect(revoked.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it('leaves another account’s sign-ins alone', async () => {
      const mine = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      const theirs = await authService.register({ ...REGISTER_INPUT, email: 'bo@example.com' });
      const theirSession = await authService.issueSessionForAccount(theirs.userId);

      await authService.revokeAllSessions(mine.userId, null);

      expect(await authService.getSession(issued.token)).toBeNull();
      expect(await authService.getSession(theirSession.token)).not.toBeNull();
    });

    it('counts nothing when there is nothing live to revoke', async () => {
      const account = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();

      expect(await authService.revokeAllSessions(account.userId, issued.session.sessionId)).toBe(0);
    });

    it('refuses when the sign-in to keep no longer resolves (SESSION_INVALID)', async () => {
      // The caller asked to keep something; falling through to revoking
      // everything would answer a different question.
      const account = await authService.register(REGISTER_INPUT);
      const issued = await signInAgain();
      await prisma.session.delete({ where: { sessionId: issued.session.sessionId } });

      await expectAuthErrorCode(
        authService.revokeAllSessions(account.userId, issued.session.sessionId),
        'SESSION_INVALID',
      );
    });
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
