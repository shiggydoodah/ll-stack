import { cva } from 'class-variance-authority';

import type { UiSize, UiTone } from '../../../types/ui.types';

/** Overall visual treatment of the tab set. */
export type TabsVariant = 'underline' | 'pill';

/** Shape of the active-state bar (only meaningful for the `underline` variant). */
export type TabsIndicator = 'inset' | 'centered';

/** How tabs are distributed along the list. */
export type TabsAlign = 'start' | 'justified';

/** Size token. Tabs use three of the shared sizes. */
export type TabsSize = Exclude<UiSize, 'xsmall' | 'xlarge'>;

/** Accent scope for the active indicator / pill fill. */
export type TabsTone = UiTone;

/**
 * The tab list / nav container. `underline` draws a bottom divider; `pill`
 * draws a bordered track that holds filled active chips.
 */
export const tabsListClass = cva('flex', {
  variants: {
    variant: {
      underline: 'items-stretch border-b border-(--ui-border)',
      pill: 'w-fit items-center gap-1 rounded-(--ui-radius-md) border border-(--ui-border) p-1',
    },
    align: {
      start: '',
      justified: 'w-full',
    },
  },
  defaultVariants: { variant: 'underline', align: 'start' },
});

/**
 * A single tab trigger / nav link. Shared by the Radix-backed panel surface and
 * the link-based navigation surface. Both render this on a `group` element that
 * exposes `data-state="active|inactive"`, so the active styling below works
 * identically whether the state comes from Radix or from the `active` prop.
 */
export const tabTriggerClass = cva(
  'group font-display relative inline-flex cursor-pointer items-center justify-center gap-2 ' +
    'leading-none font-bold ui-display-text whitespace-nowrap transition-colors select-none ' +
    'text-(--ui-text-subtle) outline-none ' +
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-focus-ring) ' +
    'disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      size: {
        small: 'text-xs',
        medium: 'text-sm',
        large: 'text-base',
      },
      variant: {
        // Active label brightens to the foreground colour (tone-independent).
        underline: 'data-[state=active]:text-(--ui-foreground)',
        pill: 'rounded-(--ui-radius-sm) hover:text-(--ui-foreground)',
      },
      align: {
        start: 'flex-none',
        justified: 'flex-1',
      },
    },
    compoundVariants: [
      { variant: 'underline', size: 'small', class: 'px-3.5 py-2.5' },
      { variant: 'underline', size: 'medium', class: 'px-4 py-3.5' },
      { variant: 'underline', size: 'large', class: 'px-5 py-4' },
      { variant: 'pill', size: 'small', class: 'px-3 py-1.5' },
      { variant: 'pill', size: 'medium', class: 'px-3.5 py-2' },
      { variant: 'pill', size: 'large', class: 'px-4 py-2.5' },
    ],
    defaultVariants: { size: 'medium', variant: 'underline', align: 'start' },
  },
);

/**
 * The active-state bar for the `underline` variant. Hidden by default and
 * revealed when the enclosing `group` is active. The bar colour comes from the
 * tone map; only its geometry varies here.
 */
export const tabIndicatorClass = cva(
  'pointer-events-none absolute opacity-0 transition-opacity group-data-[state=active]:opacity-100',
  {
    variants: {
      indicator: {
        // Full-width 2px bar, inset by the trigger's horizontal padding.
        inset: 'inset-x-3 -bottom-px h-0.5',
        // Short 40x3px bar centred under the trigger.
        centered: 'bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-(--ui-radius-sm)',
      },
    },
    defaultVariants: { indicator: 'inset' },
  },
);

/** Optional per-tab count. Brightens to the accent colour when the tab is active. */
export const tabCountClass =
  'inline-flex items-center text-2xs leading-none font-bold tabular-nums ' +
  'text-(--ui-text-subtle) group-data-[state=active]:text-(--ui-accent)';

/** Focus ring for the active panel body. */
export const tabContentClass =
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-focus-ring)';

/**
 * Tone scope. `bar` colours the underline indicator (visibility is toggled
 * separately); `pill` is the active filled-chip treatment for the `pill`
 * variant. `red` maps to `--ui-accent` so app theme overrides still flow.
 */
export const tabsToneClasses = {
  neutral: {
    bar: 'bg-(--ui-foreground)',
    pill: 'data-[state=active]:bg-(--ui-foreground) data-[state=active]:text-(--ui-background)',
  },
  red: {
    bar: 'bg-(--ui-accent)',
    pill: 'data-[state=active]:bg-tone-red data-[state=active]:text-tone-red-contrast',
  },
  green: {
    bar: 'bg-tone-green',
    pill: 'data-[state=active]:bg-tone-green data-[state=active]:text-tone-green-contrast',
  },
  amber: {
    bar: 'bg-tone-amber',
    pill: 'data-[state=active]:bg-tone-amber data-[state=active]:text-tone-amber-contrast',
  },
  blue: {
    bar: 'bg-tone-blue',
    pill: 'data-[state=active]:bg-tone-blue data-[state=active]:text-tone-blue-contrast',
  },
  purple: {
    bar: 'bg-tone-purple',
    pill: 'data-[state=active]:bg-tone-purple data-[state=active]:text-tone-purple-contrast',
  },
  magenta: {
    bar: 'bg-tone-magenta',
    pill: 'data-[state=active]:bg-tone-magenta data-[state=active]:text-tone-magenta-contrast',
  },
} satisfies Record<TabsTone, { bar: string; pill: string }>;
