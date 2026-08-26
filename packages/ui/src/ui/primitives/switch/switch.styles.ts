import { cva } from 'class-variance-authority';

export type SwitchSize = 'small' | 'medium';

export const switchTrackClass = cva(
  [
    'ui-switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5',
    'transition-colors duration-(--ui-motion-fast) ease-(--ui-ease)',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-(--ui-focus-ring)',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' '),
  {
    variants: {
      size: {
        small: 'h-5 w-9',
        medium: 'h-6 w-11',
      },
      checked: {
        true: 'bg-(--ui-accent)',
        false: 'bg-(--ui-border-strong)',
      },
    },
    defaultVariants: {
      size: 'medium',
      checked: false,
    },
  },
);

export const switchThumbClass = cva(
  'pointer-events-none block rounded-full bg-(--ui-background) shadow-(--ui-shadow-sm) transition-transform duration-(--ui-motion-fast) ease-(--ui-ease)',
  {
    variants: {
      size: {
        small: 'size-4',
        medium: 'size-5',
      },
      checked: {
        true: '',
        false: 'translate-x-0',
      },
    },
    // Travel = track width − 2 × inset − thumb width (inset is the p-0.5 above).
    compoundVariants: [
      { size: 'small', checked: true, className: 'translate-x-4' },
      { size: 'medium', checked: true, className: 'translate-x-5' },
    ],
    defaultVariants: {
      size: 'medium',
      checked: false,
    },
  },
);
