import { cva } from 'class-variance-authority';

import type { UiSize, UiTone, UiVariant } from '../../../types/ui.types';

export type ButtonTone = UiTone;
export type ButtonVariant = Exclude<UiVariant, 'soft'>;
export type ButtonSize = UiSize;

export const buttonToneClasses = {
  neutral: {
    solid: 'border-(--ui-foreground) bg-(--ui-foreground) text-(--ui-background)',
    surface: 'border-(--ui-foreground)/20 bg-(--ui-foreground)/10 text-(--ui-foreground)',
    outline:
      'border-(--ui-foreground) bg-transparent text-(--ui-foreground) hover:bg-(--ui-foreground)/8',
    ghost: 'border-transparent bg-transparent text-(--ui-foreground) hover:bg-(--ui-foreground)/8',
  },
  red: {
    solid: 'border-tone-red bg-tone-red text-tone-red-contrast',
    surface: 'border-tone-red/20 bg-tone-red/20 text-tone-red',
    outline: 'border-tone-red bg-transparent text-tone-red hover:bg-tone-red/10',
    ghost: 'border-transparent bg-transparent text-tone-red hover:bg-tone-red/10',
  },
  green: {
    solid: 'border-tone-green bg-tone-green text-tone-green-contrast',
    surface: 'border-tone-green/20 bg-tone-green/20 text-tone-green',
    outline: 'border-tone-green bg-transparent text-tone-green hover:bg-tone-green/10',
    ghost: 'border-transparent bg-transparent text-tone-green hover:bg-tone-green/10',
  },
  amber: {
    solid: 'border-tone-amber bg-tone-amber text-tone-amber-contrast',
    surface: 'border-tone-amber/20 bg-tone-amber/20 text-tone-amber',
    outline: 'border-tone-amber bg-transparent text-tone-amber hover:bg-tone-amber/10',
    ghost: 'border-transparent bg-transparent text-tone-amber hover:bg-tone-amber/10',
  },
  blue: {
    solid: 'border-tone-blue bg-tone-blue text-tone-blue-contrast',
    surface: 'border-tone-blue/20 bg-tone-blue/20 text-tone-blue',
    outline: 'border-tone-blue bg-transparent text-tone-blue hover:bg-tone-blue/10',
    ghost: 'border-transparent bg-transparent text-tone-blue hover:bg-tone-blue/10',
  },
  purple: {
    solid: 'border-tone-purple bg-tone-purple text-tone-purple-contrast',
    surface: 'border-tone-purple/20 bg-tone-purple/20 text-tone-purple',
    outline: 'border-tone-purple bg-transparent text-tone-purple hover:bg-tone-purple/10',
    ghost: 'border-transparent bg-transparent text-tone-purple hover:bg-tone-purple/10',
  },
  magenta: {
    solid: 'border-tone-magenta bg-tone-magenta text-tone-magenta-contrast',
    surface: 'border-tone-magenta/20 bg-tone-magenta/20 text-tone-magenta',
    outline: 'border-tone-magenta bg-transparent text-tone-magenta hover:bg-tone-magenta/10',
    ghost: 'border-transparent bg-transparent text-tone-magenta hover:bg-tone-magenta/10',
  },
} satisfies Record<ButtonTone, Record<ButtonVariant, string>>;

export const buttonLayoutClass = cva(
  'ui-btn font-display relative inline-flex shrink-0 items-center justify-center rounded-(--ui-radius-sm) border-(length:--ui-border-width) font-bold ui-display-text leading-none transition duration-(--ui-motion-fast) ease-(--ui-ease) select-none',
  {
    variants: {
      size: {
        xsmall: 'gap-1.5 px-2 py-2 text-2xs',
        small: 'gap-1.5 px-2.5 py-2.5 text-xs',
        medium: 'gap-2 px-3.5 py-3 text-sm',
        large: 'gap-2 px-4 py-3.5 text-base',
        xlarge: 'gap-2.5 px-5 py-4 text-base',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { size: 'medium', fullWidth: false },
  },
);

export const iconButtonLayoutClass = cva(
  'ui-btn relative inline-flex shrink-0 items-center justify-center border-(length:--ui-border-width) transition duration-(--ui-motion-fast) ease-(--ui-ease) select-none',
  {
    variants: {
      size: {
        xsmall: 'p-2',
        small: 'p-2.5',
        medium: 'p-3',
        large: 'p-3.5',
        xlarge: 'p-4',
      },
      shape: {
        square: 'rounded-(--ui-radius-sm)',
        circle: 'rounded-full',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { size: 'medium', shape: 'square', fullWidth: false },
  },
);
