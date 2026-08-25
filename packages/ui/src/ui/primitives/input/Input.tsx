import type { ComponentPropsWithoutRef, Ref } from 'react';
import { CircleCheck } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { Spinner } from '../spinner/Spinner';
import { inputBaseClass } from './input.styles';

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'color'> {
  isValid?: boolean;
  /** Shows a loading spinner in the trailing slot (e.g. async validation in flight). */
  isPending?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export const Input = ({
  type = 'text',
  className,
  isValid,
  isPending,
  ref,
  ...props
}: InputProps) => {
  if (isValid === undefined && !isPending) {
    return <input ref={ref} type={type} className={cn(inputBaseClass, className)} {...props} />;
  }

  return (
    <div className="relative">
      <input ref={ref} type={type} className={cn(inputBaseClass, 'pr-10', className)} {...props} />
      {isPending ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Spinner
            className="text-(--ui-text-subtle)"
            decorative={false}
            label="Checking"
            size="sm"
          />
        </span>
      ) : (
        isValid && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <CircleCheck className="text-tone-green size-5" aria-hidden="true" />
          </span>
        )
      )}
    </div>
  );
};
