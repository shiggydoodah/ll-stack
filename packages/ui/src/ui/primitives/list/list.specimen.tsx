import { Star } from '../../icons';
import { defineSpecimen } from '../../../specimens/define';
import { Avatar, Box, List, Skeleton, Stack, Text } from '../index';
import type { ListItemIconSize, ListItemIconTone } from '../index';

type NamedPreset = 'success' | 'danger' | 'warning' | 'info' | 'disabled';
type ListPreset = NamedPreset | 'mixed' | 'custom';

type ListDemoProps = {
  preset: ListPreset;
  tone: ListItemIconTone;
  size: ListItemIconSize;
  loading: boolean;
};

// ── Sample data (ui-lab only) ────────────────────────────────────────────────────

const MIXED_ROWS: { label: string; preset: NamedPreset }[] = [
  { label: 'Database migration applied', preset: 'success' },
  { label: 'Payment webhook failed', preset: 'danger' },
  { label: 'TLS certificate expires in 5 days', preset: 'warning' },
  { label: 'New region eu-west-2 available', preset: 'info' },
  { label: 'Legacy CSV export disabled', preset: 'disabled' },
];

const GENERIC_ROWS = ['Provisioned compute', 'Synced object storage', 'Configured DNS records'];

const SKELETON_ROWS = ['s1', 's2', 's3', 's4'];

const renderPresetIcon = (preset: NamedPreset, size: ListItemIconSize) => {
  switch (preset) {
    case 'success':
      return <List.SuccessIcon size={size} />;
    case 'danger':
      return <List.DangerIcon size={size} />;
    case 'warning':
      return <List.WarningIcon size={size} />;
    case 'info':
      return <List.InfoIcon size={size} />;
    case 'disabled':
      return <List.DisabledIcon size={size} />;
  }
};

const ListBody = ({
  preset,
  tone,
  size,
}: {
  preset: ListPreset;
  tone: ListItemIconTone;
  size: ListItemIconSize;
}) => {
  if (preset === 'mixed') {
    return (
      <List.Root>
        {MIXED_ROWS.map((row) => (
          <List.Item key={row.label}>
            {renderPresetIcon(row.preset, size)}
            {row.label}
          </List.Item>
        ))}
      </List.Root>
    );
  }

  return (
    <List.Root>
      {GENERIC_ROWS.map((label) => (
        <List.Item key={label}>
          {preset === 'custom' ? (
            <List.ItemIcon icon={Star} tone={tone} size={size} />
          ) : (
            renderPresetIcon(preset, size)
          )}
          {label}
        </List.Item>
      ))}
    </List.Root>
  );
};

/** Skeleton placeholder mirroring the loaded list's icon-chip + text rhythm. */
const ListSkeleton = () => (
  <Stack gap="sm" aria-busy>
    {SKELETON_ROWS.map((id) => (
      <div key={id} className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton preset="text" className="w-3/4" />
      </div>
    ))}
  </Stack>
);

/**
 * Flat-prop wrapper so the lab's prop editor can drive the compound `List`. A status card
 * (composed only from `@ll-ui/react` primitives) wraps the list in a `Box` with an `Avatar`/`Text`
 * header. `preset` picks the leading-icon style (`mixed` shows one of each preset; `custom` uses
 * a Lucide `Star` driven by the `tone` control); `size` scales the chips; `loading` swaps in a
 * `Skeleton` placeholder.
 */
const ListDemo = ({
  preset = 'mixed',
  tone = 'purple',
  size = 'medium',
  loading = false,
}: Partial<ListDemoProps>) => (
  <Box variant="surface" padding="md" maxWidth="sm" className="w-full">
    <Stack gap="md">
      <div className="flex items-center gap-3">
        <Avatar initials="OPS" size="md" />
        <div className="flex flex-col">
          <Text weight="bold">Deployment status</Text>
          <Text size="small" tone="subtle">
            prod · us-east-1
          </Text>
        </div>
      </div>
      {loading ? <ListSkeleton /> : <ListBody preset={preset} tone={tone} size={size} />}
    </Stack>
  </Box>
);

export const listSpecimen = defineSpecimen<ListDemoProps>({
  title: 'List',
  description:
    'Compound list (List.Root / List.Item / List.ItemIcon) for items with leading icons. ' +
    'A single tone prop on List.ItemIcon colours the icon and its soft tinted background ' +
    '(default = brand accent); item text defaults to the foreground colour and is restyled by ' +
    'styling your own children. Semantic presets (List.SuccessIcon / DangerIcon / WarningIcon / ' +
    'InfoIcon / DisabledIcon) bake in a fixed icon + tone, while List.ItemIcon takes any custom ' +
    'Lucide component or React element. The demo wraps the list in a status card with a loading Skeleton.',
  component: ListDemo,
  argTypes: {
    preset: {
      control: 'select',
      options: ['mixed', 'success', 'danger', 'warning', 'info', 'disabled', 'custom'] as const,
      defaultValue: 'mixed',
    },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'purple',
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'] as const,
      defaultValue: 'medium',
    },
    loading: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Mixed presets', props: { preset: 'mixed' } },
    { name: 'All success', props: { preset: 'success' } },
    { name: 'Custom icon + tone', props: { preset: 'custom', tone: 'amber' } },
    { name: 'Large icons', props: { preset: 'mixed', size: 'large' } },
    { name: 'Loading', props: { loading: true } },
  ],
});
