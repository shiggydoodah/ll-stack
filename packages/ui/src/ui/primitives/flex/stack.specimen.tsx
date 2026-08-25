import { defineSpecimen } from '../../../specimens/define';
import { Avatar, Badge, Button, Skeleton, Stack } from '../index';
import type { FlexAlign, FlexJustify, FlexSpace } from '../index';

type StackDemoProps = {
  padding: FlexSpace;
  gap: FlexSpace;
  align: FlexAlign;
  justify: FlexJustify;
  loading: boolean;
};

// ── Custom profile card (ui-lab only, composed from @ll-ui/react primitives) ─────────

/** Skeleton placeholder mirroring the loaded card's vertical rhythm. */
const ProfileCardSkeleton = () => (
  <>
    <Skeleton className="size-16 rounded-full" />
    <Skeleton preset="heading" className="w-1/2" />
    <Skeleton preset="text" className="w-1/4" />
    <Skeleton preset="text" />
    <Skeleton preset="text" className="w-4/5" />
    <Skeleton preset="button" />
  </>
);

const ProfileCardBody = () => (
  <>
    <Avatar initials="AL" size="lg" />
    <span className="font-display text-lg font-bold text-(--ui-foreground)">Ada Lovelace</span>
    <span className="text-sm text-(--ui-text-subtle)">@ada</span>
    <p className="text-sm text-(--ui-text-body)">
      Mathematician &amp; writer — wrote the first algorithm intended for a machine.
    </p>
    <Badge tone="blue" variant="soft">
      Pro
    </Badge>
    <Button tone="red" variant="solid" size="small">
      Follow
    </Button>
  </>
);

/**
 * Flat-prop wrapper so the lab's prop editor can drive `Stack`. Wraps a vertical profile card
 * (composed from `@ll-ui/react` primitives) in a `Stack`, with a `loading` toggle that swaps in a
 * `Skeleton` placeholder. The bordered surface makes the `padding` / `gap` / alignment effects
 * visible.
 */
const StackDemo = ({
  padding = 'md',
  gap = 'md',
  align = 'start',
  justify = 'start',
  loading = false,
}: Partial<StackDemoProps>) => (
  <Stack
    padding={padding}
    gap={gap}
    align={align}
    justify={justify}
    className="w-72 rounded-(--ui-radius-lg) border border-(--ui-border) bg-(--ui-input-background)"
  >
    {loading ? <ProfileCardSkeleton /> : <ProfileCardBody />}
  </Stack>
);

export const stackSpecimen = defineSpecimen<StackDemoProps>({
  title: 'Stack',
  description:
    'Vertical flex container (flex-col) that lays children top-to-bottom using the shared ' +
    'padding/gap scale (none → 2xl) plus align (items-*) and justify (justify-*) props. A simple ' +
    '<div> wrapper that forwards ref and native attributes — use it instead of hand-rolling flex ' +
    'utilities. The demo shows a profile card and its loading Skeleton.',
  component: StackDemo,
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
      defaultValue: 'start',
    },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'] as const,
      defaultValue: 'start',
    },
    loading: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Comfortable', props: { padding: 'md', gap: 'md', align: 'start' } },
    { name: 'Centered', props: { align: 'center', gap: 'lg' } },
    { name: 'Tight', props: { padding: 'sm', gap: 'xs' } },
    { name: 'Loading', props: { loading: true } },
  ],
});
