import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  eyebrowRootVariants,
  eyebrowRuleVariants,
  eyebrowTextVariants,
  type EyebrowDisplay,
  type EyebrowFontSize,
  type EyebrowTone,
  type EyebrowVariant,
} from './Eyebrow.styles';

export type {
  EyebrowDisplay,
  EyebrowFontSize,
  EyebrowTone,
  EyebrowVariant,
} from './Eyebrow.styles';

/**
 * CVA-backed visual variants accepted by {@link Eyebrow}.
 */
export interface EyebrowVariantProps {
  /**
   * Rule placement relative to the eyebrow text.
   *
   * - `horizontal` renders a short horizontal rule before the text.
   * - `vertical` renders a vertical rule before the text.
   * - `stacked` renders a horizontal rule above the text.
   *
   * @defaultValue `'horizontal'`
   */
  variant?: EyebrowVariant;

  /**
   * Layout behavior for the outer `span`.
   *
   * Use `block` for standalone section labels and `inline` when the eyebrow
   * should sit in running text.
   *
   * @defaultValue `'block'`
   */
  display?: EyebrowDisplay;

  /**
   * Typography size for the eyebrow text.
   *
   * Accepts the component size scale: `small`, `medium`, `large`, or `xl`.
   *
   * @defaultValue `'medium'`
   */
  size?: EyebrowFontSize;
}

/**
 * Props for {@link Eyebrow}.
 *
 * Includes every standard React `span` attribute except `color`, plus typed
 * variants for rule placement, display behavior, and tone. By default the rule
 * and text inherit the active theme accent token through `--ui-accent`.
 */
export interface EyebrowProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'color'>, EyebrowVariantProps {
  /**
   * Shared tone for the rule and text.
   *
   * `accent` resolves to the active theme accent token. Root color classes
   * passed through `className` can override this shared tone.
   *
   * @defaultValue `'accent'`
   */
  tone?: EyebrowTone;

  /**
   * Optional tone override for the decorative rule.
   *
   * When omitted, the rule inherits `tone` from the root span.
   */
  lineTone?: EyebrowTone;

  /**
   * Optional tone override for the visible text.
   *
   * When omitted, the text inherits `tone` from the root span.
   */
  textTone?: EyebrowTone;

  /**
   * Optional class names for the decorative rule.
   *
   * Use this for one-off sizing or arbitrary color overrides when the typed
   * tone options are not enough.
   */
  lineClassName?: string;

  /**
   * Optional class names for the visible text.
   *
   * Use this for one-off wrapping or arbitrary color overrides when the typed
   * tone options are not enough.
   */
  textClassName?: string;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Compact uppercase section label with an integrated decorative rule.
 *
 * Eyebrow renders a `span` so it can be used as either standalone block text or
 * inline text. The decorative rule is hidden from assistive technology.
 *
 * @example
 * ```tsx
 * <Eyebrow>Section eyebrow</Eyebrow>
 * ```
 *
 * @example
 * ```tsx
 * <Eyebrow variant="vertical" lineTone="default">
 *   Reading the values
 * </Eyebrow>
 * ```
 *
 * @example
 * ```tsx
 * <Eyebrow variant="stacked" display="inline" textTone="muted">
 *   01 - Type
 * </Eyebrow>
 * ```
 */
export const Eyebrow = ({
  variant = 'horizontal',
  display = 'block',
  size = 'medium',
  tone = 'accent',
  lineTone,
  textTone,
  lineClassName,
  textClassName,
  className,
  children,
  ...props
}: EyebrowProps) => (
  <span className={cn(eyebrowRootVariants({ variant, display, size, tone }), className)} {...props}>
    <span
      aria-hidden="true"
      className={cn(eyebrowRuleVariants({ variant, tone: lineTone }), lineClassName)}
    />
    <span className={cn(eyebrowTextVariants({ tone: textTone }), textClassName)}>{children}</span>
  </span>
);
