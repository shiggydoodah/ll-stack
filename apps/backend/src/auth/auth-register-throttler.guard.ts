import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

import { AppThrottlerGuard } from '../common/guards/app-throttler.guard';
import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { shortHash } from '../common/utils/short-hash';

// Strict registration throttle. Independent IP and submitted-email-hash
// buckets bound (a) argon2 cost amplification from repeated registrations and
// (b) account-existence probing via the 409 duplicate-email response.
const IP_BUCKET = { limit: 5, ttl: 3_600_000 } as const;
const EMAIL_BUCKET = { limit: 3, ttl: 3_600_000 } as const;

function submittedEmailHash(req: Request): string | null {
  const email: unknown = (req.body as Record<string, unknown> | undefined)?.['email'];
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length === 0 ? null : shortHash(normalized);
}

/** Throttles registration by client IP (5/hr) and by submitted email hash (3/hr). */
@Injectable()
export class AuthRegisterThrottlerGuard extends AppThrottlerGuard {
  private readonly logger = new Logger(AuthRegisterThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';

    await this.handleRequest({
      context,
      limit: IP_BUCKET.limit,
      ttl: IP_BUCKET.ttl,
      throttler: { name: 'auth-register-ip', limit: IP_BUCKET.limit, ttl: IP_BUCKET.ttl },
      blockDuration: IP_BUCKET.ttl,
      getTracker: () => Promise.resolve(ip),
      generateKey: (_ctx, trackerString) => `auth-register-ip:${trackerString}`,
    });

    const emailHash = submittedEmailHash(req);
    if (emailHash !== null) {
      await this.handleRequest({
        context,
        limit: EMAIL_BUCKET.limit,
        ttl: EMAIL_BUCKET.ttl,
        throttler: {
          name: 'auth-register-email',
          limit: EMAIL_BUCKET.limit,
          ttl: EMAIL_BUCKET.ttl,
        },
        blockDuration: EMAIL_BUCKET.ttl,
        getTracker: () => Promise.resolve(emailHash),
        generateKey: (_ctx, trackerString) => `auth-register-email:${trackerString}`,
      });
    }

    return true;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.register.throttled'],
      message: 'Registration throttled.',
      bucket: detail.key.startsWith('auth-register-email:')
        ? 'auth-register-email'
        : 'auth-register-ip',
      retryAfterSeconds: this.retryAfterSecondsFor(detail),
      ipHash: shortHash(req.ip ?? 'unknown'),
    });

    // The base guard sets Retry-After and throws the 429.
    await super.throwThrottlingException(context, detail);
  }
}
