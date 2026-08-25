import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';

/**
 * Whether all rate limiting is switched off. Driven by `RATE_LIMITING_ENABLED`
 * and only ever true outside staging/production — env.schema.ts refuses a
 * `false` value there at boot, so this can never silently disable throttling in
 * a deployed environment. Read from `process.env` (already validated by the
 * ConfigModule at startup) to avoid threading ConfigService through every guard.
 */
function isRateLimitingDisabled(): boolean {
  const nodeEnv = process.env['NODE_ENV'];
  if (nodeEnv === 'staging' || nodeEnv === 'production') {
    return false;
  }
  return process.env['RATE_LIMITING_ENABLED'] === 'false';
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Single chokepoint for every throttler in the app: the base guard and all
   * subclasses (signup, login, forgot-password, …) route their checks through
   * `handleRequest`. When rate limiting is disabled, short-circuit to allow so
   * the e2e harness can drive many auth calls from one localhost IP.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (isRateLimitingDisabled()) {
      return true;
    }
    return super.handleRequest(requestProps);
  }

  /**
   * How long a 429'd caller should wait, for the `Retry-After` header and the
   * exception message. Every named guard funnels through here instead of doing
   * the arithmetic itself: this was duplicated in eleven guards and all eleven
   * copies carried the same bug.
   *
   * THERE IS NO DIVISION HERE, AND THAT IS THE POINT. The storage contract
   * hands back both expiry figures already in SECONDS — upstream's
   * `getBlockExpirationTime` ceils to seconds and `BoundedThrottlerStorage`
   * matches it. Dividing by 1000 collapsed every bucket alike, 60s and 15min
   * and 1h, onto the `Math.max(1, …)` floor, so every named-throttler 429 in
   * the app advertised `Retry-After: 1` and invited an immediate retry.
   *
   * `timeToBlockExpire` and not `timeToExpire`: this only runs when the caller
   * is blocked, and what they are waiting out is the block, not the counting
   * window. It is also the figure upstream puts in its own `Retry-After`.
   */
  protected retryAfterSecondsFor(detail: ThrottlerLimitDetail): number {
    return Math.max(1, detail.timeToBlockExpire);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    const retryAfterSeconds = this.retryAfterSecondsFor(throttlerLimitDetail);

    if (typeof res?.setHeader === 'function') {
      res.setHeader('Retry-After', String(retryAfterSeconds));
    }

    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
