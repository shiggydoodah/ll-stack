import type { ConfigService } from '@nestjs/config';

import { PrismaService } from '../src/prisma/prisma.service';

function makeConfigService(): ConfigService {
  const cfg: Partial<ConfigService> = {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        DATABASE_URL: 'postgresql://localhost:5433/test',
        NODE_ENV: process.env['NODE_ENV'],
        LOG_SLOW_QUERY_THRESHOLD_MS: 500,
      };
      return config[key];
    }),
  };
  return cfg as ConfigService;
}

describe('PrismaService', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalOpenApiExtract = process.env['OPENAPI_EXTRACT'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    process.env['OPENAPI_EXTRACT'] = originalOpenApiExtract;
    jest.restoreAllMocks();
  });

  it('skips eager connect in test environment', async () => {
    process.env['NODE_ENV'] = 'test';
    const service = new PrismaService(makeConfigService());
    const connectSpy = jest.spyOn(service, '$connect');

    await service.onModuleInit();

    expect(connectSpy).not.toHaveBeenCalled();
    await service.$disconnect();
  });

  it('skips eager connect in OpenAPI extraction mode', async () => {
    process.env['NODE_ENV'] = 'development';
    process.env['OPENAPI_EXTRACT'] = 'true';
    const service = new PrismaService(makeConfigService());
    const connectSpy = jest.spyOn(service, '$connect');

    await service.onModuleInit();

    expect(connectSpy).not.toHaveBeenCalled();
    await service.$disconnect();
  });
});
