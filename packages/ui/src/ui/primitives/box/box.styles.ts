import { cva } from 'class-variance-authority';

import type { UiVariant } from '../../../types/ui.types';
import type { FlexSpace } from '../flex';

/** Surface treatments for {@link Box}. Drops `solid` — Box is a neutral surface, never a fill. */
export type BoxVariant = Exclude<UiVariant, 'solid'>;

/** Inner padding scale, shared with `Stack`/`Row` so containers keep one spacing rhythm. */
export type BoxPadding = FlexSpace;

/** Optional max-width constraint, mapped to Tailwind `max-w-*`. */
export type BoxMaxWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const boxClass = cva('', {
  variants: {
    variant: {
      ghost: '',
      surface:
        'rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border) bg-(--ui-background-subtle)',
      soft: 'rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border) bg-(--ui-background-muted)',
      outline:
        'rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border) bg-transparent',
    },
    padding: {
      none: '',
      xs: 'p-1',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
      xl: 'p-8',
      '2xl': 'p-12',
    },
    maxWidth: {
      xs: 'max-w-xs',
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
    },
  },
  // `maxWidth` is intentionally omitted — unset leaves the box width unconstrained.
  defaultVariants: { variant: 'ghost', padding: 'none' },
});
