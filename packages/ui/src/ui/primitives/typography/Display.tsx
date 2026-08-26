import type { ComponentPropsWithoutRef, Ref } from 'react';

import {
  getHeadingClassName,
  type HeadingLevel,
  type HeadingVariantProps,
} from './typography.styles';

/**
 * Props for {@link Display}.
 *
 * Includes every standard React `span` attribute except `color`, plus the shared
 * heading typography variants:
 *
 * - `size?: 'default' | '2xs' | 'xs' | 'small' | 'medium' | 'large' | 'xl' | '2xl'`
 * - `weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black'`
 * - `tracking?: 'normal' | 'wide' | 'widest'`
 * - `leading?: 'none' | 'tight' | 'snug' | 'normal'`
 * - `tone?: 'default' | 'accent' | 'muted' | 'subtle'`
 */
export interface DisplayProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'color'>, HeadingVariantProps {
  /**
   * Visual heading level to use for default typography variants.
   *
   * Display always renders a `span`; this prop changes the visual scale only and
   * does not create heading semantics in the document outline.
   *
   * @defaultValue `'h2'`
   */
  level?: HeadingLevel;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Props for fixed-level display helpers such as `Display.H1` and `Display.H2`.
 *
 * These helpers lock the visual heading level through the component name, so
 * they accept the same props as {@link Display} except `level`.
 */
export type DisplayLevelProps = Omit<DisplayProps, 'level'>;

const DisplayRoot = ({
  level = 'h2',
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
  ...props
}: DisplayProps) => (
  <span
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

const createDisplayLevel = (level: HeadingLevel) => {
  const DisplayLevelComponent = ({
    size,
    weight,
    tracking,
    leading,
    tone,
    className,
    ...props
  }: DisplayLevelProps) => (
    <DisplayRoot
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

  DisplayLevelComponent.displayName = `Display.${level.toUpperCase()}`;

  return DisplayLevelComponent;
};

/**
 * Non-semantic display text component that uses the shared heading scale.
 *
 * `Display` renders a `span`, making it useful for large visual text when
 * heading semantics are already handled elsewhere or should not be added. Use
 * the root component when the visual level is dynamic, or the fixed helpers
 * (`Display.H1` through `Display.H6`) when the visual scale is known at the call
 * site.
 *
 * @example
 * ```tsx
 * <Display level="h1" tone="accent">
 *   Product analytics
 * </Display>
 * ```
 *
 * @example
 * ```tsx
 * <Display.H4 className="uppercase">
 *   Beta release
 * </Display.H4>
 * ```
 */
export const Display = Object.assign(DisplayRoot, {
  H1: createDisplayLevel('h1'),
  H2: createDisplayLevel('h2'),
  H3: createDisplayLevel('h3'),
  H4: createDisplayLevel('h4'),
  H5: createDisplayLevel('h5'),
  H6: createDisplayLevel('h6'),
});
