import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import type { DashboardSummary } from '../dashboard.types';

export class DashboardMemberDto {
  @ApiProperty({ example: '01890c4b-1d6a-7c00-93b6-2c9c0a3d5f10' })
  userId!: string;

  @ApiProperty({ example: 'Ada Whitcombe' })
  name!: string;

  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.MEMBER })
  role!: UserRole;

  @ApiProperty({ example: '2026-08-25T12:00:00.000Z' })
  joinedAt!: string;
}

export class DashboardResponseDto {
  @ApiProperty({ example: 42, description: 'Count of live (non-deleted) accounts' })
  totalMembers!: number;

  @ApiProperty({ type: [DashboardMemberDto], description: 'Most recently joined live accounts' })
  members!: DashboardMemberDto[];
}

/** Map the domain {@link DashboardSummary} to its public wire DTO. */
export function toDashboardResponseDto(summary: DashboardSummary): DashboardResponseDto {
  return {
    totalMembers: summary.totalMembers,
    members: summary.members.map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
  };
}
