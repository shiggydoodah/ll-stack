import { cva } from 'class-variance-authority';

import type { UiTone, UiVariant } from '../../../types/ui.types';

export type CalloutTone = UiTone;

/**
 * `subtle` (default) renders a neutral dashed box with the icon in a
 * tone-coloured chip. `solid | surface | soft | outline` render a Banner-style
 * tone-tinted container with an inline icon.
 */
export type CalloutVariant = 'subtle' | Exclude<UiVariant, 'ghost'>;

export type CalloutSize = 'sm' | 'md';

/** Tinted-container variants (everything except the neutral `subtle` look). */
export type CalloutTintedVariant = Exclude<CalloutVariant, 'subtle'>;

/** Base layout shared by every variant; padding and text size come from the size map. */
export const calloutLayoutClass = cva(
  'ui-callout flex w-full gap-3 rounded-(--ui-radius-lg) border-(length:--ui-border-width)',
);

export const calloutSizeClasses = {
  sm: 'p-3 text-xs',
  md: 'p-4 text-sm',
} satisfies Record<CalloutSize, string>;

/** Icon-chip dimensions (the `subtle` look wraps the icon in a tinted circle). */
export const calloutChipSizeClasses = {
  sm: 'size-7',
  md: 'size-8',
} satisfies Record<CalloutSize, string>;

/** Default leading-icon pixel size per callout size. */
export const calloutIconSize = {
  sm: 12,
  md: 16,
} satisfies Record<CalloutSize, number>;

/** `subtle` container: neutral dashed box, independent of tone. */
export const calloutSubtleContainerClass =
  'border-dashed border-(--ui-border-strong) bg-(--ui-foreground)/5';

export const calloutChipBaseClass = 'flex shrink-0 items-center justify-center rounded-full';

/** Icon-chip background/text per tone for the `subtle` look. */
export const calloutChipClasses = {
  neutral: 'bg-(--ui-foreground)/10 text-(--ui-text-subtle)',
  red: 'bg-tone-red/10 text-tone-red',
  green: 'bg-tone-green/10 text-tone-green',
  amber: 'bg-tone-amber/10 text-tone-amber',
  blue: 'bg-tone-blue/10 text-tone-blue',
  purple: 'bg-tone-purple/10 text-tone-purple',
  magenta: 'bg-tone-magenta/10 text-tone-magenta',
} satisfies Record<CalloutTone, string>;

/**
 * Tone-tinted container classes for the `solid | surface | soft | outline`
 * variants. Mirrors the shape of `bannerToneClasses` so the inline-scale
 * Callout stays visually consistent with its full-width Banner sibling.
 */
export const calloutToneClasses = {
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
} satisfies Record<CalloutTone, Record<CalloutTintedVariant, string>>;
