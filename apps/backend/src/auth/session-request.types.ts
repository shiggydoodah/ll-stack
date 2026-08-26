import type { Request } from 'express';

import type { UserId } from './auth.types';

export interface AuthenticatedSession {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  session: AuthenticatedSession;
}
