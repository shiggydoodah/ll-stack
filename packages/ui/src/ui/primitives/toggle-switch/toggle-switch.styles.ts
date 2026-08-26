import { cva } from 'class-variance-authority';

export type ToggleSwitchSize = 'small' | 'medium' | 'large';

export const toggleSwitchRootClass = cva(
  'inline-flex shrink-0 items-center border border-(--ui-border-strong) bg-(--ui-input-background)',
  {
    variants: {
      size: {
        small: 'gap-0.5 rounded-(--ui-radius-md) p-0.5',
        medium: 'gap-0.5 rounded-(--ui-radius-md) p-0.5',
        large: 'gap-1 rounded-(--ui-radius-lg) p-1',
      },
      fullWidth: { true: 'flex w-full' },
    },
    defaultVariants: { size: 'small', fullWidth: false },
  },
);

export const toggleSwitchOptionClass = cva(
  'font-display inline-flex cursor-pointer disabled:cursor-not-allowed items-center justify-center gap-1.5 ui-display-text font-bold leading-none transition duration-(--ui-motion-fast) ease-(--ui-ease) select-none',
  {
    variants: {
      size: {
        small: 'rounded-(--ui-radius-sm) px-3 py-1.5 text-2xs',
        medium: 'rounded-(--ui-radius-sm) px-3.5 py-2 text-xs',
        large: 'rounded-(--ui-radius-md) px-4 py-2.5 text-xs',
      },
      active: {
        true: 'bg-(--ui-accent) text-(--ui-accent-contrast)',
        false: 'bg-transparent text-(--ui-text-subtle) hover:text-(--ui-foreground)',
      },
      fullWidth: { true: 'flex-1' },
    },
    defaultVariants: {
      size: 'medium',
      active: false,
      fullWidth: false,
    },
  },
);
