import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { badgeBaseClass, badgeToneClasses } from './badge.styles';
import type { BadgeTone, BadgeVariant } from './badge.styles';

/**
 * Props for {@link Badge}.
 *
 * Includes every standard React `span` attribute except `color`, plus typed
 * variants for tone and visual treatment.
 */
export interface BadgeProps extends Omit<ComponentPropsWithoutRef<'span'>, 'color'> {
  /**
   * Brand colour applied to the badge surface, border, and text.
   *
   * @defaultValue `'neutral'`
   */
  tone?: BadgeTone;
  /**
   * Visual treatment: `solid`, `surface`, `soft`, or `outline`.
   *
   * @defaultValue `'surface'`
   */
  variant?: BadgeVariant;
  children: ReactNode;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Compact inline label for statuses, tags, and categorical metadata.
 *
 * @example
 * ```tsx
 * <Badge>Draft</Badge>
 * <Badge tone="green" variant="solid">Active</Badge>
 * <Badge tone="amber" variant="surface">Pending</Badge>
 * ```
 */
export const Badge = ({
  tone = 'neutral',
  variant = 'surface',
  className,
  children,
  ref,
  ...props
}: BadgeProps) => (
  <span
    ref={ref}
    className={cn(badgeBaseClass, badgeToneClasses[tone][variant], className)}
    {...props}
  >
    {children}
  </span>
);
