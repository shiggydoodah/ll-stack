import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import { AuthError } from './auth.errors';
import { AuthService } from './auth.service';
import { AccountResponseDto, toAccountDto } from './dto/account-response.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { SessionCookieService } from './session-cookie.service';

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

/** HTTP surface for registration, login, and logout. */
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
