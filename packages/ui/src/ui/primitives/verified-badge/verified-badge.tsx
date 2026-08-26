import type { ComponentPropsWithoutRef, Ref } from 'react';
import { Check } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { Icon } from '../icon';
import {
  verifiedBadgeIconSizeClasses,
  verifiedBadgeLayoutClass,
  verifiedBadgeToneClasses,
} from './verified-badge.styles';
import type { VerifiedBadgeSize, VerifiedBadgeTone } from './verified-badge.styles';

export type { VerifiedBadgeSize, VerifiedBadgeTone };

/**
 * Props for {@link VerifiedBadge}.
 */
export interface VerifiedBadgeProps extends Omit<ComponentPropsWithoutRef<'span'>, 'color'> {
  /**
   * Tone.
   *
   * @defaultValue `'blue'`
   */
  tone?: VerifiedBadgeTone;

  /**
   * Size token.
   *
   * @defaultValue `'medium'`
   */
  size?: VerifiedBadgeSize;

  /**
   * Accessible name for the badge.
   *
   * @defaultValue `'Verified'`
   */
  label?: string;

  ref?: Ref<HTMLSpanElement>;
}

/**
 * Small circular "verified" tick badge.
 *
 * @example
 * ```tsx
 * <VerifiedBadge />
 * <VerifiedBadge tone="red" size="small" label="Staff" />
 * ```
 */
export const VerifiedBadge = ({
  tone = 'blue',
  size = 'medium',
  label = 'Verified',
  className,
  ...props
}: VerifiedBadgeProps) => (
  <span
    role="img"
    aria-label={label}
    className={cn(verifiedBadgeLayoutClass({ size }), verifiedBadgeToneClasses[tone], className)}
    {...props}
  >
    <Icon icon={Check} className={verifiedBadgeIconSizeClasses[size]} />
  </span>
);
