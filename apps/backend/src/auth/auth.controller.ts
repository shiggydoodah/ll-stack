import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ApiErrorResponseDto } from '../common/filters/api-error-response.dto';
import { ApiInternalErrorResponse } from '../common/filters/api-internal-error-response.decorator';
import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';
import { AuthLoginThrottlerGuard } from './auth-login-throttler.guard';
import { AuthRegisterThrottlerGuard } from './auth-register-throttler.guard';
import { AuthSessionRotateThrottlerGuard } from './auth-session-rotate-throttler.guard';
import { AuthSessionsRevokeThrottlerGuard } from './auth-sessions-revoke-throttler.guard';
import { AuthError } from './auth.errors';
import { AuthService } from './auth.service';
import { AccountResponseDto, toAccountDto } from './dto/account-response.dto';
import {
  ActiveSessionsResponseDto,
  toActiveSessionsResponseDto,
} from './dto/active-sessions-response.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { RevokeSessionsRequestDto } from './dto/revoke-sessions-request.dto';
import { RevokeSessionsResponseDto } from './dto/revoke-sessions-response.dto';
import { SessionRotationResponseDto } from './dto/session-rotation-response.dto';
import { SESSION_COOKIE_NAME, SessionCookieService } from './session-cookie.service';
import type { AuthenticatedRequest } from './session-request.types';
import { SessionGuard } from './session.guard';

function assertNeverAuthErrorCode(code: never): never {
  throw new Error(`Unhandled auth error code: ${String(code)}`);
}

/**
 * Exhaustive domain-error → HTTP mapping. A new {@link AuthErrorCode} member
 * that is not mapped here is a compile error via the `never` assert.
 */
function toAuthHttpException(error: AuthError): HttpException {
  const response = { message: error.message, error: error.code };

  switch (error.code) {
    case 'CONSENT_REQUIRED':
    case 'INVALID_CREDENTIALS':
    case 'ACCOUNT_NOT_FOUND':
      return new BadRequestException(response);
    case 'EMAIL_ALREADY_REGISTERED':
      return new ConflictException(response);
    case 'SESSION_INVALID':
      return new UnauthorizedException(response);
    default:
      return assertNeverAuthErrorCode(error.code);
  }
}

