import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';

export interface FieldRequiredIndicatorProps extends Omit<
  ComponentPropsWithoutRef<'span'>,
  'aria-hidden' | 'children'
> {
  ref?: Ref<HTMLSpanElement>;
}

export const FieldRequiredIndicator = ({
  className,
  ref,
  ...props
}: FieldRequiredIndicatorProps) => (
  <span
    ref={ref}
    {...props}
    aria-hidden="true"
    className={cn('text-2xs text-(--ui-accent)', className)}
  >
    *
  </span>
);
