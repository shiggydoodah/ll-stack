import type { ComponentPropsWithoutRef, ComponentRef, Ref } from 'react';

import { getTextClassName, type TextElement, type TextVariantProps } from './typography.styles';

export type { TextElement, TextSize, TextVariantProps } from './typography.styles';

/**
 * Props for {@link Text}.
 *
 * Includes every standard React `span` attribute except `color`, plus the
 * shared text typography variants:
 *
 * - `size?: 'default' | '2xs' | 'xs' | 'small' | 'medium' | 'large' | 'xl' | '2xl'`
 * - `weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black'`
 * - `tracking?: 'normal' | 'wide' | 'widest'`
 * - `leading?: 'none' | 'tight' | 'snug' | 'normal'`
 * - `tone?: 'default' | 'accent' | 'muted' | 'subtle'`
 */
export interface TextProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'color'>, TextVariantProps {
  /**
   * Element to render.
   *
   * The root component accepts the common span-shaped attribute set regardless
   * of `as`. For element-specific attributes such as `htmlFor`, use the fixed
   * helpers (`Text.Label` and friends).
   *
   * @defaultValue `'span'`
   */
  as?: TextElement;

  /**
   * Forwarded to the rendered element. Typed loosely because `as` makes the
   * concrete element dynamic; the fixed helpers type it precisely.
   */
  ref?: Ref<HTMLElement>;
}

type TextElementOwnProps<E extends TextElement> = Omit<ComponentPropsWithoutRef<E>, 'color'> &
  TextVariantProps & {
    ref?: Ref<ComponentRef<E>>;
  };

/** Props for {@link Text.P}, which always renders a `p` element. */
export type TextPProps = TextElementOwnProps<'p'>;

/** Props for {@link Text.Label}, which always renders a `label` element. */
export type TextLabelProps = TextElementOwnProps<'label'>;

/** Props for {@link Text.Span}, which always renders a `span` element. */
export type TextSpanProps = TextElementOwnProps<'span'>;

const TextRoot = ({
  as = 'span',
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
  ref,
  ...props
}: TextProps) => {
  const Component = as;

  return (
    <Component
      // The dynamic `as` hides the concrete element type, so the ref is cast to
      // the intersection the element union demands; the fixed helpers keep the
      // precise per-element typing.
      ref={ref as Ref<HTMLParagraphElement> & Ref<HTMLLabelElement> & Ref<HTMLSpanElement>}
      className={getTextClassName({
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

const TextP = ({ size, weight, tracking, leading, tone, className, ...props }: TextPProps) => (
  <p
    className={getTextClassName({ size, weight, tracking, leading, tone, className })}
    {...props}
  />
);

TextP.displayName = 'Text.P';

const TextLabel = ({
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
  ...props
}: TextLabelProps) => (
  <label
    className={getTextClassName({ size, weight, tracking, leading, tone, className })}
    {...props}
  />
);

TextLabel.displayName = 'Text.Label';

const TextSpan = ({
  size,
  weight,
  tracking,
  leading,
  tone,
  className,
  ...props
}: TextSpanProps) => (
  <span
    className={getTextClassName({ size, weight, tracking, leading, tone, className })}
    {...props}
  />
);

TextSpan.displayName = 'Text.Span';

/**
 * Body text component using the shared text scale.
 *
 * `Text` renders a `span` by default and applies the UI package body font and
 * text scale. Use the root component when the element is dynamic, or the fixed
 * helpers (`Text.P`, `Text.Label`, `Text.Span`) when the element is known at
 * the call site — the helpers also type element-specific attributes precisely,
 * such as `htmlFor` on `Text.Label`.
 *
 * @example
 * ```tsx
 * <Text tone="subtle">Last updated two days ago</Text>
 * ```
 *
 * @example
 * ```tsx
 * <Text.Label htmlFor="email" size="small" weight="medium">
 *   Email address
 * </Text.Label>
 * ```
 */
export const Text = Object.assign(TextRoot, {
  P: TextP,
  Label: TextLabel,
  Span: TextSpan,
});
