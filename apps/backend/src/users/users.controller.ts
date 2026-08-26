import { Controller, Get, HttpException, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiErrorResponseDto } from '../common/filters/api-error-response.dto';
import { ApiInternalErrorResponse } from '../common/filters/api-internal-error-response.decorator';
import { AuthService } from '../auth/auth.service';
import { AccountResponseDto, toAccountDto } from '../auth/dto/account-response.dto';
import { SESSION_COOKIE_NAME, SessionCookieService } from '../auth/session-cookie.service';
import { SessionGuard } from '../auth/session.guard';
import type { AuthenticatedRequest } from '../auth/session-request.types';

/** Account-facing reads for the signed-in member. */
@ApiTags('users')
@Controller('users')
@ApiInternalErrorResponse()
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookies: SessionCookieService,
  ) {}

  /** Returns the public account projection for the current session cookie. */
  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({ summary: 'Return the account behind the current session cookie' })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'Session cookie is missing, invalid, or no longer resolves to an account — or the x-api-secret header is missing/invalid',
    type: ApiErrorResponseDto,
  })
  async getMe(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponseDto> {
    const account = await this.authService.getUserById(req.session.userId);
    if (account === null) {
      this.sessionCookies.clear(res);
      throw new HttpException(
        { message: 'Session no longer valid', error: 'SESSION_INVALID' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return { account: toAccountDto(account) };
  }
}
