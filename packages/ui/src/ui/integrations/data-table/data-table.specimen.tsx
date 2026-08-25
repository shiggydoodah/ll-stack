import { useState } from 'react';
import { createColumnHelper, DataTable } from '../index';
import type { ColumnDef } from '../index';
import { defineSpecimen } from '../../../specimens/define';
import { Badge, Text } from '../../primitives';
import type { BadgeTone, TableDensity } from '../../primitives';

type DataTableDemoProps = {
  enableSorting: boolean;
  enableRowSelection: boolean;
  pagination: boolean;
  isLoading: boolean;
  empty: boolean;
  density: TableDensity;
};

// ── Sample data (ui-lab only) ────────────────────────────────────────────────────

type Account = {
  id: string;
  workspace: string;
  plan: string;
  seats: number;
  status: 'Active' | 'Trialing' | 'Past due';
};

const STATUS_TONE: Record<Account['status'], BadgeTone> = {
  Active: 'green',
  Trialing: 'blue',
  'Past due': 'amber',
};

const DATA: Account[] = [
  { id: 'ws_8fa2', workspace: 'Northwind', plan: 'Scale', seats: 48, status: 'Active' },
  { id: 'ws_1c7d', workspace: 'Acme Labs', plan: 'Pro', seats: 12, status: 'Trialing' },
  { id: 'ws_44b0', workspace: 'Globex', plan: 'Pro', seats: 9, status: 'Past due' },
  { id: 'ws_9e31', workspace: 'Initech', plan: 'Scale', seats: 73, status: 'Active' },
  { id: 'ws_2a6f', workspace: 'Soylent', plan: 'Starter', seats: 4, status: 'Active' },
  { id: 'ws_77cd', workspace: 'Umbrella', plan: 'Scale', seats: 61, status: 'Active' },
  { id: 'ws_0b19', workspace: 'Hooli', plan: 'Pro', seats: 18, status: 'Trialing' },
  { id: 'ws_3d52', workspace: 'Stark Inc', plan: 'Scale', seats: 96, status: 'Active' },
];

const column = createColumnHelper<Account>();

// Column definitions own all app-specific cell content — the DataTable only ships chrome + engine.
// The assertion is TanStack's documented pattern for mixed accessor value types: ColumnDef is
// invariant in TValue (cell receives CellContext<TData, TValue>), so the inferred
// ColumnDef<Account, string | number | …> elements do not assign to ColumnDef<Account, unknown>.
const columns = [
  column.accessor('workspace', {
    header: 'Workspace',
    cell: (cell) => <span className="font-medium text-(--ui-foreground)">{cell.getValue()}</span>,
  }),
  column.accessor('id', {
    header: 'ID',
    enableSorting: false,
    cell: (cell) => <span className="font-mono text-(--ui-text-subtle)">{cell.getValue()}</span>,
  }),
  column.accessor('plan', { header: 'Plan' }),
  column.accessor('seats', {
    header: 'Seats',
    meta: { align: 'right' },
    cell: (cell) => <span className="tabular-nums">{cell.getValue()}</span>,
  }),
  column.accessor('status', {
    header: 'Status',
    meta: { align: 'right' },
    cell: (cell) => (
      <Badge tone={STATUS_TONE[cell.getValue()]} variant="soft">
        {cell.getValue()}
      </Badge>
    ),
  }),
] as ColumnDef<Account, unknown>[];

/**
 * Data-driven table built on TanStack Table, rendered through the shared `Table` primitive.
 * Toggle the feature flags to see sorting, row selection (checkbox + indeterminate select-all),
 * client pagination, the loading skeleton, and the empty state. Rows are clickable (keyboard
 * operable) — the last clicked workspace is echoed below the table.
 */
const DataTableDemo = ({
  enableSorting = true,
  enableRowSelection = false,
  pagination = false,
  isLoading = false,
  empty = false,
  density = 'comfortable',
}: Partial<DataTableDemoProps>) => {
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  return (
    <div className="w-full max-w-3xl">
      <div className="overflow-hidden rounded-(--ui-radius-md) border border-(--ui-border)">
        <DataTable
          columns={columns}
          data={empty ? [] : DATA}
          density={density}
          enableSorting={enableSorting}
          enableRowSelection={enableRowSelection}
          pagination={pagination}
          pageSize={5}
          isLoading={isLoading}
          onRowClick={(row) => setLastClicked(row.original.workspace)}
        />
      </div>
      <Text size="small" tone="subtle" className="mt-2 block">
        {lastClicked ? `Last clicked: ${lastClicked}` : 'Click a row to select it.'}
      </Text>
    </div>
  );
};

export const dataTableSpecimen = defineSpecimen<DataTableDemoProps>({
  title: 'DataTable',
  description:
    'TanStack Table wired into the @ll-ui/react Table primitive. Drive it with `columns` + `data` + ' +
    'opt-in flags (or hand it a pre-built table instance via the `table` escape hatch). Sorting ' +
    'makes headers keyboard-operable with aria-sort; row selection injects an indeterminate ' +
    'select-all checkbox column; `pagination` adds a client pager (pass a ManualPagination object ' +
    'for keyset/server paging); `isLoading` shows skeleton rows and `empty` shows the empty state. ' +
    'createColumnHelper / flexRender / the key types are re-exported, so you never import TanStack directly.',
  component: DataTableDemo,
  argTypes: {
    enableSorting: { control: 'boolean', defaultValue: true },
    enableRowSelection: { control: 'boolean', defaultValue: false },
    pagination: { control: 'boolean', defaultValue: false },
    isLoading: { control: 'boolean', defaultValue: false },
    empty: { control: 'boolean', defaultValue: false },
    density: {
      control: 'select',
      options: ['comfortable', 'compact'] as const,
      defaultValue: 'comfortable',
    },
  },
  variants: [
    { name: 'Default', props: {} },
    { name: 'Sortable', props: { enableSorting: true } },
    { name: 'Selectable', props: { enableRowSelection: true } },
    { name: 'Paginated', props: { pagination: true } },
    { name: 'Loading', props: { isLoading: true } },
    { name: 'Empty', props: { empty: true } },
  ],
});
