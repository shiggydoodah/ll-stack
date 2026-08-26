import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

import { AppThrottlerGuard } from '../common/guards/app-throttler.guard';
import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { shortHash } from '../common/utils/short-hash';
import type { AuthenticatedRequest } from './session-request.types';

const BUCKET = { limit: 5, ttl: 900_000 } as const;

/**
 * Tracks the signed-in user, because that is who the limit is about: the route
 * only ever touches the caller's own sign-ins, so an IP bucket would let one
 * busy office throttle everyone in it. `SessionGuard` runs first and attaches
 * the session, so the id is there; the IP fallback covers nothing legitimate
 * and exists so a missing session cannot key every caller onto one bucket.
 */
function revokeTracker(req: Request): string {
  const session = (req as Partial<AuthenticatedRequest>).session;
  if (session !== undefined) {
    return `user:${session.userId}`;
  }
  return `ip:${shortHash(req.ip ?? 'unknown')}`;
}

/**
 * Caps how often one account may clear its own sign-ins.
 *
 * Deliberate, rare, and destructive: a person who has just been told their
 * cookie may have been copied presses it once, maybe twice. Five in fifteen
 * minutes leaves room for a panicked double-click and bounds a caller holding a
 * stolen session from looping it to keep the owner signed out.
 */
@Injectable()
export class AuthSessionsRevokeThrottlerGuard extends AppThrottlerGuard {
  private readonly logger = new Logger(AuthSessionsRevokeThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const tracker = revokeTracker(context.switchToHttp().getRequest<Request>());

    await this.handleRequest({
      context,
      limit: BUCKET.limit,
      ttl: BUCKET.ttl,
      throttler: { name: 'auth-sessions-revoke', limit: BUCKET.limit, ttl: BUCKET.ttl },
      blockDuration: BUCKET.ttl,
      getTracker: () => Promise.resolve(tracker),
      generateKey: (_ctx, trackerString) => `auth-sessions-revoke:${trackerString}`,
    });

    return true;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.session.revoke_all_throttled'],
      message: 'Session revoke-all throttled.',
      bucket: 'auth-sessions-revoke',
      retryAfterSeconds: this.retryAfterSecondsFor(detail),
    });

    // The base guard sets Retry-After and throws the 429.
    await super.throwThrottlingException(context, detail);
  }
}
