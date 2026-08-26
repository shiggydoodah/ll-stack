import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { radioBaseClass } from './radio.styles';

export interface RadioProps extends Omit<ComponentPropsWithoutRef<'input'>, 'color' | 'type'> {
  ref?: Ref<HTMLInputElement>;
}

export const Radio = ({ className, ref, ...props }: RadioProps) => (
  <input ref={ref} type="radio" className={cn(radioBaseClass, className)} {...props} />
);
