import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';
import type { AuthenticatedRequest } from './session-request.types';

/**
 * Requires a valid session cookie and attaches session metadata to the
 * request. A dead cookie (unknown, revoked, or expired token) is cleared on
 * the response so the browser self-heals instead of replaying it forever.
 *
 * Constructor fields are `protected` so a future stricter guard (e.g. a
 * verified-email guard) can extend this one and reuse them.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    protected readonly authService: AuthService,
    protected readonly sessionCookies: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const token = this.sessionCookies.read(req);
    if (token === null) {
      throw new UnauthorizedException();
    }

    const session = await this.authService.getSession(token);
    if (session === null) {
      this.sessionCookies.clear(res);
      throw new UnauthorizedException();
    }

    (req as AuthenticatedRequest).session = {
      userId: session.userId,
      sessionId: session.sessionId,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    };
    return true;
  }
}
