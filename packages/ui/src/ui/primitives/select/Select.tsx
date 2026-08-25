import type { ComponentPropsWithoutRef, Ref } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { selectBaseClass } from './select.styles';

export interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'color'> {
  ref?: Ref<HTMLSelectElement>;
}

export const Select = ({ className, ref, ...props }: SelectProps) => (
  <span className="relative block w-full">
    <select ref={ref} className={cn(selectBaseClass, 'pr-10', className)} {...props} />
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-(--ui-text-subtle)"
      strokeWidth={2}
    />
  </span>
);
