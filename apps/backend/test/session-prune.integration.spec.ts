import { Logger, type INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';

import { SESSION_PRUNE_INTERVAL_NAME } from '../src/auth/session-prune.service';
import { BACKEND_LOG_EVENTS } from '../src/common/logging/log-events';
import type { SessionPruneService } from '../src/auth/session-prune.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { applyAppModuleTestEnv } from './helpers/app-module-test-env';

const HOUR_MS = 60 * 60 * 1000;

/**
 * `sessions` is Archetype B — hard-deleted once dead — and until
 * `SessionPruneService` existed nothing deleted a row, so the table grew by one
 * per login and retained the token hash of every dead session forever.
 *
 * The sweep is driven directly rather than through its timer: the interval
 * default is an hour, and a spec that waits for a real tick is a spec that
 * either sleeps for an hour or asserts nothing. The timer's own wiring —
 * registered, named, and torn down — is asserted separately below.
 */
describe('Session pruning (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pruneService: SessionPruneService;
  let scheduler: SchedulerRegistry;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    applyAppModuleTestEnv(3193);
    // Pruning resolves to OFF under test (env.schema.ts) so a background sweep
    // cannot race another suite's `session.deleteMany()` cleanup. This suite is
    // the one that wants it, so it opts back in — including the timer, which it
    // asserts is registered.
    process.env['AUTH_SESSION_PRUNE_ENABLED'] = 'true';
    // Both bounds are dialled down together: two rows per statement, four
    // statements per sweep. The shipped 500 × 200 would need 100,001 rows to
    // show either of them working.
    process.env['AUTH_SESSION_PRUNE_BATCH_SIZE'] = '2';
    process.env['AUTH_SESSION_PRUNE_MAX_BATCHES'] = '4';

    const { AppModule } = await import('../src/app.module.js');
    const { SessionPruneService: SessionPruneServiceClass } =
      await import('../src/auth/session-prune.service.js');
    const { PrismaService: PrismaServiceClass } = await import('../src/prisma/prisma.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    prisma = app.get(PrismaServiceClass);
    pruneService = app.get(SessionPruneServiceClass);
    scheduler = app.get(SchedulerRegistry);
  });

  afterAll(async () => {
    await app.close();
    process.env = previousEnv;
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createUser(email: string): Promise<string> {
    const userId = uuidv7();
    await prisma.user.create({
      data: {
        userId,
        name: 'Ada Whitcombe',
        email,
        passwordHash: 'not-a-real-hash',
        consent: true,
      },
    });
    return userId;
  }

  async function createSession(
    userId: string,
    { expiresAt, revokedAt }: { expiresAt: Date; revokedAt?: Date },
  ): Promise<string> {
    const sessionId = uuidv7();
    await prisma.session.create({
      data: {
        sessionId,
        userId,
        // A session that was never rotated is the only member of its own family.
        familyId: sessionId,
        tokenHash: `hash-${sessionId}`,
        expiresAt,
        revokedAt: revokedAt ?? null,
      },
    });
    return sessionId;
  }

  it('registers the sweep timer under a stable name', () => {
    expect(scheduler.doesExist('interval', SESSION_PRUNE_INTERVAL_NAME)).toBe(true);
  });

  it('deletes expired sessions and leaves live ones alone', async () => {
    const userId = await createUser('ada@example.com');
    const expired = await createSession(userId, { expiresAt: new Date(Date.now() - HOUR_MS) });
    const live = await createSession(userId, { expiresAt: new Date(Date.now() + HOUR_MS) });

    expect(await pruneService.sweep()).toBe(1);

    const remaining = await prisma.session.findMany({ select: { sessionId: true } });
    expect(remaining.map((session) => session.sessionId)).toEqual([live]);
    expect(remaining.map((session) => session.sessionId)).not.toContain(expired);
  });

  it('keeps taking batches until the table is clean', async () => {
    // AUTH_SESSION_PRUNE_BATCH_SIZE is 2 for this suite, so five expired rows
    // cannot come out in one statement — the sweep has to loop.
    const userId = await createUser('ada@example.com');
    for (let index = 0; index < 5; index += 1) {
      await createSession(userId, { expiresAt: new Date(Date.now() - HOUR_MS) });
    }

    expect(await pruneService.sweep()).toBe(5);
    expect(await prisma.session.count()).toBe(0);
  });

  it('leaves a revoked-but-unexpired session in place until it expires', async () => {
    // Deliberate: the row IS the record that the session was revoked, and it
    // becomes prunable on its own within AUTH_SESSION_TTL_SECONDS. Rejecting it
    // in the meantime is AuthService.getSession's job, not this sweep's.
    const userId = await createUser('ada@example.com');
    const revoked = await createSession(userId, {
      expiresAt: new Date(Date.now() + HOUR_MS),
      revokedAt: new Date(),
    });

    expect(await pruneService.sweep()).toBe(0);
    expect(await prisma.session.count({ where: { sessionId: revoked } })).toBe(1);
  });

  it('stops on its batch ceiling, warns, and leaves the rest for the next tick', async () => {
    // The ceiling is what has to keep up with rotation: one sign-in owns a row
    // per interval and they all expire together, so a sweep that never stopped
    // could hold the connection for an unbounded stretch. Four batches of two
    // take eight rows; the ninth is what proves the loop stopped on the ceiling
    // rather than on an empty table.
    const userId = await createUser('ada@example.com');
    for (let index = 0; index < 9; index += 1) {
      await createSession(userId, { expiresAt: new Date(Date.now() - HOUR_MS) });
    }

    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      expect(await pruneService.sweep()).toBe(8);
      expect(await prisma.session.count()).toBe(1);

      // The message names the knob, because an operator seeing this every tick
      // is the only signal that the table is growing faster than it drains.
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: BACKEND_LOG_EVENTS['system.session_prune.completed'],
          message: expect.stringContaining('AUTH_SESSION_PRUNE_MAX_BATCHES'),
          deleted: 8,
          batches: 4,
        }),
      );
    } finally {
      warn.mockRestore();
    }

    expect(await pruneService.sweep()).toBe(1);
  });

  it('is idempotent — a second sweep over a clean table deletes nothing', async () => {
    const userId = await createUser('ada@example.com');
    await createSession(userId, { expiresAt: new Date(Date.now() - HOUR_MS) });

    expect(await pruneService.sweep()).toBe(1);
    expect(await pruneService.sweep()).toBe(0);
  });
});
