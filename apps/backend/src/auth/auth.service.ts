import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma } from '@prisma/client';
import { hash as argon2Hash, needsRehash, verify as argon2Verify } from 'argon2';
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
  ActiveSession,
  ActiveSessionList,
  LoginCredentials,
  RegisterInput,
  Session,
  SessionIssued,
  SessionRevocationReason,
  SessionRotation,
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
  hashVersion: true,
} satisfies Prisma.UserSelect;

const SESSION_SELECT = {
  sessionId: true,
  userId: true,
  familyId: true,
  issuedAt: true,
  expiresAt: true,
  rotatedAt: true,
  firstUsedAt: true,
  revokedAt: true,
} satisfies Prisma.SessionSelect;

/**
 * How many live sign-ins one listing returns.
 *
 * A bounded read rather than a cursor contract, on the same reasoning as the
 * dashboard summary: the number of browsers one person is signed in on is small
 * by nature, and a paging contract on it would be scaffolding the account page
 * has to carry for nothing. The listing reports {@link ActiveSessionList.truncated}
 * when it hits this, so nobody is shown a partial list as a complete one.
 */
const ACTIVE_SESSION_LIMIT = 20;

/** The current token of a live sign-in — one row per family. */
const ACTIVE_SESSION_SELECT = {
  familyId: true,
  issuedAt: true,
  firstUsedAt: true,
  expiresAt: true,
} satisfies Prisma.SessionSelect;

/** The token a family is named after; its `issuedAt` is when the sign-in began. */
const SESSION_FAMILY_ROOT_SELECT = {
  sessionId: true,
  issuedAt: true,
} satisfies Prisma.SessionSelect;

type AccountRow = Prisma.UserGetPayload<{ select: typeof ACCOUNT_SELECT }>;
type LoginRow = Prisma.UserGetPayload<{ select: typeof LOGIN_SELECT }>;
type SessionRow = Prisma.SessionGetPayload<{ select: typeof SESSION_SELECT }>;

/**
 * A resolved session plus whether the token that resolved it has already been
 * rotated away. `superseded` rows are usable — that is what the grace window
 * buys — but they must never be rotated again, so the two cases stay
 * distinguishable inside the service and collapse to one `Session` outside it.
 */
interface ResolvedSession {
  readonly row: SessionRow;
  readonly superseded: boolean;
}

/**
 * What the guarded claim inside `rotateSession`'s transaction settled. Kept
 * separate from {@link SessionRotation} because the transaction cannot compute
 * `nextRotationInSeconds` — that reads a clock, and this returns a verdict.
 */
type RotationClaim =
  | { readonly outcome: 'rotated'; readonly successor: SessionRow }
  | { readonly outcome: 'superseded' }
  | { readonly outcome: 'invalid' };

/**
 * What the guarded claim inside `recoverUndeliveredRotation`'s transaction
 * settled. `contested` means another request moved the presented row between the
 * read that chose recovery and the write that would have carried it out, so the
 * answer is whatever that request left behind rather than anything this one
 * computed from a stale reading. `reuse` means a successor came into use inside
 * that same gap, which makes the presented token a second holder's after all.
 */
type RecoveryClaim =
  | { readonly outcome: 'recovered'; readonly row: SessionRow }
  | { readonly outcome: 'contested' }
  | { readonly outcome: 'reuse' }
  | { readonly outcome: 'refused' };

/**
 * Whether this resolution may undo a rotation whose response never reached the
 * browser. Only `rotateSession` passes it; `recoverUndeliveredRotation` says why
 * the other callers must not.
 */
interface SessionResolveOptions {
  readonly recoverLostRotation?: boolean;
}

