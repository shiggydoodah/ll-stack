'use client';

import { useMemo, useState } from 'react';
import type { DashboardMemberDto } from '@repo/services/dashboard';
import { Avatar, Badge, Button, Eyebrow, Heading, Input, Text } from '@repo/ui/primitives';
import { DataTable, createColumnHelper, type ColumnDef } from '@repo/ui/integrations';

const PAGE_SIZE = 6;

const joinedFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const initialsOf = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (part[0] ?? '').toUpperCase())
    .join('');

const columnHelper = createColumnHelper<DashboardMemberDto>();

const columns = [
  columnHelper.accessor('name', {
    header: 'User',
    cell: (info) => (
      <div className="flex items-center gap-3">
        <Avatar initials={initialsOf(info.getValue())} size="sm" />
        <div className="grid gap-0.5">
          <span className="text-sm font-semibold text-(--ui-foreground)">{info.getValue()}</span>
          {/* Masked by the backend — GET /dashboard never returns another
              member's stored address. See apps/backend/src/common/utils/mask-email.ts. */}
          <span className="text-2xs font-mono text-(--ui-text-muted)">
            {info.row.original.emailMasked}
          </span>
        </div>
      </div>
    ),
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: (info) => (
      <span className="text-2xs font-mono font-bold tracking-widest text-(--ui-text-subtle) uppercase">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.display({
    id: 'status',
    header: 'Status',
    // Every listed row is a live (non-deleted) account by contract, so the
    // status is a constant — the column exists to match the reference layout.
    cell: () => (
      <Badge tone="green" variant="outline">
        Active
      </Badge>
    ),
  }),
  columnHelper.accessor('joinedAt', {
    header: 'Joined',
    cell: (info) => (
      <span className="text-2xs font-mono whitespace-nowrap text-(--ui-text-muted)">
        {joinedFormatter.format(new Date(info.getValue()))}
      </span>
    ),
  }),
] as ColumnDef<DashboardMemberDto, unknown>[];

interface UsersPanelProps {
  totalMembers: number;
  members: DashboardMemberDto[];
}

/**
 * The dashboard's example users table (LL-STACK Boilerplate design): result
 * summary, client-side search over the recent-members sample, and a sortable,
 * paginated DataTable.
 */
const UsersPanel = ({ totalMembers, members }: UsersPanelProps) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      `${member.name} ${member.emailMasked} ${member.role}`.toLowerCase().includes(needle),
    );
  }, [members, query]);

  const summary =
    filtered.length === members.length
      ? `${totalMembers} member${totalMembers === 1 ? '' : 's'}`
      : `${filtered.length} of ${members.length} shown`;

  return (
    <section className="flex flex-col gap-5 py-7">
      <div className="flex flex-wrap items-end justify-between gap-5 px-6">
        <div>
          <Eyebrow size="small" className="mb-3">
            {summary}
          </Eyebrow>
          <Heading.H1 size="medium" leading="tight">
            Users
          </Heading.H1>
        </div>
        <div className="flex items-stretch gap-2.5">
          <Input
            id="dashboard-user-search"
            type="search"
            aria-label="Search users"
            placeholder="Search…"
            className="w-50"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            type="button"
            tone="neutral"
            variant="solid"
            title="Example only"
            className="text-2xs gap-2 font-mono font-bold tracking-widest uppercase"
          >
            Invite
            <span aria-hidden="true" className="tracking-normal">
              +
            </span>
          </Button>
        </div>
      </div>

      <div className="px-6">
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.userId}
          enableSorting
          pagination
          pageSize={PAGE_SIZE}
          emptyState={
            <div className="py-10 text-center">
              <Text.P size="medium" weight="bold" className="mb-1">
                No users match “{query}”
              </Text.P>
              <Text.P size="small" tone="muted" className="font-mono uppercase">
                Try a different name, email, or role
              </Text.P>
            </div>
          }
        />
      </div>
    </section>
  );
};

export default UsersPanel;
