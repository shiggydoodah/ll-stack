import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { boxClass } from './box.styles';
import type { BoxMaxWidth, BoxPadding, BoxVariant } from './box.styles';

/**
 * Props for {@link Box}.
 *
 * Extends every standard `div` attribute with typed `variant`, `padding`, and `maxWidth`.
 */
export interface BoxProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Surface treatment. `ghost` is a transparent, border-less `<div>`; `surface` and `soft` are
   * raised filled surfaces; `outline` is a bordered, transparent container.
   *
   * @defaultValue `'ghost'`
   */
  variant?: BoxVariant;

  /**
   * Inner padding applied on all sides, using the spacing scale shared with `Stack`/`Row`.
   *
   * @defaultValue `'none'`
   */
  padding?: BoxPadding;

  /** Constrain the box to a maximum width (`max-w-*`). Unset leaves the width unconstrained. */
  maxWidth?: BoxMaxWidth;

  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Standardised single-element surface container — an extension of `<div>` with preset `variant`
 * (surface treatment), `padding`, and `maxWidth`. Use it as a card (`variant="surface"`) or as a
 * plain padded block (`variant="ghost"`, the default). Forwards `ref` and any native `<div>`
 * attribute; `className` is merged last so consumers can override.
 *
 * @example
 * ```tsx
 * <Box variant="surface" padding="md" maxWidth="sm">Card content</Box>
 * <Box padding="lg">Just a padded div</Box>
 * ```
 */
export const Box = ({
  variant = 'ghost',
  padding = 'none',
  maxWidth,
  className,
  children,
  ref,
  ...props
}: BoxProps) => (
  <div ref={ref} className={cn(boxClass({ variant, padding, maxWidth }), className)} {...props}>
    {children}
  </div>
);
