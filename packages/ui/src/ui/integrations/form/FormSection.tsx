import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';

export interface FormSectionProps extends Omit<
  ComponentPropsWithoutRef<'section'>,
  'children' | 'color'
> {
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}

export const FormSection = ({ children, className, ref, ...props }: FormSectionProps) => (
  <section ref={ref} className={cn('flex flex-col gap-5', className)} {...props}>
    {children}
  </section>
);
