import { ApiProperty } from '@nestjs/swagger';

export class HealthDatabaseStatusDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  status!: 'up' | 'down';
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status!: string;

  @ApiProperty({ example: '0.0.1' })
  version!: string;

  @ApiProperty({ example: '2026-05-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 12.345 })
  uptimeSeconds!: number;

  @ApiProperty({ type: HealthDatabaseStatusDto })
  database!: HealthDatabaseStatusDto;
}
