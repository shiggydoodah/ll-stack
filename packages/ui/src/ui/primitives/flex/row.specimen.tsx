import { defineSpecimen } from '../../../specimens/define';
import { Avatar, Badge, Button, Row, Skeleton, Stack } from '../index';
import type { FlexAlign, FlexJustify, FlexSpace } from '../index';

type RowDemoProps = {
  padding: FlexSpace;
  gap: FlexSpace;
  align: FlexAlign;
  justify: FlexJustify;
  wrap: boolean;
  responsive: boolean;
  loading: boolean;
};

// ── Custom profile row (ui-lab only, composed from @ll-ui/react primitives) ──────────

/** Skeleton placeholder mirroring the loaded row's horizontal layout. */
const ProfileRowSkeleton = () => (
  <>
    <Skeleton className="size-12 rounded-full" />
    <Stack gap="xs">
      <Skeleton preset="text" className="w-32" />
      <Skeleton preset="text" className="w-20" />
    </Stack>
    <Skeleton preset="button" />
  </>
);

const ProfileRowBody = () => (
  <>
    <Avatar initials="AL" size="md" />
    <Stack gap="none">
      <span className="font-display font-bold text-(--ui-foreground)">Ada Lovelace</span>
      <span className="text-sm text-(--ui-text-subtle)">@ada</span>
    </Stack>
    <Badge tone="blue" variant="soft">
      Pro
    </Badge>
    <Button tone="neutral" variant="outline" size="xsmall">
      Follow
    </Button>
  </>
);

/**
 * Flat-prop wrapper so the lab's prop editor can drive `Row`. Lays a profile row (composed from
 * `@ll-ui/react` primitives, including a nested `Stack` for the name block) horizontally, with a
 * `loading` toggle for the `Skeleton` state. `responsive` (default true) collapses the row to a
 * column below the `sm` breakpoint — resize the viewport to see it.
 */
const RowDemo = ({
  padding = 'md',
  gap = 'md',
  align = 'center',
  justify = 'start',
  wrap = false,
  responsive = true,
  loading = false,
}: Partial<RowDemoProps>) => (
  <Row
    padding={padding}
    gap={gap}
    align={align}
    justify={justify}
    wrap={wrap}
    responsive={responsive}
    className="w-full rounded-(--ui-radius-lg) border border-(--ui-border) bg-(--ui-input-background)"
  >
    {loading ? <ProfileRowSkeleton /> : <ProfileRowBody />}
  </Row>
);

export const rowSpecimen = defineSpecimen<RowDemoProps>({
  title: 'Row',
  description:
    'Horizontal flex container (flex-row) sharing the same padding/gap scale and align/justify ' +
    'props as Stack. By default it is responsive — stacking vertically below the sm breakpoint and ' +
    'becoming a row at sm+; set responsive={false} to stay a row at every width. A simple <div> ' +
    'wrapper that forwards ref and native attributes. The demo shows a profile row and its loading ' +
    'Skeleton.',
  component: RowDemo,
  argTypes: {
    padding: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const,
      defaultValue: 'md',
    },
    gap: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const,
      defaultValue: 'md',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end', 'stretch', 'baseline'] as const,
      defaultValue: 'center',
    },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'] as const,
      defaultValue: 'start',
    },
    wrap: { control: 'boolean', defaultValue: false },
    responsive: { control: 'boolean', defaultValue: true },
    loading: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Responsive (stacks on mobile)', props: { responsive: true, justify: 'start' } },
    { name: 'Always a row', props: { responsive: false } },
    { name: 'Space between', props: { responsive: false, justify: 'between' } },
    { name: 'Loading', props: { loading: true } },
  ],
});
