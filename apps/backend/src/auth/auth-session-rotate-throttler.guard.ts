import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

import { AppThrottlerGuard } from '../common/guards/app-throttler.guard';
import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { shortHash } from '../common/utils/short-hash';
import { SESSION_COOKIE_NAME } from './session-cookie.service';

const BUCKET = { limit: 10, ttl: 60_000 } as const;

/**
 * Tracks the presented session token, falling back to the caller's IP when
 * there is no cookie to track.
 *
 * THE IP IS THE WRONG KEY HERE AND THE FALLBACK IS ONLY FOR ANONYMOUS JUNK.
 * Every legitimate call to this route comes from a BFF, not a browser, so one
 * IP is every signed-in user at once — an IP bucket would let a single busy
 * instance throttle everybody's rotation, which is a sign-out for all of them.
 * The token hash is per-session and is what the limit is actually about.
 */
function rotationTracker(req: Request): string {
  const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
  const token = cookies?.[SESSION_COOKIE_NAME];
  if (typeof token === 'string' && token.length > 0) {
    return `session:${shortHash(token)}`;
  }
  return `ip:${shortHash(req.ip ?? 'unknown')}`;
}

/**
 * Caps how often one session may ask to be rotated.
 *
 * A well-behaved caller asks once per `AUTH_SESSION_ROTATE_AFTER_SECONDS` and
 * retries about once a minute when the call fails, so ten a minute leaves
 * generous headroom while still bounding a caller that loops. The route writes
 * only when the interval has actually elapsed, so the limit is about noise
 * rather than about the writes.
 */
@Injectable()
export class AuthSessionRotateThrottlerGuard extends AppThrottlerGuard {
  private readonly logger = new Logger(AuthSessionRotateThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const tracker = rotationTracker(context.switchToHttp().getRequest<Request>());

    await this.handleRequest({
      context,
      limit: BUCKET.limit,
      ttl: BUCKET.ttl,
      throttler: { name: 'auth-session-rotate', limit: BUCKET.limit, ttl: BUCKET.ttl },
      blockDuration: BUCKET.ttl,
      getTracker: () => Promise.resolve(tracker),
      generateKey: (_ctx, trackerString) => `auth-session-rotate:${trackerString}`,
    });

    return true;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.session.rotation_throttled'],
      message: 'Session rotation throttled.',
      bucket: 'auth-session-rotate',
      retryAfterSeconds: this.retryAfterSecondsFor(detail),
    });

    // The base guard sets Retry-After and throws the 429.
    await super.throwThrottlingException(context, detail);
  }
}
