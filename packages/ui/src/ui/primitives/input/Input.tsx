import type { ComponentPropsWithoutRef, Ref } from 'react';
import { CircleCheck } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { Spinner } from '../spinner/Spinner';
import { inputBaseClass } from './input.styles';

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'color'> {
  isValid?: boolean;
  /** Shows a loading spinner in the trailing slot (e.g. async validation in flight). */
  isPending?: boolean;
  /**
   * Accessible name for the pending spinner, so consumers can localise it.
   *
   * @defaultValue `'Checking'`
   */
  pendingLabel?: string;
  ref?: Ref<HTMLInputElement>;
}

export const Input = ({
  type = 'text',
  className,
  isValid,
  isPending,
  pendingLabel = 'Checking',
  ref,
  ...props
}: InputProps) => {
  // The wrapper is always rendered so the <input> keeps the same tree position
  // when validation state first appears — swapping between a bare input and a
  // wrapped one would remount the element and drop focus/caret mid-typing.
  const hasStatusSlot = isPending || isValid !== undefined;

  return (
    <div className="relative">
      <input
        ref={ref}
        type={type}
        className={cn(inputBaseClass, hasStatusSlot && 'pr-10', className)}
        {...props}
      />
      {isPending ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Spinner
            className="text-(--ui-text-subtle)"
            decorative={false}
            label={pendingLabel}
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
