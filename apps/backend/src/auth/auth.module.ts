import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';
import { SessionPruneService } from './session-prune.service';
import { SessionGuard } from './session.guard';

/**
 * Registration, login, logout, and the session machinery every authenticated
 * surface builds on. `SessionGuard`, `SessionCookieService`, and `AuthService`
 * are this module's exported surface — other feature modules import
 * `AuthModule` and use them; they never reach into its internals.
 *
 * `SessionPruneService` is deliberately NOT exported: it is this module's own
 * background maintenance and has no caller outside it. Being in `providers` is
 * what gets its lifecycle hooks run.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionCookieService, SessionGuard, SessionPruneService],
  exports: [AuthService, SessionCookieService, SessionGuard],
})
export class AuthModule {}
