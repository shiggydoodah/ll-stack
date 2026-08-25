import { defineSpecimen } from '../../../specimens/define';
import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../index';
import type { BadgeTone, TableDensity } from '../index';

type TableDemoProps = {
  density: TableDensity;
  stickyHeader: boolean;
  caption: boolean;
};

// ── Sample data (ui-lab only) ────────────────────────────────────────────────────

type Row = {
  id: string;
  workspace: string;
  plan: string;
  seats: number;
  status: 'Active' | 'Trialing' | 'Past due';
};

const STATUS_TONE: Record<Row['status'], BadgeTone> = {
  Active: 'green',
  Trialing: 'blue',
  'Past due': 'amber',
};

const ROWS: Row[] = [
  { id: 'ws_8fa2', workspace: 'Northwind', plan: 'Scale', seats: 48, status: 'Active' },
  { id: 'ws_1c7d', workspace: 'Acme Labs', plan: 'Pro', seats: 12, status: 'Trialing' },
  { id: 'ws_44b0', workspace: 'Globex', plan: 'Pro', seats: 9, status: 'Past due' },
  { id: 'ws_9e31', workspace: 'Initech', plan: 'Scale', seats: 73, status: 'Active' },
  { id: 'ws_2a6f', workspace: 'Soylent', plan: 'Starter', seats: 4, status: 'Active' },
  { id: 'ws_77cd', workspace: 'Umbrella', plan: 'Scale', seats: 61, status: 'Active' },
  { id: 'ws_0b19', workspace: 'Hooli', plan: 'Pro', seats: 18, status: 'Trialing' },
  { id: 'ws_3d52', workspace: 'Stark Inc', plan: 'Scale', seats: 96, status: 'Active' },
];

/**
 * Static, presentational table assembled by hand from the `Table` primitives. Shows the density
 * axis, an optional sticky header (the scroll container is height-capped so the header can pin),
 * a right-aligned numeric column, monospace IDs, and a `Badge` rendered inside a cell — the
 * library only ships the chrome, so app content like badges lives in your own cells.
 */
const TableDemo = ({
  density = 'comfortable',
  stickyHeader = false,
  caption = false,
}: Partial<TableDemoProps>) => (
  <Table
    density={density}
    stickyHeader={stickyHeader}
    containerClassName="max-h-72 rounded-(--ui-radius-md) border border-(--ui-border)"
    className="min-w-[34rem]"
  >
    {caption ? <TableCaption>Workspace subscriptions · 8 of 124</TableCaption> : null}
    <TableHeader>
      <TableRow>
        <TableHead>Workspace</TableHead>
        <TableHead>ID</TableHead>
        <TableHead>Plan</TableHead>
        <TableHead align="right">Seats</TableHead>
        <TableHead align="right">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {ROWS.map((row) => (
        <TableRow key={row.id}>
          <TableCell className="font-medium text-(--ui-foreground)">{row.workspace}</TableCell>
          <TableCell className="font-mono text-(--ui-text-subtle)">{row.id}</TableCell>
          <TableCell>{row.plan}</TableCell>
          <TableCell align="right" className="tabular-nums">
            {row.seats}
          </TableCell>
          <TableCell align="right">
            <Badge tone={STATUS_TONE[row.status]} variant="soft">
              {row.status}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const tableSpecimen = defineSpecimen<TableDemoProps>({
  title: 'Table',
  description:
    'Presentational, RSC-safe table chrome (Table / TableHeader / TableBody / TableRow / ' +
    'TableHead / TableCell / TableCaption). A `density` axis drives cell padding for every cell ' +
    'via the root table, `stickyHeader` pins the header within a height-capped scroll container, ' +
    'and `align` right-aligns header + body cells. App-specific content (badges, monospace IDs) ' +
    'lives in your cells; for sorting / pagination / selection reach for the DataTable integration.',
  component: TableDemo,
  argTypes: {
    density: {
      control: 'select',
      options: ['comfortable', 'compact'] as const,
      defaultValue: 'comfortable',
    },
    stickyHeader: { control: 'boolean', defaultValue: false },
    caption: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Comfortable', props: { density: 'comfortable' } },
    { name: 'Compact', props: { density: 'compact' } },
    { name: 'Sticky header', props: { stickyHeader: true } },
    { name: 'With caption', props: { caption: true } },
  ],
});
