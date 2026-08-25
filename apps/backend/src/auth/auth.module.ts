import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';
import { SessionGuard } from './session.guard';

/**
 * Registration, login, logout, and the session machinery every authenticated
 * surface builds on. `SessionGuard`, `SessionCookieService`, and `AuthService`
 * are this module's exported surface — other feature modules import
 * `AuthModule` and use them; they never reach into its internals.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionCookieService, SessionGuard],
  exports: [AuthService, SessionCookieService, SessionGuard],
})
export class AuthModule {}
