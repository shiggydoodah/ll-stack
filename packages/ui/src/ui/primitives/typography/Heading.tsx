import type { ComponentPropsWithoutRef, Ref } from 'react';

import {
  getHeadingClassName,
  type HeadingLevel,
  type HeadingVariantProps,
} from './typography.styles';

export type { HeadingLevel, HeadingSize, HeadingVariantProps } from './typography.styles';

/**
 * Props for {@link Heading}.
 *
 * Includes every standard React `h1` attribute except `color`, plus the shared
 * heading typography variants:
 *
 * - `size?: 'default' | '2xs' | 'xs' | 'small' | 'medium' | 'large' | 'xl' | '2xl'`
 * - `weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black'`
 * - `tracking?: 'normal' | 'wide' | 'widest'`
 * - `leading?: 'none' | 'tight' | 'snug' | 'normal'`
 * - `tone?: 'default' | 'accent' | 'muted' | 'subtle'`
 */
export interface HeadingProps
  extends Omit<ComponentPropsWithoutRef<'h1'>, 'color'>, HeadingVariantProps {
  /**
   * Semantic heading element to render.
   *
   * The level also selects default typography variants when `size`, `weight`,
   * `tracking`, or `leading` are not provided.
   *
   * @defaultValue `'h2'`
   */
  level?: HeadingLevel;

  ref?: Ref<HTMLHeadingElement>;
}

/**
 * Props for fixed-level heading helpers such as `Heading.H1` and `Heading.H2`.
 *
 * These helpers lock the semantic heading level through the component name, so
 * they accept the same props as {@link Heading} except `level`.
 */
export type HeadingLevelProps = Omit<HeadingProps, 'level'>;

const HeadingRoot = ({
  level = 'h2',
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
  ...props
}: HeadingProps) => {
  const Component = level;

  return (
    <Component
      className={getHeadingClassName({
        level,
        size,
        weight,
        tracking,
        leading,
        tone,
        className,
      })}
      {...props}
    />
  );
};

const createHeadingLevel = (level: HeadingLevel) => {
  const HeadingLevelComponent = ({
    size,
    weight,
    tracking,
    leading,
    tone,
    className,
    ...props
  }: HeadingLevelProps) => (
    <HeadingRoot
      level={level}
      size={size}
      weight={weight}
      tracking={tracking}
      leading={leading}
      tone={tone}
      className={className}
      {...props}
    />
  );

  HeadingLevelComponent.displayName = `Heading.${level.toUpperCase()}`;

  return HeadingLevelComponent;
};

/**
 * Semantic heading component for document headings.
 *
 * `Heading` renders an actual `h1`-`h6` element and applies the shared UI
 * package heading scale. Use the root component when the level is dynamic, or
 * the fixed helpers (`Heading.H1` through `Heading.H6`) when the semantic level
 * is known at the call site.
 *
 * @example
 * ```tsx
 * <Heading level="h1">Dashboard</Heading>
 * ```
 *
 * @example
 * ```tsx
 * <Heading.H3 tone="muted" size="medium">
 *   Recent activity
 * </Heading.H3>
 * ```
 */
export const Heading = Object.assign(HeadingRoot, {
  H1: createHeadingLevel('h1'),
  H2: createHeadingLevel('h2'),
  H3: createHeadingLevel('h3'),
  H4: createHeadingLevel('h4'),
  H5: createHeadingLevel('h5'),
  H6: createHeadingLevel('h6'),
});
