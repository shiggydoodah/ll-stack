import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/cn';
import type { UiFontSize } from '../../../types/ui.types';

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingSize = UiFontSize;

export const headingSizeClasses = {
  default: 'text-4xl',
  '2xs': 'text-sm',
  xs: 'text-base',
  small: 'text-2xl',
  medium: 'text-3xl',
  large: 'text-4xl',
  xl: 'text-5xl',
  '2xl': 'text-8xl',
} satisfies Record<HeadingSize, string>;

export const headingWeightClasses = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
  black: 'font-black',
} as const;

export const headingTrackingClasses = {
  normal: 'tracking-normal',
  wide: 'tracking-wider',
  widest: 'tracking-widest',
} as const;

export const headingLeadingClasses = {
  none: 'leading-none',
  tight: 'leading-tight',
  snug: 'leading-snug',
  normal: 'leading-normal',
} as const;

export const fontColorClasses = {
  default: 'text-(--ui-foreground)',
  accent: 'text-(--ui-accent)',
  muted: 'text-(--ui-text-muted)',
  subtle: 'text-(--ui-text-subtle)',
} as const;

export type FontColor = keyof typeof fontColorClasses;

export const headingVariants = cva('[font-family:var(--ui-font-display)] text-balance', {
  variants: {
    size: headingSizeClasses,
    weight: headingWeightClasses,
    tracking: headingTrackingClasses,
    leading: headingLeadingClasses,
    tone: fontColorClasses,
  },
  defaultVariants: {
    tone: 'default',
  },
});

export type HeadingVariantProps = VariantProps<typeof headingVariants>;

type RequiredHeadingDefaults = Required<
  Pick<HeadingVariantProps, 'size' | 'weight' | 'tracking' | 'leading'>
>;

// Monotonic descending scale: each level steps down one size token, with h1
// taking a visibly larger step over h2 (text-5xl → text-4xl) than the rest.
export const headingDefaults = {
  h1: {
    size: 'xl',
    weight: 'black',
    tracking: 'wide',
    leading: 'none',
  },
  h2: {
    size: 'large',
    weight: 'black',
    tracking: 'wide',
    leading: 'none',
  },
  h3: {
    size: 'medium',
    weight: 'extrabold',
    tracking: 'wide',
    leading: 'none',
  },
  h4: {
    size: 'small',
    weight: 'bold',
    tracking: 'wide',
    leading: 'none',
  },
  h5: {
    size: 'xs',
    weight: 'bold',
    tracking: 'wide',
    leading: 'none',
  },
  h6: {
    size: '2xs',
    weight: 'bold',
    tracking: 'widest',
    leading: 'none',
  },
} satisfies Record<HeadingLevel, RequiredHeadingDefaults>;

export interface HeadingClassNameOptions extends HeadingVariantProps {
  className?: string;
  level: HeadingLevel;
}

export const getHeadingClassName = ({
  level,
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
}: HeadingClassNameOptions) => {
  const defaults = headingDefaults[level];

  return cn(
    headingVariants({
      size: size ?? defaults.size,
      weight: weight ?? defaults.weight,
      tracking: tracking ?? defaults.tracking,
      leading: leading ?? defaults.leading,
      tone,
    }),
    className,
  );
};

export type TextElement = 'p' | 'label' | 'span';
export type TextSize = UiFontSize;

export const textSizeClasses = {
  default: 'text-base',
  '2xs': 'text-xs', // no smaller Tailwind size exists; same as xs by design
  xs: 'text-xs',
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
} satisfies Record<TextSize, string>;

export const textVariants = cva('[font-family:var(--ui-font-body)]', {
  variants: {
    size: textSizeClasses,
    weight: headingWeightClasses,
    tracking: headingTrackingClasses,
    leading: headingLeadingClasses,
    tone: fontColorClasses,
  },
  defaultVariants: {
    tone: 'default',
  },
});

export type TextVariantProps = VariantProps<typeof textVariants>;

type RequiredTextDefaults = Required<
  Pick<TextVariantProps, 'size' | 'weight' | 'tracking' | 'leading'>
>;

export const textDefaults = {
  size: 'medium',
  weight: 'regular',
  tracking: 'normal',
  leading: 'normal',
} satisfies RequiredTextDefaults;

export interface TextClassNameOptions extends TextVariantProps {
  className?: string;
}

export const getTextClassName = ({
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
}: TextClassNameOptions) =>
  cn(
    textVariants({
      size: size ?? textDefaults.size,
      weight: weight ?? textDefaults.weight,
      tracking: tracking ?? textDefaults.tracking,
      leading: leading ?? textDefaults.leading,
      tone,
    }),
    className,
  );
