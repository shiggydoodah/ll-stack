import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { BACKEND_LOG_EVENTS } from '../common/logging/log-events';

export function createSlowQueryHandler(thresholdMs: number): (event: Prisma.QueryEvent) => void {
  const logger = new Logger('PrismaSlowQuery');

  return (event: Prisma.QueryEvent): void => {
    if (event.duration < thresholdMs) {
      return;
    }

    logger.warn({
      event: BACKEND_LOG_EVENTS['db.query.slow'],
      message: 'Slow database query detected.',
      durationMs: event.duration,
      thresholdMs,
      target: event.target,
    });
  };
}
