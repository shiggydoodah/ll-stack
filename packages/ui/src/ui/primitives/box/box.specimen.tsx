import { defineSpecimen } from '../../../specimens/define';
import { Avatar, Badge, Box, Button, Skeleton, Stack } from '../index';
import type { BoxMaxWidth, BoxPadding, BoxVariant } from '../index';

type BoxDemoProps = {
  variant: BoxVariant;
  padding: BoxPadding;
  maxWidth: BoxMaxWidth;
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
 * Flat-prop wrapper so the lab's prop editor can drive `Box`. Wraps a profile card (composed from
 * `@ll-ui/react` primitives, laid out with a `Stack`) in a `Box`, with a `loading` toggle that swaps in
 * a `Skeleton` placeholder. The `variant` / `padding` / `maxWidth` controls show Box's surface and
 * spacing treatments.
 */
const BoxDemo = ({
  variant = 'surface',
  padding = 'md',
  maxWidth = 'sm',
  loading = false,
}: Partial<BoxDemoProps>) => (
  <Box variant={variant} padding={padding} maxWidth={maxWidth} className="w-full">
    <Stack gap="sm">{loading ? <ProfileCardSkeleton /> : <ProfileCardBody />}</Stack>
  </Box>
);

export const boxSpecimen = defineSpecimen<BoxDemoProps>({
  title: 'Box',
  description:
    'Standardised single-element surface container — a <div> with preset variant (surface ' +
    'treatment), padding (shared with Stack/Row), and an optional maxWidth. Use it as a card ' +
    '(variant="surface") or a plain padded block (variant="ghost", the default). Forwards ref and ' +
    'native attributes; className merges last. The demo shows a profile card and its loading Skeleton.',
  component: BoxDemo,
  argTypes: {
    variant: {
      control: 'select',
      options: ['surface', 'soft', 'outline', 'ghost'] as const,
      defaultValue: 'surface',
    },
    padding: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const,
      defaultValue: 'md',
    },
    maxWidth: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'] as const,
      defaultValue: 'sm',
    },
    loading: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Surface', props: { variant: 'surface', padding: 'md' } },
    { name: 'Soft', props: { variant: 'soft', padding: 'md' } },
    { name: 'Outline', props: { variant: 'outline', padding: 'md' } },
    { name: 'Ghost (plain div)', props: { variant: 'ghost', padding: 'md' } },
    { name: 'Loading', props: { variant: 'surface', loading: true } },
  ],
});
