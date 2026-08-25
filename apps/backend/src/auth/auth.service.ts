import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma } from '@prisma/client';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import { MIN_PASSWORD_LENGTH } from '@repo/schema';

import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { isUniqueConstraintError } from '../common/prisma/unique-constraint';
import { isUuid } from '../common/utils/uuid';
import { type Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { AuthError } from './auth.errors';
import type {
  Account,
  LoginCredentials,
  RegisterInput,
  Session,
  SessionIssued,
  SessionToken,
  UserId,
} from './auth.types';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Account projection returned to callers; excludes credential and token hashes. */
const ACCOUNT_SELECT = {
  userId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const LOGIN_SELECT = {
  userId: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

const SESSION_SELECT = {
  sessionId: true,
  userId: true,
  issuedAt: true,
  expiresAt: true,
  revokedAt: true,
} satisfies Prisma.SessionSelect;

type AccountRow = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;

function toAccount(user: AccountRow): Account {
  return {
    userId: user.userId as UserId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Argon2id cost parameters, resolved once from validated env at construction.
 * Defaults pin the library's production-strength values; the env knobs exist
 * so the test suite can hash throwaway accounts cheaply (env.schema.ts carries
 * the rationale and the staging/production fail-closed floor).
 */
interface Argon2CostOptions {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  private readonly argon2Cost: Argon2CostOptions;

  /**
   * Per-process dummy argon2 hash used as a timing-equivalence target on the
   * unknown-email path of `login`. The plaintext is irrelevant — the hash is
   * never used to authenticate anyone. It must be a real argon2 hash with the
   * same parameters the service uses for live passwords so the verify cost
   * matches.
   *
   * Started at construction and awaited in `onApplicationBootstrap`, so it is
   * settled before the server accepts its first request. Starting it early is
   * not sufficient on its own: an unknown-email login arriving while the hash
   * is still in flight waits out the remainder of it, whereas a wrong-password
   * login on a real account only pays for the verify. That difference is a
   * restart-window enumeration signal, and awaiting at bootstrap closes it.
   */
  private readonly dummyPasswordHashPromise: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.argon2Cost = {
      memoryCost: this.config.get('AUTH_ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: this.config.get('AUTH_ARGON2_TIME_COST', { infer: true }),
      parallelism: this.config.get('AUTH_ARGON2_PARALLELISM', { infer: true }),
    };
    this.dummyPasswordHashPromise = argon2Hash('not-a-real-password', this.argon2Cost);
  }

  /**
   * Nest awaits this across every provider before `app.listen()` resolves, so
   * the timing-equalization hash is ready before any login can be served.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.dummyPasswordHashPromise;
  }

  /** Registers a new account. Consent is a hard gate, not a stored preference. */
  async register(input: RegisterInput): Promise<Account> {
    if (input.consent !== true) {
      this.logger.warn({
        event: BACKEND_LOG_EVENTS['auth.register.denied_consent'],
        message: 'Registration rejected: consent not given.',
        reason: 'CONSENT_REQUIRED',
      });
      throw new AuthError('CONSENT_REQUIRED');
    }

    // Defense in depth behind the DTO's MinLength — this service is also the
    // boundary for server-side compositions that bypass the HTTP layer.
    if (typeof input.password !== 'string' || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError('INVALID_CREDENTIALS', 'password too short');
    }

    const passwordHash = await argon2Hash(input.password, this.argon2Cost);

    let user: AccountRow;
    try {
      user = await this.prisma.user.create({
        data: {
          userId: uuidv7(),
          name: input.name.trim(),
          email: normalizeEmail(input.email),
          passwordHash,
          consent: true,
        },
        select: ACCOUNT_SELECT,
      });
    } catch (error: unknown) {
      // `users` carries a single unique constraint (the partial active-email
      // index), so no constraint-target inspection is needed here.
      if (isUniqueConstraintError(error)) {
        this.logger.warn({
          event: BACKEND_LOG_EVENTS['auth.register.failure'],
          message: 'Registration rejected: email already registered.',
          reason: 'EMAIL_ALREADY_REGISTERED',
        });
        throw new AuthError('EMAIL_ALREADY_REGISTERED');
      }
      throw error;
    }

    this.logger.log({
      event: BACKEND_LOG_EVENTS['auth.register.success'],
      message: 'Account registered.',
      userId: user.userId,
    });

    return toAccount(user);
  }

  /** Validates email/password credentials and issues a revocable session. */
  async login(credentials: LoginCredentials): Promise<SessionIssued> {
    const user = await this.prisma.user.findFirst({
      where: { email: normalizeEmail(credentials.email), deletedAt: null },
      select: LOGIN_SELECT,
    });

    if (user === null) {
      // Timing-equivalence defense: still spend ~argon2-verify time so the
      // unknown-email path is indistinguishable from the wrong-password path.
      // See `dummyPasswordHashPromise` above.
      await argon2Verify(await this.dummyPasswordHashPromise, credentials.password).catch(
        () => false,
      );
      this.logger.warn({
        event: BACKEND_LOG_EVENTS['auth.login.failure_unknown_account'],
        message: 'Login rejected: no matching account.',
        reason: 'INVALID_CREDENTIALS',
      });
      throw new AuthError('INVALID_CREDENTIALS');
    }

    const passwordOk = await argon2Verify(user.passwordHash, credentials.password);
    if (!passwordOk) {
      this.logger.warn({
        event: BACKEND_LOG_EVENTS['auth.login.failure_password_mismatch'],
        message: 'Login rejected: password mismatch.',
        reason: 'INVALID_CREDENTIALS',
        userId: user.userId,
      });
      throw new AuthError('INVALID_CREDENTIALS');
    }

    const issued = await this.issueSession(user.userId as UserId);
    this.logger.log({
      event: BACKEND_LOG_EVENTS['auth.login.success'],
      message: 'Session issued.',
      userId: user.userId,
    });

    return issued;
  }

  /**
   * Issues a session for a freshly created account as part of registration
   * (signup is itself a login). Trusted server-side composition only — the
   * caller is responsible for having just authenticated the user. MUST NOT be
   * exposed directly to browsers.
   */
  async issueSessionForAccount(userId: UserId): Promise<SessionIssued> {
    if (!isUuid(userId)) {
      throw new AuthError('ACCOUNT_NOT_FOUND', 'unknown account');
    }
    const user = await this.prisma.user.findFirst({
      where: { userId, deletedAt: null },
      select: { userId: true },
    });
    if (user === null) {
      throw new AuthError('ACCOUNT_NOT_FOUND', 'unknown account');
    }

    const issued = await this.issueSession(user.userId as UserId);

    this.logger.log({
      event: BACKEND_LOG_EVENTS['auth.register.session_issued'],
      message: 'Session issued for newly registered account.',
      userId: user.userId,
      sessionId: issued.session.sessionId,
    });

    return issued;
  }

  /** Revokes the session matching the raw bearer token, if one exists. */
  async logout(session: SessionToken): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(session), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Guarded by `revokedAt: null`, so a repeated logout revokes nothing and
    // the whole path stays a no-op.
    if (result.count > 0) {
      this.logger.log({
        event: BACKEND_LOG_EVENTS['auth.logout.success'],
        message: 'Session revoked.',
      });
    }
  }

  /**
   * Resolves active session metadata from a raw bearer token.
   *
   * EVERY LIVENESS CONDITION IS IN THE WHERE CLAUSE, INCLUDING THE OWNER'S.
   * This used to `findUnique` on the token hash and then filter `revokedAt`
   * and `expiresAt` in JS — which had no way to express the fourth condition,
   * `user.deletedAt IS NULL`, because `findUnique` takes no relation filters.
   * So it never checked it: `login` refused a soft-deleted account, but any
   * session already issued to that account kept working until its 7-day TTL ran
   * out. Deleting a user did not sign them out, and the schema comment saying
   * an account's password hash is replaced with an unusable sentinel implied it
   * did.
   *
   * `findFirst` is what makes all four expressible together. It still resolves
   * through the unique index on `token_hash`, and the resulting query returns a
   * row only when the session is genuinely usable.
   */
  async getSession(token: SessionToken): Promise<Session | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: SESSION_SELECT,
    });

    if (session === null) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      userId: session.userId as UserId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    };
  }

  /**
   * Returns the public account projection for an active user. Controllers use
   * this instead of reaching into Prisma after session resolution.
   */
  async getUserById(userId: UserId): Promise<Account | null> {
    if (!isUuid(userId)) {
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { userId, deletedAt: null },
      select: ACCOUNT_SELECT,
    });
    return user === null ? null : toAccount(user);
  }

  /** Issues a new session and returns the bearer token exactly once. */
  private async issueSession(userId: UserId): Promise<SessionIssued> {
    const rawToken = generateOpaqueToken();
    const ttlSeconds = this.config.get('AUTH_SESSION_TTL_SECONDS', { infer: true });
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const session = await this.prisma.session.create({
      data: {
        sessionId: uuidv7(),
        userId,
        tokenHash: hashToken(rawToken),
        issuedAt,
        expiresAt,
      },
      select: SESSION_SELECT,
    });

    return {
      session: {
        sessionId: session.sessionId,
        userId,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      },
      token: rawToken as SessionToken,
    };
  }
}
