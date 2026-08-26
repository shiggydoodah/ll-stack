import { cva } from 'class-variance-authority';

import type { UiSize, UiTone } from '../../../types/ui.types';

export type StatusDotTone = UiTone;
export type StatusDotSize = UiSize;

/**
 * Outer wrapper that sizes the dot. Size lives on the wrapper so a consumer can
 * override it via `className` (e.g. `Avatar` sizes the dot relative to itself).
 */
export const statusDotLayoutClass = cva('relative inline-flex shrink-0 align-middle', {
  variants: {
    size: {
      xsmall: 'size-1.5',
      small: 'size-2',
      medium: 'size-2.5',
      large: 'size-3',
      xlarge: 'size-3.5',
    },
  },
  defaultVariants: { size: 'medium' },
});

/** Solid fill per tone, shared by the dot and the pulse ring. */
export const statusDotToneClasses = {
  neutral: 'bg-(--ui-text-subtle)',
  red: 'bg-tone-red',
  green: 'bg-tone-green',
  amber: 'bg-tone-amber',
  blue: 'bg-tone-blue',
  purple: 'bg-tone-purple',
  magenta: 'bg-tone-magenta',
} satisfies Record<StatusDotTone, string>;

/** Background-coloured halo so the dot separates from a busy backdrop. */
export const statusDotRingClass = 'ring-2 ring-(--ui-background)';

/** Label-pill container layout (surface-toned, Badge-like). */
export const statusPillLayoutClass = cva(
  'ui-badge font-body inline-flex w-fit shrink-0 items-center rounded-full border-(length:--ui-border-width) align-middle ui-display-text font-bold leading-none',
  {
    variants: {
      size: {
        xsmall: 'gap-1 px-1.5 py-0.5 text-2xs',
        small: 'gap-1 px-2 py-0.5 text-2xs',
        medium: 'gap-1.5 px-2 py-1 text-2xs',
        large: 'gap-1.5 px-2.5 py-1 text-xs',
        xlarge: 'gap-2 px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: { size: 'medium' },
  },
);

/** Surface tone styling for the label-pill container. */
export const statusPillToneClasses = {
  neutral: 'border-(--ui-foreground)/20 bg-(--ui-foreground)/10 text-(--ui-foreground)',
  red: 'border-tone-red/20 bg-tone-red/20 text-tone-red',
  green: 'border-tone-green/20 bg-tone-green/20 text-tone-green',
  amber: 'border-tone-amber/20 bg-tone-amber/20 text-tone-amber',
  blue: 'border-tone-blue/20 bg-tone-blue/20 text-tone-blue',
  purple: 'border-tone-purple/20 bg-tone-purple/20 text-tone-purple',
  magenta: 'border-tone-magenta/20 bg-tone-magenta/20 text-tone-magenta',
} satisfies Record<StatusDotTone, string>;

/** Inner dot size inside the label pill. */
export const statusPillDotSizeClasses = {
  xsmall: 'size-1',
  small: 'size-1.5',
  medium: 'size-1.5',
  large: 'size-2',
  xlarge: 'size-2',
} satisfies Record<StatusDotSize, string>;
