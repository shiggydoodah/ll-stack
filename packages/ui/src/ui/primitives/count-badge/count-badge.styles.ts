import { cva } from 'class-variance-authority';

import type { UiSize, UiTone, UiVariant } from '../../../types/ui.types';

export type CountBadgeTone = UiTone;
export type CountBadgeVariant = Exclude<UiVariant, 'ghost'>;
export type CountBadgeSize = UiSize;

/**
 * Pill-or-circle layout. `rounded-full` plus an equal `h-*`/`min-w-*` makes a
 * single digit render as a circle while multi-digit values grow into a pill.
 */
export const countBadgeLayoutClass = cva(
  'ui-badge font-body inline-flex shrink-0 items-center justify-center rounded-full border-(length:--ui-border-width) align-middle text-center font-bold leading-none tabular-nums',
  {
    variants: {
      size: {
        xsmall: 'h-3.5 min-w-3.5 px-1 text-2xs',
        small: 'h-4 min-w-4 px-1 text-2xs',
        medium: 'h-5 min-w-5 px-1.5 text-2xs',
        large: 'h-6 min-w-6 px-1.5 text-xs',
        xlarge: 'h-7 min-w-7 px-2 text-sm',
      },
    },
    defaultVariants: { size: 'medium' },
  },
);

export const countBadgeToneClasses = {
  neutral: {
    solid: 'border-(--ui-foreground) bg-(--ui-foreground) text-(--ui-background)',
    surface: 'border-(--ui-foreground)/20 bg-(--ui-foreground)/10 text-(--ui-foreground)',
    soft: 'border-(--ui-foreground)/10 bg-(--ui-foreground)/10 text-(--ui-foreground)/80',
    outline: 'border-(--ui-foreground) bg-transparent text-(--ui-foreground)',
  },
  red: {
    solid: 'border-tone-red bg-tone-red text-tone-red-contrast',
    surface: 'border-tone-red/20 bg-tone-red/20 text-tone-red',
    soft: 'border-tone-red/10 bg-tone-red/10 text-tone-red/80',
    outline: 'border-tone-red bg-transparent text-tone-red',
  },
  green: {
    solid: 'border-tone-green bg-tone-green text-tone-green-contrast',
    surface: 'border-tone-green/20 bg-tone-green/20 text-tone-green',
    soft: 'border-tone-green/10 bg-tone-green/10 text-tone-green/80',
    outline: 'border-tone-green bg-transparent text-tone-green',
  },
  amber: {
    solid: 'border-tone-amber bg-tone-amber text-tone-amber-contrast',
    surface: 'border-tone-amber/20 bg-tone-amber/20 text-tone-amber',
    soft: 'border-tone-amber/10 bg-tone-amber/10 text-tone-amber/80',
    outline: 'border-tone-amber bg-transparent text-tone-amber',
  },
  blue: {
    solid: 'border-tone-blue bg-tone-blue text-tone-blue-contrast',
    surface: 'border-tone-blue/20 bg-tone-blue/20 text-tone-blue',
    soft: 'border-tone-blue/10 bg-tone-blue/10 text-tone-blue/80',
    outline: 'border-tone-blue bg-transparent text-tone-blue',
  },
  purple: {
    solid: 'border-tone-purple bg-tone-purple text-tone-purple-contrast',
    surface: 'border-tone-purple/20 bg-tone-purple/20 text-tone-purple',
    soft: 'border-tone-purple/10 bg-tone-purple/10 text-tone-purple/80',
    outline: 'border-tone-purple bg-transparent text-tone-purple',
  },
  magenta: {
    solid: 'border-tone-magenta bg-tone-magenta text-tone-magenta-contrast',
    surface: 'border-tone-magenta/20 bg-tone-magenta/20 text-tone-magenta',
    soft: 'border-tone-magenta/10 bg-tone-magenta/10 text-tone-magenta/80',
    outline: 'border-tone-magenta bg-transparent text-tone-magenta',
  },
} satisfies Record<CountBadgeTone, Record<CountBadgeVariant, string>>;
