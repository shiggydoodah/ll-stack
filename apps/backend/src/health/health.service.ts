import { Injectable } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(version: string): Promise<HealthResponseDto> {
    const databaseStatus = await this.getDatabaseStatus();

    return {
      status: databaseStatus === 'up' ? 'ok' : 'degraded',
      version,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      database: {
        status: databaseStatus,
      },
    };
  }

  private async getDatabaseStatus(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
