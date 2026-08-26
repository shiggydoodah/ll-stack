import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { StatusDot } from '../status-dot';
import { countBadgeLayoutClass, countBadgeToneClasses } from './count-badge.styles';
import type { CountBadgeSize, CountBadgeTone, CountBadgeVariant } from './count-badge.styles';

export type { CountBadgeSize, CountBadgeTone, CountBadgeVariant };

/**
 * Props for {@link CountBadge}.
 */
export interface CountBadgeProps extends Omit<ComponentPropsWithoutRef<'span'>, 'color'> {
  /** Value to display. */
  count?: number;

  /**
   * Overflow threshold; values above this render as `{max}+` (e.g. `99+`).
   *
   * @defaultValue `99`
   */
  max?: number;

  /**
   * Render even when the count is zero. By default a zero/absent count renders nothing.
   *
   * @defaultValue `false`
   */
  showZero?: boolean;

  /** Render a bare dot with no number — e.g. an unread indicator on a bell icon. */
  dot?: boolean;

  /**
   * Tone.
   *
   * @defaultValue `'red'`
   */
  tone?: CountBadgeTone;

  /**
   * Visual variant.
   *
   * @defaultValue `'solid'`
   */
  variant?: CountBadgeVariant;

  /**
   * Size token.
   *
   * @defaultValue `'medium'`
   */
  size?: CountBadgeSize;

  /** Add a background-coloured halo so the badge separates from a busy backdrop. */
  ring?: boolean;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Numeric counter for notifications, messages, and unread indicators. Renders as
 * a circle for a single digit and a pill for multiple digits. Hidden by default
 * when the count is zero. Pass `dot` for a bare unread dot.
 *
 * A bare dot is invisible to assistive tech — pair it with visible text
 * nearby, or pass `aria-label` (which also sets `role="img"` so the label is
 * reliably announced).
 *
 * @example
 * ```tsx
 * <CountBadge count={3} />
 * <CountBadge count={1280} max={99} />   // "99+"
 * <CountBadge dot aria-label="Unread" /> // notification dot
 * ```
 */
export const CountBadge = ({
  count,
  max = 99,
  showZero = false,
  dot = false,
  tone = 'red',
  variant = 'solid',
  size = 'medium',
  ring = false,
  className,
  ...props
}: CountBadgeProps) => {
  if (dot) {
    return <StatusDot tone={tone} size={size} ring={ring} className={className} {...props} />;
  }

  const value = count ?? 0;
  if (!showZero && value <= 0) {
    return null;
  }

  const display = value > max ? `${max}+` : String(value);

  return (
    <span
      className={cn(
        countBadgeLayoutClass({ size }),
        countBadgeToneClasses[tone][variant],
        ring && 'ring-2 ring-(--ui-background)',
        className,
      )}
      {...props}
    >
      {display}
    </span>
  );
};
