import type { UiTone, UiVariant } from '../../../types/ui.types';

export type BadgeTone = UiTone;
export type BadgeVariant = Exclude<UiVariant, 'ghost'>;

export const badgeBaseClass =
  'ui-badge font-body text-2xs inline-flex w-fit shrink-0 items-center rounded-(--ui-radius-sm) border-(length:--ui-border-width) px-1.5 py-0.5 align-middle ui-display-text font-bold leading-none';

export const badgeToneClasses = {
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
} satisfies Record<BadgeTone, Record<BadgeVariant, string>>;
