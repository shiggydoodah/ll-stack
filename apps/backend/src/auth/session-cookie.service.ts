import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../config/env.schema';
import type { SessionIssued, SessionToken } from './auth.types';

// Duplicated deliberately with the frontend's
// `apps/frontend/lib/authentication/session-constants.ts` — the two tiers
// cannot share a constant, and the cookie name is the contract between them.
export const SESSION_COOKIE_NAME = 'llstack_session';

/** Reads, writes, and clears the auth session cookie with environment-aware options. */
@Injectable()
export class SessionCookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * `maxAge` comes from the session's own `expiresAt`, not from
   * `AUTH_SESSION_TTL_SECONDS`. A rotated session inherits its family's expiry
   * rather than getting a fresh one, so reading the configured TTL here would
   * hand the browser a cookie that outlives the session behind it — every
   * rotation pushing the cookie a full TTL further out while the row underneath
   * stayed put.
   */
  set(res: Response, issued: SessionIssued): void {
    res.cookie(SESSION_COOKIE_NAME, issued.token, {
      ...this.baseOptions(),
      maxAge: Math.max(0, issued.session.expiresAt.getTime() - Date.now()),
    });
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, this.baseOptions());
  }

  read(req: Request): SessionToken | null {
    const cookies = (req as Request & { cookies?: Record<string, unknown> }).cookies;
    const value = cookies?.[SESSION_COOKIE_NAME];
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    return value as SessionToken;
  }

  /** Everything but the lifetime — `set` adds that, `clear` must not carry one. */
  private baseOptions(): Omit<CookieOptions, 'maxAge'> {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    return {
      httpOnly: true,
      secure: nodeEnv !== 'development' && nodeEnv !== 'test',
      sameSite: 'lax',
      path: '/',
    };
  }
}