/** HTTP surface for registration, login, logout, and a member's own sessions. */
@ApiTags('auth')
@Controller('auth')
@ApiInternalErrorResponse()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookies: SessionCookieService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthRegisterThrottlerGuard)
  @ApiOperation({ summary: 'Register a new account and issue a session cookie' })
  @ApiCreatedResponse({ type: AccountResponseDto })
  @ApiBadRequestResponse({
    description:
      'Validation failure, or an auth domain rejection (CONSENT_REQUIRED / INVALID_CREDENTIALS)',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-secret (global ApiSecretGuard)',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Email already belongs to a live account (EMAIL_ALREADY_REGISTERED)',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Registration throttled (per-IP or per-email bucket); Retry-After is set',
    type: ApiErrorResponseDto,
  })
  async register(
    @Body() body: RegisterRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponseDto> {
    try {
      const account = await this.authService.register({
        name: body.name,
        email: body.email,
        password: body.password,
        consent: body.consent,
      });
      const issued = await this.authService.issueSessionForAccount(account.userId);
      this.sessionCookies.set(res, issued);
      return { account: toAccountDto(account) };
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        throw toAuthHttpException(error);
      }
      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthLoginThrottlerGuard)
  @ApiOperation({ summary: 'Authenticate with email + password; issues a session cookie' })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failure or credential rejection (INVALID_CREDENTIALS)',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-secret (global ApiSecretGuard)',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Login throttled (per-IP or per-email bucket); Retry-After is set',
    type: ApiErrorResponseDto,
  })
  async login(
    @Body() body: LoginRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponseDto> {
    try {
      const issued = await this.authService.login({
        email: body.email,
        password: body.password,
      });
      this.sessionCookies.set(res, issued);
      const account = await this.authService.getUserById(issued.session.userId);
      if (account === null) {
        throw new AuthError('ACCOUNT_NOT_FOUND');
      }
      return { account: toAccountDto(account) };
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        throw toAuthHttpException(error);
      }
      throw error;
    }
  }

  /**
   * NO SESSION GUARD, DELIBERATELY. `SessionGuard` answers 401 for anything
   * `getSession` refuses, which flattens the two cases this route exists to tell
   * apart: a token that has already been rotated away is still inside its grace
   * window and is a 200 saying "someone else holds the successor", while a token
   * that resolves to nothing is a 401. Reading the cookie here keeps that
   * distinction, and the service still refuses every dead token.
   */
  @Post('session/rotate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthSessionRotateThrottlerGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({
    summary: 'Re-issue the session token behind the cookie once it is due for rotation',
  })
  @ApiOkResponse({ type: SessionRotationResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'No session cookie, or it no longer resolves to a live session — including a retired ' +
      'token presented outside the rotation grace window, which revokes its whole family. Also ' +
      'covers a missing or invalid x-api-secret (global ApiSecretGuard).',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Rotation throttled (per-session bucket); Retry-After is set',
    type: ApiErrorResponseDto,
  })
  async rotateSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionRotationResponseDto> {
    const token = this.sessionCookies.read(req);
    if (token === null) {
      throw toAuthHttpException(new AuthError('SESSION_INVALID', 'no session cookie'));
    }

    const rotation = await this.authService.rotateSession(token);

    if (rotation.status === 'invalid') {
      this.sessionCookies.clear(res);
      throw toAuthHttpException(new AuthError('SESSION_INVALID'));
    }

    if (rotation.status === 'rotated') {
      this.sessionCookies.set(res, rotation.issued);
    }

    return {
      status: rotation.status,
      nextRotationInSeconds: rotation.nextRotationInSeconds,
    };
  }

  /**
   * The account's own view of where it is signed in. Global 60 req/min default
   * suffices: an authenticated, bounded read of the caller's own rows.
   */
  @Get('sessions')
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({ summary: "List the account's live sign-ins" })
  @ApiOkResponse({ type: ActiveSessionsResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'Session cookie is missing or invalid — or the x-api-secret header is missing/invalid',
    type: ApiErrorResponseDto,
  })
  async listSessions(@Req() req: AuthenticatedRequest): Promise<ActiveSessionsResponseDto> {
    return toActiveSessionsResponseDto(
      await this.authService.listActiveSessions(req.session.userId, req.session.sessionId),
    );
  }

  /**
   * The lever a member pulls when they think a cookie of theirs has been copied.
   *
   * `SessionGuard` BEFORE THE THROTTLER, deliberately: the bucket is keyed on
   * the signed-in user, which only exists once the guard has attached the
   * session. Anonymous callers never reach the named bucket — they are a 401
   * from the guard and are already covered by the global default.
   */
  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, AuthSessionsRevokeThrottlerGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({ summary: "Revoke the account's sign-ins, optionally sparing this one" })
  @ApiOkResponse({ type: RevokeSessionsResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failure', type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'Session cookie is missing or invalid — or the x-api-secret header is missing/invalid',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Revoke-all throttled (per-account bucket); Retry-After is set',
    type: ApiErrorResponseDto,
  })
  async revokeAllSessions(
    @Req() req: AuthenticatedRequest,
    @Body() body: RevokeSessionsRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RevokeSessionsResponseDto> {
    const keepCurrent = body.keepCurrent === true;
    try {
      const revokedSessions = await this.authService.revokeAllSessions(
        req.session.userId,
        keepCurrent ? req.session.sessionId : null,
      );

      // The caller's own token is among the revoked ones, so the cookie it
      // arrived with is now dead. Clearing it here means the browser stops
      // replaying a token every later request would 401 on anyway.
      if (!keepCurrent) {
        this.sessionCookies.clear(res);
      }

      return { revokedSessions, currentSessionRevoked: !keepCurrent };
    } catch (error: unknown) {
      if (error instanceof AuthError) {
        this.sessionCookies.clear(res);
        throw toAuthHttpException(error);
      }
      throw error;
    }
  }

  // No session guard — logout must succeed idempotently with a dead or absent
  // cookie; the global 60 req/min throttle default suffices for it.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the active session and clear the session cookie' })
  @ApiNoContentResponse({ description: 'Session revoked or no session present' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid x-api-secret (global ApiSecretGuard)',
    type: ApiErrorResponseDto,
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = this.sessionCookies.read(req);
    if (token === null) {
      this.logger.debug({
        event: BACKEND_LOG_EVENTS['auth.logout.no_session'],
        message: 'Logout called without a session cookie.',
      });
      return;
    }
    await this.authService.logout(token);
    this.sessionCookies.clear(res);
  }
}
