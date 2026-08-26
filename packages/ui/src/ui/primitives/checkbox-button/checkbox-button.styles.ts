import { cva } from 'class-variance-authority';

export type CheckboxButtonSize = 'small' | 'medium';

export const checkboxButtonLayoutClass = cva(
  'font-display inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-(--ui-radius-sm) border-(length:--ui-border-width) ui-display-text font-bold leading-none transition duration-(--ui-motion-fast) ease-(--ui-ease) select-none disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      size: {
        small: 'px-2.5 py-1.5 text-2xs',
        medium: 'px-3.5 py-2 text-xs',
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

export const checkboxButtonSelectedClass =
  'border-(--ui-accent) bg-(--ui-accent) text-(--ui-accent-contrast)';

export const checkboxButtonUnselectedClass =
  'border-(--ui-border-strong) bg-transparent text-(--ui-text-subtle) hover:border-(--ui-border-hover) hover:text-(--ui-foreground)';
