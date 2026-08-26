import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { Env } from '../config/env.schema';
import { createSlowQueryHandler } from './prisma-slow-query-logger';

/**
 * The one Prisma client. Feature code injects this service rather than
 * constructing a `PrismaClient` of its own (enforced by the
 * `no-restricted-imports` rule in the root eslint config): a second client is
 * a second connection pool whose lifecycle nothing manages, and it would skip
 * the slow-query logging wired up here.
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly configService: ConfigService<Env>) {
    // configService parameter is used directly here because `this` is unavailable before super()
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    });
    super({
      adapter,
      log: [{ level: 'query', emit: 'event' }],
    });
  }

  async onModuleInit(): Promise<void> {
    // OPENAPI_EXTRACT is a build-time escape hatch not present in the env schema, so it reads process.env directly
    if (
      this.configService.get('NODE_ENV', { infer: true }) === 'test' ||
      process.env['OPENAPI_EXTRACT'] === 'true'
    ) {
      return;
    }

    const thresholdMs =
      this.configService.get('LOG_SLOW_QUERY_THRESHOLD_MS', { infer: true }) ?? 500;
    this.$on('query', createSlowQueryHandler(thresholdMs));

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