/** Public session projection. Lineage and rotation state stay inside this service. */
function toSession(row: SessionRow): Session {
  return {
    sessionId: row.sessionId,
    userId: row.userId as UserId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

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
 * The password-hashing scheme `users.password_hash` currently holds: argon2id
 * at the `AUTH_ARGON2_*` cost. Bump it when the SCHEME changes — a different
 * argon2 variant, a peppered hash, a different algorithm entirely — and leave
 * it alone when only the cost moves, which `argon2.needsRehash` already sees.
 *
 * `login` dispatches on it (see `rehashPasswordIfStale`), which is what makes
 * the column worth writing: without a reader it records a scheme nothing can
 * migrate away from.
 */
const PASSWORD_HASH_VERSION = 1;

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

  /** How old the current token must be before `rotateSession` re-issues it. */
  private readonly rotateAfterSeconds: number;

  /** How long a rotated-away token keeps resolving. See `env.schema.ts`. */
  private readonly rotationGraceSeconds: number;

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
    this.rotateAfterSeconds = this.config.get('AUTH_SESSION_ROTATE_AFTER_SECONDS', {
      infer: true,
    });
    this.rotationGraceSeconds = this.config.get('AUTH_SESSION_ROTATION_GRACE_SECONDS', {
      infer: true,
    });
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
          // Written rather than left to the column default, so the scheme that
          // produced the hash and the row recording it move in one place.
          hashVersion: PASSWORD_HASH_VERSION,
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

    // The one moment the plaintext is in hand and the account is proven — see
    // `rehashPasswordIfStale`. Awaited rather than left running: a floating
    // promise here would outlive the request that owns it.
    await this.rehashPasswordIfStale(user, credentials.password);

    const issued = await this.issueSession(user.userId as UserId);
    this.logger.log({
      event: BACKEND_LOG_EVENTS['auth.login.success'],
      message: 'Session issued.',
      userId: user.userId,
    });

    return issued;
  }

  /**
   * Re-hashes a verified password that is behind the current settings, and
   * leaves one that is not alone.
   *
   * A LOGIN IS THE ONLY MOMENT THIS CAN HAPPEN. The plaintext is not stored, so
   * raising `AUTH_ARGON2_*` protects accounts created afterwards and nothing
   * else: every existing row keeps its old cost until its owner signs in and
   * hands over the plaintext again. Without this the knobs are a one-way door
   * for new accounts only, and `users.hash_version` is a column nothing reads.
   *
   * Both checks run, because neither covers the other. `needsRehash` compares
   * the digest's embedded `m`/`t`/`p`/`version` against the configured cost,
   * which is the drift that happens when the numbers move; it does not compare
   * the argon2 variant and cannot see a change of scheme, which is what
   * {@link PASSWORD_HASH_VERSION} records.
   *
   * The write is guarded on the hash that was just verified, so a password
   * change or a concurrent rehash on another connection is never overwritten by
   * this one's re-derivation of an older value. Losing that race writes nothing
   * and is correct: the winner stored a hash of the same plaintext at the same
   * cost.
   *
   * A FAILURE HERE MUST NOT FAIL THE LOGIN. This is opportunistic maintenance on
   * a request that has already authenticated, so letting a write error escape
   * would turn a correct sign-in into a 500. It logs instead, and the next
   * sign-in retries.
   */
  private async rehashPasswordIfStale(user: LoginRow, password: string): Promise<void> {
    const stale =
      user.hashVersion !== PASSWORD_HASH_VERSION || needsRehash(user.passwordHash, this.argon2Cost);
    if (!stale) {
      return;
    }

    try {
      const passwordHash = await argon2Hash(password, this.argon2Cost);
      const result = await this.prisma.user.updateMany({
        where: { userId: user.userId, passwordHash: user.passwordHash, deletedAt: null },
        data: { passwordHash, hashVersion: PASSWORD_HASH_VERSION },
      });

      if (result.count > 0) {
        this.logger.log({
          event: BACKEND_LOG_EVENTS['auth.login.password_rehashed'],
          message: 'Password re-hashed at the current argon2 settings.',
          userId: user.userId,
          fromHashVersion: user.hashVersion,
          toHashVersion: PASSWORD_HASH_VERSION,
        });
      }
    } catch (error: unknown) {
      this.logger.warn({
        event: BACKEND_LOG_EVENTS['auth.login.password_rehash_failed'],
        message: 'Password re-hash failed; the login stands and the next one retries.',
        userId: user.userId,
        reason: error instanceof Error ? error.name : 'unknown',
      });
    }
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

  /**
   * Revokes the session behind the raw bearer token, if one exists.
   *
   * REVOKES THE WHOLE FAMILY, NOT THE PRESENTED ROW. Rotation means one sign-in
   * owns several rows, and revoking only the current one would leave its
   * superseded ancestors unrevoked. Those ancestors are what reuse detection
   * reads, so a token retired minutes before the sign-out would still be sitting
   * there looking live enough to raise an alarm about a browser that has already
   * left.
   *
   * The lookup is unfiltered on purpose: an already-revoked or already-expired
   * token still names its family, and the guarded revoke below is what makes a
   * repeat call a no-op.
   *
   * The revoke logs `auth.session.family_revoked` and this does not log again.
   * A second line on the same condition carried the same facts with fewer of
   * them, so a sign-out counter built on it double-counted against the event
   * that actually names the family and the row count.
   */
  async logout(session: SessionToken): Promise<void> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(session) },
      select: { familyId: true, userId: true },
    });

    if (row === null) {
      return;
    }

    await this.revokeSessionFamily(row.familyId, row.userId, 'logout');
  }

  /**
   * Resolves active session metadata from a raw bearer token.
   *
   * Callers that only need to know whether a request is authenticated use this.
   * Whether the token was the family's current one or a superseded one still
   * inside its grace window is a rotation concern, so it stays behind
   * {@link resolveSession}.
   */
  async getSession(token: SessionToken): Promise<Session | null> {
    const resolved = await this.resolveSession(token);
    return resolved === null ? null : toSession(resolved.row);
  }

  /**
   * Resolves a raw bearer token to the session behind it, and says whether that
   * token has already been rotated away.
   *
   * EVERY LIVENESS CONDITION IS IN THE WHERE CLAUSE, INCLUDING THE OWNER'S.
   * This used to `findUnique` on the token hash and filter in JS, which cannot
   * express the fourth condition at all: `findUnique` takes no relation filters,
   * so `user.deletedAt IS NULL` was never checked. `login` refused a
   * soft-deleted account while every session already issued to it kept working
   * until the 7-day TTL ran out, which meant deleting a user did not sign them
   * out.
   *
   * `findFirst` makes all four expressible together. It still resolves through
   * the unique index on `token_hash`, and returns a row only when the session is
   * genuinely usable. `rotatedAt: null` joins that clause with the arrival of
   * rotation, so the happy path stays one indexed query and still refuses
   * anything retired; the second query below runs only when the first found
   * nothing, which is a dead cookie.
   */
  private async resolveSession(
    token: SessionToken,
    { recoverLostRotation = false }: SessionResolveOptions = {},
  ): Promise<ResolvedSession | null> {
    const tokenHash = hashToken(token);

    const current = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        rotatedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: SESSION_SELECT,
    });

    if (current !== null) {
      await this.markFirstUse(current);
      return { row: current, superseded: false };
    }

    return this.resolveSupersededSession(tokenHash, recoverLostRotation);
  }

  /**
   * Stamps `firstUsedAt` the first time a token resolves, and never again.
   *
   * The stamp is what makes {@link resolveSupersededSession} able to tell a lost
   * rotation response from a copied token, and it costs one UPDATE per token
   * rather than one per request: the guard is on the column, and the row already
   * carries the value that decides whether to attempt it at all.
   *
   * Two requests racing the same first use both write, microseconds apart. The
   * column answers "was this ever used", so a lost tie changes nothing.
   */
  private async markFirstUse(row: SessionRow): Promise<void> {
    if (row.firstUsedAt !== null) {
      return;
    }

    await this.prisma.session.updateMany({
      where: { sessionId: row.sessionId, firstUsedAt: null },
      data: { firstUsedAt: new Date() },
    });
  }

  /**
   * The token did not resolve to a live current session. Work out whether it is
   * an ordinary dead cookie, a rotation this app failed to deliver, or the one
   * thing that cannot happen innocently: a token that was rotated away and is
   * being presented again by a second holder.
   *
   * The liveness conditions are in this WHERE clause too, and their absence is
   * what keeps the alarm quiet. A superseded row that is revoked, expired, or
   * owned by a deleted account is a stale cookie whose family is already over,
   * and treating that as theft would fire the alarm at every browser that kept a
   * cookie after signing out.
   *
   * What is left is a retired token whose family is still live. Inside the grace
   * window that is a request that was already in flight when the rotation
   * landed, and it is served. Outside it, `firstUsedAt` on the rest of the
   * family decides between the remaining two cases: a successor that has been
   * used means a second holder and fires the alarm, and one that never has means
   * the rotation's answer never reached the frontend.
   *
   * ONLY `rotateSession` MAY ACT ON THAT SECOND CASE. `firstUsedAt: null` proves
   * a successor was never presented, which is weaker than proving it was never
   * delivered: a member route that renders without calling the backend leaves
   * its successor unspent in the jar until the next navigation. Every
   * authenticated request could once reach the recovery below through that gap,
   * so a copied token presented inside it was recovered rather than refused.
   * `recoverLostRotation` narrows it to the caller that needs it.
   */
  private async resolveSupersededSession(
    tokenHash: string,
    recoverLostRotation: boolean,
  ): Promise<ResolvedSession | null> {
    const superseded = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        rotatedAt: { not: null },
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: SESSION_SELECT,
    });

    if (superseded === null) {
      return null;
    }

    // The WHERE clause above guarantees this; the Prisma types cannot express
    // that a `{ not: null }` filter narrows the selected field.
    const { rotatedAt } = superseded;
    if (rotatedAt === null) {
      return null;
    }

    const graceMs = this.rotationGraceSeconds * 1000;
    if (Date.now() - rotatedAt.getTime() <= graceMs) {
      return { row: superseded, superseded: true };
    }

    // Past the grace window, and the question is whether a SECOND holder exists.
    // One does if anything minted at or after this token was retired has since
    // been presented: the successor's raw value reached a browser, that browser
    // moved on, and something else is still holding the token it replaced.
    const usedSuccessor = await this.prisma.session.findFirst({
      where: {
        familyId: superseded.familyId,
        sessionId: { not: superseded.sessionId },
        issuedAt: { gte: rotatedAt },
        firstUsedAt: { not: null },
      },
      select: { sessionId: true },
    });

    // Nothing in the family was ever used after this token was retired, so the
    // successor's `Set-Cookie` reached nobody — a rotation call the frontend
    // could not complete, which an aborted or timed-out response produces. On
    // the rotation path that is a rotation to undo. Anywhere else it is refused
    // without an alarm, because nothing here has seen a second holder either.
    if (usedSuccessor === null) {
      return recoverLostRotation ? this.recoverUndeliveredRotation(superseded, rotatedAt) : null;
    }

    return this.reportSessionReuse(superseded);
  }

  /**
   * Fires the alarm and ends the sign-in behind a retired token that a second
   * holder is still presenting.
   *
   * Both callers reach the same conclusion by different routes:
   * {@link resolveSupersededSession} sees a successor that has already been
   * used, and {@link recoverUndeliveredRotation} sees one come into use while it
   * was mid-recovery. Neither may leave the revoke to the caller's sign-out —
   * `auth.session.reuse_detected` is the only event this stack produces that
   * names a specific compromised session, and a family revoked under
   * `reason: 'logout'` is indistinguishable from somebody clicking Sign out.
   *
   * Returns null so a caller can `return` it directly: reuse resolves to no
   * session, always.
   */
  private async reportSessionReuse(superseded: SessionRow): Promise<null> {
    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.session.reuse_detected'],
      message: 'Retired session token presented after its rotation grace window; revoking family.',
      reason: 'SESSION_TOKEN_REUSE',
      userId: superseded.userId,
      familyId: superseded.familyId,
      supersededSessionId: superseded.sessionId,
    });

    await this.revokeSessionFamily(superseded.familyId, superseded.userId, 'token_reuse');
    return null;
  }

  /**
   * Puts a family back the way it was before a rotation whose successor never
   * reached the frontend. The caller has already established all four
   * conditions: the presented token was retired, its family is still live,
   * nothing minted at or after that retirement has ever been used, and the
   * caller is `rotateSession` — the only one allowed here, for the reason
   * {@link resolveSupersededSession} gives.
   *
   * A successor's raw value exists in one place, the response carrying it, and
   * `proxy.ts` forwards that value straight into its own render. So a successor
   * the frontend received would already have been spent; an unspent one means
   * the answer never arrived, and the browser presenting the retired token is
   * the family's only holder.
   *
   * THAT REASONING STOPS AT THE FRONTEND. A response dropped between the
   * frontend and the browser leaves a used successor, which reads here as a
   * second holder and signs the visitor out on the alarm. Keeping the render on
   * the retired token would cover that case and would leave `firstUsedAt`
   * meaning no more than "the browser has not come back yet", enough for a thief
   * holding a copied cookie jar to have the victim's live successor revoked in
   * silence. `SECURITY.md` states the residual rather than hiding it.
   *
   * Refusing instead ended the session every time a rotation answer was dropped,
   * because a successor is unrecoverable once its response is gone: only its
   * hash is stored. Un-retiring the presented row rather than minting a
   * replacement is what keeps reuse detection honest — the family goes back to
   * one live token, and the next rotation catches a second holder exactly as the
   * lost one would have. Minting a fresh token would instead settle the question
   * in favour of whoever asked first. The undelivered successors are revoked on
   * the way out, so a response that was intercepted rather than dropped is worth
   * nothing to whoever took it.
   *
   * THE CLAIM RUNS BEFORE THE REVOKE, GUARDED ON THE `rotatedAt` THAT WAS READ.
   * The other order let a request holding a stale reading revoke a successor a
   * later rotation had already delivered, because `issuedAt >= rotatedAt`
   * matches every successor minted from that instant onward. Claiming first
   * makes a stale request write nothing at all, and it takes the row lock on the
   * presented row before either request touches a successor, so the two
   * serialise in one order.
   */
  private async recoverUndeliveredRotation(
    superseded: SessionRow,
    rotatedAt: Date,
  ): Promise<ResolvedSession | null> {
    const undelivered = {
      familyId: superseded.familyId,
      sessionId: { not: superseded.sessionId },
      issuedAt: { gte: rotatedAt },
      revokedAt: null,
    } satisfies Prisma.SessionWhereInput;

    const claim = await this.prisma.$transaction(async (tx): Promise<RecoveryClaim> => {
      // Un-retiring the presented row IS the claim on this recovery, so it comes
      // first and matches only the exact rotation the caller read. Anything else
      // — a rotation that has since re-retired the row, a sign-out that revoked
      // it — refuses the claim and leaves the family untouched.
      const claimed = await tx.session.updateMany({
        where: { sessionId: superseded.sessionId, rotatedAt, revokedAt: null },
        data: { rotatedAt: null },
      });
      if (claimed.count === 0) {
        return { outcome: 'contested' };
      }

      // Guarded on `firstUsedAt: null` so a successor that came into use between
      // the check above and this write survives, rather than being revoked out
      // from under the browser that has just started using it.
      await tx.session.updateMany({
        where: { ...undelivered, firstUsedAt: null },
        data: { revokedAt: new Date() },
      });

      // Anything still live in that range is exactly such a successor, which
      // makes this a second holder after all. Put the claim back so the presented
      // token stays retired, and report it as reuse — THERE IS NO LATER
      // PRESENTATION TO CATCH IT. `rotateSession` turns a refusal into
      // `{ status: 'invalid' }`, which sends the proxy to `/logout`, and that
      // revokes the family as an ordinary sign-out. Leaving it to the caller
      // filed the one event operators are told to page on as a logout.
      const inUse = await tx.session.findFirst({ where: undelivered, select: { sessionId: true } });
      if (inUse !== null) {
        await tx.session.update({
          where: { sessionId: superseded.sessionId },
          data: { rotatedAt },
        });
        return { outcome: 'reuse' };
      }

      const row = await tx.session.findUnique({
        where: { sessionId: superseded.sessionId },
        select: SESSION_SELECT,
      });
      return row === null ? { outcome: 'refused' } : { outcome: 'recovered', row };
    });

    if (claim.outcome === 'contested') {
      return this.resolveContestedRecovery(superseded.sessionId);
    }

    if (claim.outcome === 'reuse') {
      return this.reportSessionReuse(superseded);
    }

    if (claim.outcome === 'refused') {
      return null;
    }

    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.session.rotation_response_lost'],
      message:
        'Rotation answer never reached the frontend; restored the presented token and revoked the successor nobody received.',
      userId: claim.row.userId,
      familyId: claim.row.familyId,
      sessionId: claim.row.sessionId,
    });

    return { row: claim.row, superseded: false };
  }

  /**
   * Re-reads the presented row after another request won the recovery it was
   * about to attempt.
   *
   * Both requests carry the same token and both deserve an answer, but only the
   * winner's view of the family is current — so this reads the row again instead
   * of acting on a reading taken before that request committed. The winner
   * restored it, which makes this the family's live token; a rotation may then
   * have retired it again, which its own grace window covers; or the family
   * ended, and there is nothing to serve.
   */
  private async resolveContestedRecovery(sessionId: string): Promise<ResolvedSession | null> {
    const row = await this.prisma.session.findFirst({
      where: {
        sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
      select: SESSION_SELECT,
    });

    if (row === null) {
      return null;
    }

    if (row.rotatedAt === null) {
      return { row, superseded: false };
    }

    const graceMs = this.rotationGraceSeconds * 1000;
    return Date.now() - row.rotatedAt.getTime() <= graceMs ? { row, superseded: true } : null;
  }

  /**
   * Re-issues the token behind a live session once it has reached its rotation
   * interval, retiring the presented one.
   *
   * The claim is a guarded `updateMany` on `rotatedAt: null` inside the
   * transaction, so of two requests that reach this together exactly one rotates
   * and the other is told it lost. That matters more than it looks: both would
   * otherwise mint a successor, the family would carry two live tokens, and the
   * browser would keep only whichever cookie arrived last.
   *
   * The successor inherits `expiresAt` rather than computing a fresh one.
   * Rotation is not a renewal — `AUTH_SESSION_TTL_SECONDS` stays the absolute
   * ceiling on a sign-in, and every row in a family expires together, so the
   * pruner clears the whole lineage in one sweep.
   */
  async rotateSession(token: SessionToken): Promise<SessionRotation> {
    // The one caller allowed to undo a rotation whose response was lost. It is
    // the request that asked for that rotation, retried; see
    // `recoverUndeliveredRotation`.
    const resolved = await this.resolveSession(token, { recoverLostRotation: true });
    if (resolved === null) {
      return { status: 'invalid' };
    }

    const { row } = resolved;
    if (resolved.superseded) {
      return { status: 'superseded', nextRotationInSeconds: this.nextRotationInSeconds(row) };
    }

    const ageMs = Date.now() - row.issuedAt.getTime();
    if (ageMs < this.rotateAfterSeconds * 1000) {
      return { status: 'not_due', nextRotationInSeconds: this.nextRotationInSeconds(row) };
    }

    const rawToken = generateOpaqueToken();
    const rotatedAt = new Date();

    const claim = await this.prisma.$transaction(async (tx): Promise<RotationClaim> => {
      const claimed = await tx.session.updateMany({
        where: { sessionId: row.sessionId, rotatedAt: null, revokedAt: null },
        data: { rotatedAt },
      });

      // Nothing was written, so there is nothing to roll back — returning a
      // verdict commits an empty transaction rather than throwing to abort one.
      //
      // WHICH GUARD REFUSED IT IS THE ANSWER, and reading `count === 0` as
      // `superseded` on its own got it wrong half the time. `rotatedAt` refusing
      // means another request won the rotation and the session is fine;
      // `revokedAt` refusing means the session ended between the resolve above
      // and this write — a sign-out in another tab, or reuse detection firing on
      // a sibling token. Telling the caller `superseded` there sends it on to
      // render a page whose every backend call is about to 401.
      if (claimed.count === 0) {
        const current = await tx.session.findUnique({
          where: { sessionId: row.sessionId },
          select: { revokedAt: true },
        });
        return current !== null && current.revokedAt === null
          ? { outcome: 'superseded' }
          : { outcome: 'invalid' };
      }

      const successor = await tx.session.create({
        data: {
          sessionId: uuidv7(),
          userId: row.userId,
          familyId: row.familyId,
          tokenHash: hashToken(rawToken),
          issuedAt: rotatedAt,
          expiresAt: row.expiresAt,
        },
        select: SESSION_SELECT,
      });
      return { outcome: 'rotated', successor };
    });

    if (claim.outcome === 'invalid') {
      return { status: 'invalid' };
    }

    if (claim.outcome === 'superseded') {
      return { status: 'superseded', nextRotationInSeconds: this.rotateAfterSeconds };
    }

    const { successor } = claim;

    this.logger.log({
      event: BACKEND_LOG_EVENTS['auth.session.rotated'],
      message: 'Session token rotated.',
      userId: successor.userId,
      familyId: successor.familyId,
      sessionId: successor.sessionId,
    });

    return {
      status: 'rotated',
      issued: { session: toSession(successor), token: rawToken as SessionToken },
      nextRotationInSeconds: this.rotateAfterSeconds,
    };
  }

  /**
   * Lists the live sign-ins on an account, most recently started first.
   *
   * ONE ENTRY PER FAMILY, NOT PER ROW. A `sessions` row is one token, so a
   * browser that has been signed in for a week owns
   * `AUTH_SESSION_TTL_SECONDS / AUTH_SESSION_ROTATE_AFTER_SECONDS` of them — a
   * row listing would show one visitor as a hundred-odd sessions and make the
   * page useless for the thing it exists for. A live family has exactly one
   * token that is unrotated, unrevoked and unexpired, so selecting those rows
   * IS the per-sign-in listing, in one indexed read.
   *
   * `familyId` carries the ordering for free: it is the root token's `sessionId`
   * and therefore a uuidv7, whose leading bytes are a timestamp, so sorting on
   * it descending is sorting by when each sign-in began. That saves ordering on
   * a column the first query does not have.
   *
   * The second read fetches those roots, because the current token's `issuedAt`
   * is when the TOKEN was minted — an hour ago on an active browser — not when
   * the person signed in. Every member of a family shares one `expiresAt` and
   * the pruner only deletes expired rows, so a live family's root is still
   * there; the fallback covers the impossible case rather than trusting it.
   *
   * The caller's own sign-in is marked rather than filtered out. A list that
   * silently omits one entry reads as a list of everything.
   */
  async listActiveSessions(userId: UserId, currentSessionId: string): Promise<ActiveSessionList> {
    const now = new Date();

    // One extra row so `truncated` is answered by the read rather than guessed.
    const [rows, currentRow] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where: {
          userId,
          rotatedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { deletedAt: null },
        },
        orderBy: { familyId: 'desc' },
        take: ACTIVE_SESSION_LIMIT + 1,
        select: ACTIVE_SESSION_SELECT,
      }),
      // Scoped to `userId` even though the controller only ever passes the
      // guard's own session id: this service is the boundary for server-side
      // compositions too, and the query is where that guarantee has to live.
      this.prisma.session.findFirst({
        where: { sessionId: currentSessionId, userId },
        select: { familyId: true },
      }),
    ]);

    const page = rows.slice(0, ACTIVE_SESSION_LIMIT);
    const roots = await this.prisma.session.findMany({
      where: { sessionId: { in: page.map((row) => row.familyId) } },
      select: SESSION_FAMILY_ROOT_SELECT,
    });
    const startedAtByFamily = new Map(roots.map((root) => [root.sessionId, root.issuedAt]));

    return {
      sessions: page.map((row): ActiveSession => ({
        sessionId: row.familyId,
        // The root cannot be missing — a family shares one `expiresAt` and the
        // pruner deletes only expired rows — so the fallback is for a state
        // nothing produces. It reads late rather than absurd: this token's own
        // mint time is at worst one rotation interval after the sign-in began.
        startedAt: startedAtByFamily.get(row.familyId) ?? row.issuedAt,
        lastSeenAt: row.firstUsedAt,
        expiresAt: row.expiresAt,
        current: row.familyId === currentRow?.familyId,
      })),
      truncated: rows.length > ACTIVE_SESSION_LIMIT,
    };
  }

  /**
   * Ends every live sign-in on an account, optionally sparing the one asking.
   *
   * This is the lever a person pulls when they think a cookie of theirs has been
   * copied, and it is what a password change will call on the day one lands —
   * changing a password that leaves the thief's session alive changes nothing.
   *
   * ONE `updateMany` OVER EVERY TOKEN OF EVERY AFFECTED FAMILY, not a loop over
   * {@link revokeSessionFamily}. Same outcome — a retired ancestor left
   * unrevoked is what reuse detection reads, so nothing may end a sign-in row by
   * row — reached without a query per family. The count of families is read
   * inside the same transaction so the number returned matches the rows the
   * update touched.
   *
   * `keepSessionId` is a session id, and the family behind it is what survives:
   * sparing one ROW would leave the caller holding a token whose ancestors were
   * just revoked, and the next rotation would then read its own family as dead.
   * A session id that no longer resolves is a session that ended between the
   * guard and here, and it is refused rather than quietly falling through to
   * revoking everything — the caller asked to keep something.
   */
  async revokeAllSessions(userId: UserId, keepSessionId: string | null): Promise<number> {
    let keepFamilyId: string | null = null;
    if (keepSessionId !== null) {
      // `userId` in the where clause, not trusted from the caller: a session id
      // belonging to someone else must refuse here rather than resolve to a
      // family the update below would then work around.
      const kept = await this.prisma.session.findFirst({
        where: { sessionId: keepSessionId, userId },
        select: { familyId: true },
      });
      if (kept === null) {
        throw new AuthError('SESSION_INVALID', 'session to keep no longer resolves');
      }
      keepFamilyId = kept.familyId;
    }

    const where = {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(keepFamilyId === null ? {} : { familyId: { not: keepFamilyId } }),
    } satisfies Prisma.SessionWhereInput;

    const { families, rows } = await this.prisma.$transaction(async (tx) => {
      const distinctFamilies = await tx.session.findMany({
        where,
        distinct: ['familyId'],
        select: { familyId: true },
      });
      // Revoke to a fixed point, for the reason `revokeSessionFamily` gives: a
      // rotation committing mid-statement can insert a successor the first
      // snapshot cannot see, and it would survive this "sign out everywhere"
      // as a live token. The family count above is unaffected — every live
      // family has at least one long-committed row the first read sees.
      let revokedRows = 0;
      for (;;) {
        const revoked = await tx.session.updateMany({ where, data: { revokedAt: new Date() } });
        revokedRows += revoked.count;
        if (revoked.count === 0) break;
      }
      return { families: distinctFamilies.length, rows: revokedRows };
    });

    if (families > 0) {
      this.logger.log({
        event: BACKEND_LOG_EVENTS['auth.session.all_revoked'],
        message: 'Every live sign-in on the account was revoked.',
        reason: 'revoked_all',
        userId,
        revokedSessions: families,
        // `revokedRows`, not `revokedTokens`: the log redactor matches on key
        // NAME, and anything containing "token" is replaced with [REDACTED].
        // The value here is a row count and there is nothing to hide.
        revokedRows: rows,
        keptCurrent: keepFamilyId !== null,
      });
    }

    return families;
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

  /**
   * Issues a new session and returns the bearer token exactly once.
   *
   * A fresh sign-in starts its own family, and the first token names it — so a
   * session that is never rotated still has a lineage of one, and every query
   * that works on families works on it without a special case.
   */
  private async issueSession(userId: UserId): Promise<SessionIssued> {
    const rawToken = generateOpaqueToken();
    const ttlSeconds = this.config.get('AUTH_SESSION_TTL_SECONDS', { infer: true });
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const sessionId = uuidv7();

    const session = await this.prisma.session.create({
      data: {
        sessionId,
        userId,
        familyId: sessionId,
        tokenHash: hashToken(rawToken),
        issuedAt,
        expiresAt,
      },
      select: SESSION_SELECT,
    });

    return { session: toSession(session), token: rawToken as SessionToken };
  }

  /**
   * Revokes every token in one lineage and returns how many rows that touched.
   *
   * Guarded on `revokedAt: null`, so calling it twice revokes nothing the second
   * time and the caller can treat a zero count as "already over".
   *
   * There is no privilege-change caller in this template, because nothing here
   * changes a user's role — see `docs/charters/backend.md`. When you add one,
   * this is what it calls: a role change should not leave tokens minted under
   * the old one in circulation.
   */
  private async revokeSessionFamily(
    familyId: string,
    userId: string,
    reason: SessionRevocationReason,
  ): Promise<number> {
    // Run to a fixed point rather than once. Under read committed, a rotation
    // committing mid-revocation can insert a successor this statement's
    // snapshot cannot see: the claim's row lock serialises the retired
    // ancestor, not the insert, so one live token would escape a single pass.
    // A repeat pass reads a fresh snapshot, and a pass that touches nothing
    // proves none escaped. It terminates because a revoked row never matches
    // again and a new successor needs a claim on a row a prior pass has not
    // already revoked — only rotations already in flight can add one each.
    let count = 0;
    for (;;) {
      const result = await this.prisma.session.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      count += result.count;
      if (result.count === 0) break;
    }

    if (count > 0) {
      this.logger.log({
        event: BACKEND_LOG_EVENTS['auth.session.family_revoked'],
        message: 'Session family revoked.',
        reason,
        userId,
        familyId,
        revokedCount: count,
      });
    }

    return count;
  }

  /**
   * Seconds until the family holding `row` is next eligible for rotation.
   *
   * For a superseded row the clock runs from `rotatedAt`, which is when its
   * successor was issued — the successor's own age is what the next rotation
   * will be measured against, and this is the only view of it available from a
   * retired row. Floored at one second so a caller scheduling against it always
   * moves forward.
   */
  private nextRotationInSeconds(row: SessionRow): number {
    const from = row.rotatedAt ?? row.issuedAt;
    const elapsedSeconds = Math.floor((Date.now() - from.getTime()) / 1000);
    return Math.max(1, this.rotateAfterSeconds - elapsedSeconds);
  }
}
