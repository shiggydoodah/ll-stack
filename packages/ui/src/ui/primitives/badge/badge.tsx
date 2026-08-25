import type { ComponentPropsWithoutRef, ReactNode } from 'react';

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
  /** Brand colour applied to the badge surface, border, and text. */
  tone: BadgeTone;
  /** Visual treatment: `solid`, `surface`, `soft`, or `outline`. */
  variant: BadgeVariant;
  children: ReactNode;
}

/**
 * Compact inline label for statuses, tags, and categorical metadata.
 *
 * @example
 * ```tsx
 * <Badge tone="green" variant="solid">Active</Badge>
 * <Badge tone="amber" variant="surface">Pending</Badge>
 * ```
 */
export const Badge = ({ tone, variant, className, children, ...props }: BadgeProps) => (
  <span className={cn(badgeBaseClass, badgeToneClasses[tone][variant], className)} {...props}>
    {children}
  </span>
);
