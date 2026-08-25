import { cva, type VariantProps } from 'class-variance-authority';

import { fontColorClasses, type FontColor } from './typography.styles';

export type EyebrowFontSize = Exclude<UiSize, '2xl' | '3xl' | 'xs' | '2xs'>;
export type EyebrowTone = FontColor;

export const eyebrowFontSizeClasses = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
  xl: 'text-l',
} satisfies Record<EyebrowFontSize, string>;

export const eyebrowRootVariants = cva(
  '[font-family:var(--ui-font-display)] font-bold leading-none tracking-[0.18em] uppercase',
  {
    variants: {
      variant: {
        horizontal: 'items-center gap-2.5',
        vertical: 'items-center gap-2.5',
        stacked: 'flex-col items-start gap-3',
      },
      display: {
        block: 'flex w-fit',
        inline: 'inline-flex align-baseline',
      },
      size: eyebrowFontSizeClasses,
      tone: fontColorClasses,
    },
    defaultVariants: {
      variant: 'horizontal',
      display: 'block',
      size: 'medium',
      tone: 'accent',
    },
  },
);

export const eyebrowRuleVariants = cva('shrink-0 bg-current', {
  variants: {
    variant: {
      horizontal: 'h-[2px] w-[18px]',
      vertical: 'h-8 w-0.5',
      stacked: 'h-[2px] w-[18px]',
    },
    tone: fontColorClasses,
  },
  defaultVariants: {
    variant: 'horizontal',
  },
});

export const eyebrowTextVariants = cva('min-w-0', {
  variants: {
    tone: fontColorClasses,
  },
});

type EyebrowRootVariantProps = VariantProps<typeof eyebrowRootVariants>;

export type EyebrowVariant = NonNullable<EyebrowRootVariantProps['variant']>;
export type EyebrowDisplay = NonNullable<EyebrowRootVariantProps['display']>;
