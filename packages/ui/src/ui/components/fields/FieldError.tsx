'use client';

import { useEffect, useId, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';

import { cn } from '../../../lib/cn';
import { useFieldContext } from './FieldContext';
import { hasRenderableChildren } from './renderableChildren';

export interface FieldErrorProps extends Omit<ComponentPropsWithoutRef<'p'>, 'children'> {
  children?: ReactNode;
  ref?: Ref<HTMLParagraphElement>;
}

export const FieldError = ({ children, className, id, ref, ...props }: FieldErrorProps) => {
  const generatedId = useId();
  const { registerErrorId } = useFieldContext();
  const errorId = id ?? generatedId;
  const hasContent = hasRenderableChildren(children);

  useEffect(() => {
    if (!hasContent) {
      return undefined;
    }

    return registerErrorId(errorId);
  }, [errorId, hasContent, registerErrorId]);

  if (!hasContent) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={errorId}
      className={cn(
        'text-tone-red flex items-center gap-1.5 text-xs leading-[1.4]',
        "before:flex before:items-center before:justify-center before:content-['!']",
        'before:mt-px before:size-3.5 before:shrink-0 before:rounded-full',
        'before:bg-tone-red before:text-2xs before:text-tone-red-contrast before:font-bold',
        'before:font-(family-name:--ui-font-display)',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
};
