import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { cardBaseClass, cardToneClasses } from './card.styles';
import type { CardTone } from './card.styles';

export type { CardTone };

/**
 * Props for {@link Card}.
 *
 * Extends every standard `div` attribute with an optional border `tone`.
 */
export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Border treatment for the surface.
   *
   * @defaultValue `'default'`
   */
  tone?: CardTone;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Generic bordered surface container for grouping related content.
 *
 * @example
 * ```tsx
 * <Card className="p-4">Settings</Card>
 * <Card tone="danger" className="p-4">Delete account</Card>
 * ```
 */
export const Card = ({ tone = 'default', className, children, ref, ...props }: CardProps) => (
  <div ref={ref} className={cn(cardBaseClass, cardToneClasses[tone], className)} {...props}>
    {children}
  </div>
);
