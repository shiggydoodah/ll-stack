import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  statusDotLayoutClass,
  statusDotRingClass,
  statusDotToneClasses,
  statusPillDotSizeClasses,
  statusPillLayoutClass,
  statusPillToneClasses,
} from './status-dot.styles';
import type { StatusDotSize, StatusDotTone } from './status-dot.styles';

export type { StatusDotSize, StatusDotTone };

/**
 * Props for {@link StatusDot}.
 */
export interface StatusDotProps extends Omit<ComponentPropsWithoutRef<'span'>, 'color'> {
  /**
   * Indicator tone. Semantically: `green` = online, `red` = busy, `amber` = away,
   * `neutral` = offline — but the component stays generic and accepts any tone.
   */
  tone: StatusDotTone;

  /**
   * Size token.
   *
   * @defaultValue `'medium'`
   */
  size?: StatusDotSize;

  /** Animate an outward "ping" ring to signal a live state. */
  pulse?: boolean;

  /** Add a background-coloured halo so the dot separates from a busy backdrop. */
  ring?: boolean;

  /** When set, render the dot alongside this text inside a pill. */
  label?: ReactNode;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Small round presence/state indicator.
 *
 * Renders a bare dot by default; pass `label` to render a dot + text pill, or
 * `pulse` for an animated "live" ring. Position it by passing a `className`
 * (the component itself is layout-agnostic).
 *
 * A bare dot is invisible to assistive tech — pair it with visible text
 * nearby, or pass `aria-label` (which also sets `role="img"` so the label is
 * reliably announced).
 *
 * @example
 * ```tsx
 * <StatusDot tone="green" />
 * <StatusDot tone="green" pulse />
 * <StatusDot tone="green" label="Online" />
 * <StatusDot tone="green" aria-label="Online" />
 * ```
 */
export const StatusDot = ({
  tone,
  size = 'medium',
  pulse = false,
  ring = false,
  label,
  className,
  ...props
}: StatusDotProps) => {
  if (label != null && label !== '') {
    return (
      <span
        className={cn(statusPillLayoutClass({ size }), statusPillToneClasses[tone], className)}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block rounded-full',
            statusPillDotSizeClasses[size],
            statusDotToneClasses[tone],
          )}
        />
        {label}
      </span>
    );
  }

  return (
    <span
      // The bare dot has no text content, so an aria-label alone is unreliably
      // announced — role="img" gives it a role the label can attach to.
      role={props['aria-label'] != null ? 'img' : undefined}
      className={cn(statusDotLayoutClass({ size }), className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            statusDotToneClasses[tone],
          )}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-full w-full rounded-full',
          statusDotToneClasses[tone],
          ring && statusDotRingClass,
        )}
      />
    </span>
  );
};
