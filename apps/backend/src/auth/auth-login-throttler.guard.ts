import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

import { AppThrottlerGuard } from '../common/guards/app-throttler.guard';
import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { shortHash } from '../common/utils/short-hash';

const IP_BUCKET = { limit: 10, ttl: 60_000 } as const;
// Account-level bucket: keyed by the submitted email hash ALONE (not ip+email),
// so distributed guessing against one victim email is capped across all source
// IPs. Trade-off: an attacker who knows a victim's email can trip this bucket
// from any IP and soft-lock that email for the TTL. We accept that — it is a
// temporary 15-minute throttle, and the alternative (a fresh bucket per IP)
// lets credential stuffing rotate IPs freely.
const EMAIL_BUCKET = { limit: 5, ttl: 15 * 60_000 } as const;

function submittedEmailHash(req: Request): string | null {
  const email: unknown = (req.body as Record<string, unknown> | undefined)?.['email'];
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length === 0 ? null : shortHash(normalized);
}

/** Applies independent IP and email-hash buckets to password login attempts. */
@Injectable()
export class AuthLoginThrottlerGuard extends AppThrottlerGuard {
  private readonly logger = new Logger(AuthLoginThrottlerGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';

    await this.handleRequest({
      context,
      limit: IP_BUCKET.limit,
      ttl: IP_BUCKET.ttl,
      throttler: { name: 'auth-login-ip', limit: IP_BUCKET.limit, ttl: IP_BUCKET.ttl },
      blockDuration: IP_BUCKET.ttl,
      getTracker: () => Promise.resolve(ip),
      generateKey: (_ctx, trackerString) => `auth-login-ip:${trackerString}`,
    });

    const emailHash = submittedEmailHash(req);
    if (emailHash !== null) {
      await this.handleRequest({
        context,
        limit: EMAIL_BUCKET.limit,
        ttl: EMAIL_BUCKET.ttl,
        throttler: { name: 'auth-login-email', limit: EMAIL_BUCKET.limit, ttl: EMAIL_BUCKET.ttl },
        blockDuration: EMAIL_BUCKET.ttl,
        getTracker: () => Promise.resolve(emailHash),
        generateKey: (_ctx, trackerString) => `auth-login-email:${trackerString}`,
      });
    }

    return true;
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    const emailHash = submittedEmailHash(req);
    this.logger.warn({
      event: BACKEND_LOG_EVENTS['auth.login.throttled'],
      message: 'Login throttled.',
      bucket: detail.key.startsWith('auth-login-email:') ? 'auth-login-email' : 'auth-login-ip',
      retryAfterSeconds: this.retryAfterSecondsFor(detail),
      ipHash: shortHash(req.ip ?? 'unknown'),
      ...(emailHash !== null && { emailHash }),
    });

    // The base guard sets Retry-After and throws the 429.
    await super.throwThrottlingException(context, detail);
  }
}
