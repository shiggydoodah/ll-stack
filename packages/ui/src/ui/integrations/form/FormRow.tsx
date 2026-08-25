import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';

export type FormRowGap = 'small' | 'medium' | 'large';

export interface FormRowProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'color'> {
  children: ReactNode;
  fullWidth?: boolean;
  gap?: FormRowGap;
  ref?: Ref<HTMLDivElement>;
}

const gapClasses = {
  small: 'gap-3',
  medium: 'gap-4',
  large: 'gap-6',
} satisfies Record<FormRowGap, string>;

export const FormRow = ({
  children,
  className,
  fullWidth = true,
  gap = 'medium',
  ref,
  ...props
}: FormRowProps) => (
  <div
    ref={ref}
    className={cn(
      'grid min-w-0 grid-cols-1 md:auto-cols-fr md:grid-flow-col',
      gapClasses[gap],
      fullWidth ? 'w-full' : 'w-fit max-w-full',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
