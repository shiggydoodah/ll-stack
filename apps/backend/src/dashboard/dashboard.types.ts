import type { UserRole } from '@prisma/client';

export interface DashboardMember {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
}

export interface DashboardSummary {
  readonly totalMembers: number;
  readonly members: readonly DashboardMember[];
}
