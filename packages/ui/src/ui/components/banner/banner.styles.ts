import { cva } from 'class-variance-authority';

import type { UiTone, UiVariant } from '../../../types/ui.types';

export type BannerTone = UiTone;
export type BannerVariant = Exclude<UiVariant, 'ghost'>;

export const bannerLayoutClass = cva(
  'ui-banner flex w-full items-start gap-3 rounded-(--ui-radius-md) border-(length:--ui-border-width) px-4 py-3 text-sm',
);

export const bannerToneClasses = {
  neutral: {
    solid: 'border-(--ui-foreground) bg-(--ui-foreground) text-(--ui-background)',
    surface: 'border-(--ui-foreground)/20 bg-(--ui-foreground)/10 text-(--ui-foreground)',
    soft: 'border-transparent bg-(--ui-foreground)/8 text-(--ui-foreground)',
    outline: 'border-(--ui-border-strong) bg-transparent text-(--ui-foreground)',
  },
  red: {
    solid: 'border-tone-red bg-tone-red text-tone-red-contrast',
    surface: 'border-tone-red/20 bg-tone-red/20 text-tone-red',
    soft: 'border-transparent bg-tone-red/10 text-tone-red',
    outline: 'border-tone-red bg-transparent text-tone-red',
  },
  green: {
    solid: 'border-tone-green bg-tone-green text-tone-green-contrast',
    surface: 'border-tone-green/20 bg-tone-green/20 text-tone-green',
    soft: 'border-transparent bg-tone-green/10 text-tone-green',
    outline: 'border-tone-green bg-transparent text-tone-green',
  },
  amber: {
    solid: 'border-tone-amber bg-tone-amber text-tone-amber-contrast',
    surface: 'border-tone-amber/20 bg-tone-amber/20 text-tone-amber',
    soft: 'border-transparent bg-tone-amber/10 text-tone-amber',
    outline: 'border-tone-amber bg-transparent text-tone-amber',
  },
  blue: {
    solid: 'border-tone-blue bg-tone-blue text-tone-blue-contrast',
    surface: 'border-tone-blue/20 bg-tone-blue/20 text-tone-blue',
    soft: 'border-transparent bg-tone-blue/10 text-tone-blue',
    outline: 'border-tone-blue bg-transparent text-tone-blue',
  },
  purple: {
    solid: 'border-tone-purple bg-tone-purple text-tone-purple-contrast',
    surface: 'border-tone-purple/20 bg-tone-purple/20 text-tone-purple',
    soft: 'border-transparent bg-tone-purple/10 text-tone-purple',
    outline: 'border-tone-purple bg-transparent text-tone-purple',
  },
  magenta: {
    solid: 'border-tone-magenta bg-tone-magenta text-tone-magenta-contrast',
    surface: 'border-tone-magenta/20 bg-tone-magenta/20 text-tone-magenta',
    soft: 'border-transparent bg-tone-magenta/10 text-tone-magenta',
    outline: 'border-tone-magenta bg-transparent text-tone-magenta',
  },
} satisfies Record<BannerTone, Record<BannerVariant, string>>;
