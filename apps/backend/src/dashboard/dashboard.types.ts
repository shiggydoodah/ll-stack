import type { UserRole } from '@prisma/client';

export interface DashboardMember {
  readonly userId: string;
  readonly name: string;
  /**
   * Masked for display, never the stored address — this list goes to any
   * signed-in member. See `common/utils/mask-email.ts` for what the mask keeps
   * and why. The domain type carries the masked form so the full address never
   * leaves `DashboardService`.
   */
  readonly emailMasked: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
}

export interface DashboardSummary {
  readonly totalMembers: number;
  readonly members: readonly DashboardMember[];
}
