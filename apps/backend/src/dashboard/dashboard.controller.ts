import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../common/filters/api-error-response.dto';
import { ApiInternalErrorResponse } from '../common/filters/api-internal-error-response.decorator';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie.service';
import { SessionGuard } from '../auth/session.guard';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto, toDashboardResponseDto } from './dto/dashboard-response.dto';

/**
 * Example authenticated read backing the boilerplate's dashboard homepage.
 * Deliberately a bounded summary (no pagination contract) — replace it with
 * real product endpoints when building on the stack. Global 60 req/min
 * throttle default suffices: an authenticated, cheap, bounded read.
 */
@ApiTags('dashboard')
@Controller('dashboard')
@ApiInternalErrorResponse()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @UseGuards(SessionGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({ summary: 'Return the dashboard summary for the signed-in member' })
  @ApiOkResponse({ type: DashboardResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'Session cookie is missing or invalid — or the x-api-secret header is missing/invalid',
    type: ApiErrorResponseDto,
  })
  async getDashboard(): Promise<DashboardResponseDto> {
    return toDashboardResponseDto(await this.dashboardService.getSummary());
  }
}
