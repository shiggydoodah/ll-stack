import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipApiSecret } from '../common/decorators/skip-api-secret.decorator';
import { ApiInternalErrorResponse } from '../common/filters/api-internal-error-response.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

/**
 * THE PROBE, AND THE ONE CONTROLLER WHERE THE 500 NEEDED AN ARGUMENT (FU 03).
 *
 * `HealthService.getHealth` catches its only I/O failure and reports it in the
 * BODY — a database that will not answer is `status: "degraded"` with
 * `database.status: "down"` and an HTTP 200, deliberately, because pulling a
 * process out of rotation for a dependency outage takes the whole platform down
 * with the database instead of leaving it up to serve what it still can. So this
 * handler has no throwing path of its own, and the temptation is to publish no
 * 500 at all.
 *
 * That would be wrong twice over. A 500 IS reachable — the filter answers one
 * for any unhandled failure in the enhancers around the handler, and no route
 * can rule that out — and, more importantly, an unpublished 500 and an
 * impossible one look identical to whoever is writing the probe config. The
 * consumers here are infrastructure: a liveness check that treats any non-200 as
 * dead behaves very differently on this route depending on which of the two is
 * true, and the contract has to say which. It says both — the status, and the
 * fact that a database outage is not it.
 */
@ApiTags('health')
@Controller('health')
@ApiInternalErrorResponse({
  note:
    'A DATABASE OUTAGE IS NOT ONE OF THESE: an unreachable database answers 200 with ' +
    '`status: "degraded"` and `database.status: "down"`, so a probe that treats any non-200 as dead ' +
    'must read the body rather than the status line. A 500 here means the process itself failed, ' +
    'not its dependency.',
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipApiSecret()
  @ApiOperation({ summary: 'Get service health status' })
  @ApiOkResponse({ type: HealthResponseDto })
  async getHealth(): Promise<HealthResponseDto> {
    const version = process.env['npm_package_version'] ?? '0.0.1';
    return this.healthService.getHealth(version);
  }
}
