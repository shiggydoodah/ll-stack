import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { DashboardMember, DashboardSummary } from './dashboard.types';

// Bounded summary read, not a paginated list: the dashboard homepage shows a
// fixed-size recent-members panel. A full members listing (cursor pagination,
// filters) is a separate future contract.
const MEMBER_LIMIT = 8;

const MEMBER_SELECT = {
  userId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type MemberRow = Prisma.UserGetPayload<{ select: typeof MEMBER_SELECT }>;

function toDashboardMember(row: MemberRow): DashboardMember {
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    joinedAt: row.createdAt,
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent live members plus the live-member count, as one consistent snapshot. */
  async getSummary(): Promise<DashboardSummary> {
    const [totalMembers, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
        take: MEMBER_LIMIT,
        select: MEMBER_SELECT,
      }),
    ]);

    return {
      totalMembers,
      members: rows.map(toDashboardMember),
    };
  }
}
