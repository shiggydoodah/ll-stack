import { cva } from 'class-variance-authority';

import type { UiSize, UiTone } from '../../../types/ui.types';

export type VerifiedBadgeTone = UiTone;
export type VerifiedBadgeSize = UiSize;

export const verifiedBadgeLayoutClass = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full border align-middle',
  {
    variants: {
      size: {
        xsmall: 'size-3.5',
        small: 'size-4',
        medium: 'size-5',
        large: 'size-6',
        xlarge: 'size-7',
      },
    },
    defaultVariants: { size: 'medium' },
  },
);

/** Solid fill per tone (the check inherits the wrapper's text colour). */
export const verifiedBadgeToneClasses = {
  neutral: 'border-(--ui-foreground) bg-(--ui-foreground) text-(--ui-background)',
  red: 'border-tone-red bg-tone-red text-tone-red-contrast',
  green: 'border-tone-green bg-tone-green text-tone-green-contrast',
  amber: 'border-tone-amber bg-tone-amber text-tone-amber-contrast',
  blue: 'border-tone-blue bg-tone-blue text-tone-blue-contrast',
  purple: 'border-tone-purple bg-tone-purple text-tone-purple-contrast',
  magenta: 'border-tone-magenta bg-tone-magenta text-tone-magenta-contrast',
} satisfies Record<VerifiedBadgeTone, string>;

export const verifiedBadgeIconSizeClasses = {
  xsmall: 'size-2.5',
  small: 'size-3',
  medium: 'size-3.5',
  large: 'size-4',
  xlarge: 'size-5',
} satisfies Record<VerifiedBadgeSize, string>;
