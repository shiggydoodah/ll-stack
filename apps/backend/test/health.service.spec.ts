import { HealthService } from '../src/health/health.service';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('HealthService', () => {
  const version = '0.0.1';

  it('returns database up when the query succeeds', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    const result = await service.getHealth(version);

    expect(result.status).toBe('ok');
    expect(result.database.status).toBe('up');
  });

  it('returns database down when the query fails', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db unavailable')),
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    const result = await service.getHealth(version);

    expect(result.status).toBe('degraded');
    expect(result.database.status).toBe('down');
  });
});
