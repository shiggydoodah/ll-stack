import { defineSpecimen } from '../../../specimens/define';
import { Avatar, Badge, Button, Grid, GridItem, Skeleton } from '../index';
import type { GridColumns, GridGap } from '../index';

type GridDemoProps = {
  columns: number;
  gap: GridGap;
  responsive: boolean;
  featured: boolean;
  loading: boolean;
  itemCount: number;
};

// ── Custom profile card (ui-lab only, composed from @ll-ui/react primitives) ─────────

type Profile = {
  name: string;
  handle: string;
  initials: string;
  role: string;
};

const SAMPLE_PROFILES: Profile[] = [
  { name: 'Ada Lovelace', handle: 'ada', initials: 'AL', role: 'Engineering' },
  { name: 'Alan Turing', handle: 'alan', initials: 'AT', role: 'Research' },
  { name: 'Grace Hopper', handle: 'grace', initials: 'GH', role: 'Compilers' },
  { name: 'Katherine Johnson', handle: 'katherine', initials: 'KJ', role: 'Mathematics' },
  { name: 'Dennis Ritchie', handle: 'dennis', initials: 'DR', role: 'Systems' },
  { name: 'Margaret Hamilton', handle: 'margaret', initials: 'MH', role: 'Flight Software' },
];

const cardClass =
  'flex h-full flex-col gap-3 rounded-(--ui-radius-sm) border border-(--ui-border) bg-(--ui-foreground)/5 p-4';

const ProfileCard = ({ profile }: { profile: Profile }) => (
  <div className={cardClass}>
    <div className="flex items-center gap-3">
      <Avatar initials={profile.initials} size="md" />
      <div className="flex flex-col">
        <span className="font-display font-bold text-(--ui-foreground)">{profile.name}</span>
        <span className="text-sm text-(--ui-text-subtle)">@{profile.handle}</span>
      </div>
    </div>
    <Badge tone="blue" variant="soft">
      {profile.role}
    </Badge>
    <Button tone="neutral" variant="outline" size="xsmall" className="mt-auto">
      View profile
    </Button>
  </div>
);

const ProfileCardSkeleton = () => (
  <div className={cardClass} aria-busy="true">
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton preset="text" className="w-2/3" />
        <Skeleton preset="text" className="w-1/3" />
      </div>
    </div>
    <Skeleton preset="text" className="w-1/2" />
    <Skeleton preset="button" className="mt-auto" />
  </div>
);

// ── Demo wrapper driven by the lab's prop editor ─────────────────────────────────

const clampColumns = (value: number): GridColumns =>
  Math.min(Math.max(Math.round(value), 1), 6) as GridColumns;

/**
 * Flat-prop wrapper so `Grid` can be driven by the lab's prop editor (which only
 * supports scalar controls). The responsive `cols` object is built internally
 * from the `columns` + `responsive` controls. `featured` demonstrates `GridItem`
 * spanning multiple columns; `loading` swaps cards for skeleton placeholders.
 */
const GridDemo = ({
  columns = 3,
  gap = 'medium',
  responsive = true,
  featured = false,
  loading = false,
  itemCount = 6,
}: Partial<GridDemoProps>) => {
  const max = clampColumns(columns);
  const cols = responsive ? { base: 1 as const, sm: 2 as const, lg: max } : max;
  const count = Math.min(Math.max(Math.round(itemCount), 1), SAMPLE_PROFILES.length);

  return (
    <Grid cols={cols} gap={gap}>
      {SAMPLE_PROFILES.slice(0, count).map((profile, index) => {
        const content = loading ? <ProfileCardSkeleton /> : <ProfileCard profile={profile} />;

        if (featured && index === 0) {
          return (
            <GridItem key={profile.handle} colSpan={{ base: 1, lg: 2 }}>
              {content}
            </GridItem>
          );
        }

        return <div key={profile.handle}>{content}</div>;
      })}
    </Grid>
  );
};

export const gridSpecimen = defineSpecimen<GridDemoProps>({
  title: 'Grid',
  description:
    'Responsive CSS-grid layout primitive. Declare column counts per breakpoint via the cols ' +
    'prop (a number or a { base, sm, md, lg, xl, 2xl } object) and spacing via the shared gap ' +
    'scale. Cells flow one-per-track; wrap a cell in GridItem to span columns/rows. Columns ' +
    'collapse to a single track on small viewports. The cards below are composed from @ll-ui/react ' +
    'primitives and show a Skeleton loading state.',
  component: GridDemo,
  argTypes: {
    columns: { control: 'number', defaultValue: 3 },
    gap: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    responsive: { control: 'boolean', defaultValue: true },
    featured: { control: 'boolean', defaultValue: false },
    loading: { control: 'boolean', defaultValue: false },
    itemCount: { control: 'number', defaultValue: 6 },
  },
  variants: [
    { name: '3 columns (responsive)', props: { columns: 3, responsive: true } },
    { name: '2 columns', props: { columns: 2, responsive: true } },
    { name: 'Featured first (col span)', props: { columns: 3, featured: true } },
    { name: 'Loading (skeletons)', props: { columns: 3, loading: true } },
    { name: 'Fixed (non-responsive)', props: { columns: 3, responsive: false, gap: 'large' } },
  ],
});
