import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { type Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

/** Registry key for the sweep timer. Also what a spec asserts on. */
export const SESSION_PRUNE_INTERVAL_NAME = 'auth.session-prune';

/**
 * Deletes expired sessions on an interval.
 *
 * WHY THIS EXISTS. `sessions` is Archetype B in the database standards —
 * mutable, hard-delete only, "pruned outright when expired" is what the model's
 * own comment claims. Nothing implemented that. The table grew by one row per
 * login and never shrank, and every one of those rows holds the SHA-256 hash of
 * a bearer token: a backup or a read-only leak years later still hands an
 * attacker the full history of session material, all of it long dead and none
 * of it serving any purpose.
 *
 * WHY THE CONDITION IS ONLY `expiresAt <= now`. A session is unusable once it
 * is expired, revoked, or owned by a soft-deleted user — but the last two both
 * become expired within `AUTH_SESSION_TTL_SECONDS` anyway, and refusing them
 * before then is `AuthService.getSession`'s job, in its WHERE clause, where it
 * belongs. Pruning on expiry alone keeps this a single indexed range scan
 * (`@@index([expiresAt])`) instead of an OR across three columns, two of which
 * have no index to serve it. A revoked session outliving its revocation by up
 * to the TTL costs nothing and is arguably the point: the row IS the record
 * that it was revoked.
 *
 * WHY THE CEILING IS CONFIGURABLE. Rotation multiplies rows: one sign-in now
 * owns up to `AUTH_SESSION_TTL_SECONDS / AUTH_SESSION_ROTATE_AFTER_SECONDS`
 * rows instead of one, and every one of them expires at the same instant. The
 * sweep's ceiling is `AUTH_SESSION_PRUNE_MAX_BATCHES` × `..._BATCH_SIZE` rows
 * per tick, and left at a fixed 20 × 500 it stopped describing the same number
 * of sign-ins it used to. Shorten the rotation interval and the ceiling has to
 * move with it — `env.schema.ts` carries the arithmetic and SECURITY.md's
 * deploy checklist carries the reminder.
 *
 * Registered dynamically through `SchedulerRegistry` rather than with
 * `@Cron`/`@Interval`, per the backend runbook — decorators bind at import
 * time, which is before any env has been read.
 */
@Injectable()
export class SessionPruneService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SessionPruneService.name);

  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;

  /**
   * Delete batches one sweep will take before stopping and waiting for the next
   * tick. The batch size bounds a single statement; this bounds the sweep, so a
   * first run against a table that has never been pruned cannot hold the
   * connection for an unbounded stretch. Whatever is left is picked up on the
   * next tick — the sweep is idempotent, so a backlog just takes several.
   */
  private readonly maxBatches: number;

  /**
   * Set by `onModuleDestroy` and read between batches. A sweep started on the
   * last tick before shutdown must not keep issuing queries into a Prisma
   * client that is being disconnected.
   */
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerRegistry,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('AUTH_SESSION_PRUNE_ENABLED', { infer: true });
    this.intervalMs = config.get('AUTH_SESSION_PRUNE_INTERVAL_MS', { infer: true });
    this.batchSize = config.get('AUTH_SESSION_PRUNE_BATCH_SIZE', { infer: true });
    this.maxBatches = config.get('AUTH_SESSION_PRUNE_MAX_BATCHES', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      return;
    }

    const interval = setInterval(() => void this.sweep(), this.intervalMs);
    // A maintenance timer is never a reason for the process to stay alive.
    interval.unref();
    this.scheduler.addInterval(SESSION_PRUNE_INTERVAL_NAME, interval);

    // Sweep once at boot as well as on the interval. With an hourly default, an
    // instance that restarts more often than that would otherwise never prune.
    // Deliberately not awaited — boot does not wait on maintenance — and
    // `sweep` swallows its own failures, so this cannot reject unhandled.
    void this.sweep();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.scheduler.doesExist('interval', SESSION_PRUNE_INTERVAL_NAME)) {
      // Clears the timer as well as dropping the registry entry.
      this.scheduler.deleteInterval(SESSION_PRUNE_INTERVAL_NAME);
    }
  }

  /**
   * One sweep: batched deletes until the table is clean, the batch ceiling is
   * reached, or shutdown starts. Returns the number of rows deleted, which is
   * what the spec asserts on.
   *
   * Failures are logged and swallowed. This runs on a timer with no caller to
   * report to, and a database blip must not turn into an unhandled rejection
   * that takes the process down — the next tick retries.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    let deleted = 0;
    let batches = 0;

    try {
      while (batches < this.maxBatches && !this.stopped) {
        const expired = await this.prisma.session.findMany({
          where: { expiresAt: { lte: now } },
          select: { sessionId: true },
          take: this.batchSize,
        });

        if (expired.length === 0) {
          break;
        }

        const result = await this.prisma.session.deleteMany({
          where: { sessionId: { in: expired.map((session) => session.sessionId) } },
        });

        deleted += result.count;
        batches += 1;

        // A short final batch means the table is clean; another query would
        // only confirm it.
        if (expired.length < this.batchSize) {
          break;
        }
      }
    } catch (error: unknown) {
      this.logger.error({
        event: BACKEND_LOG_EVENTS['system.session_prune.failure'],
        message: 'Session prune sweep failed; retrying on the next tick.',
        deleted,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      return deleted;
    }

    if (batches >= this.maxBatches) {
      // Reaching the ceiling once is a backlog draining. Reaching it on every
      // tick means expired rows are arriving faster than they are being
      // deleted, and the table grows for as long as that holds — so the message
      // names the knob rather than leaving an operator to find it.
      this.logger.warn({
        event: BACKEND_LOG_EVENTS['system.session_prune.completed'],
        message:
          'Session prune sweep hit its batch ceiling; expired sessions remain for the next tick. ' +
          'If this repeats every tick, raise AUTH_SESSION_PRUNE_MAX_BATCHES.',
        deleted,
        batches,
      });
    } else if (deleted > 0) {
      // Counts only. Session rows carry token hashes and user ids, and neither
      // belongs in a maintenance log. Silent when there was nothing to do, so
      // an idle instance does not emit an hourly heartbeat.
      this.logger.log({
        event: BACKEND_LOG_EVENTS['system.session_prune.completed'],
        message: 'Session prune sweep completed.',
        deleted,
        batches,
      });
    }

    return deleted;
  }
}
