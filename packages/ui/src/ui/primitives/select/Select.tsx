import type { ComponentPropsWithoutRef, Ref } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { selectBaseClass } from './select.styles';

export interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'color'> {
  /** Classes for the wrapper span — e.g. a width override, since the select fills it. */
  containerClassName?: string;
  ref?: Ref<HTMLSelectElement>;
}

export const Select = ({ className, containerClassName, ref, ...props }: SelectProps) => (
  <span className={cn('relative block w-full', containerClassName)}>
    <select ref={ref} className={cn(selectBaseClass, 'pr-10', className)} {...props} />
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-(--ui-text-subtle)"
      strokeWidth={2}
    />
  </span>
);
