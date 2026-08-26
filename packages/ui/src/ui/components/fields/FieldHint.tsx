'use client';

import { useEffect, useId, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';

import { cn } from '../../../lib/cn';
import { useFieldContext } from './FieldContext';
import { hasRenderableChildren } from './renderableChildren';

export interface FieldHintProps extends Omit<ComponentPropsWithoutRef<'p'>, 'children'> {
  children?: ReactNode;
  ref?: Ref<HTMLParagraphElement>;
}

export const FieldHint = ({ children, className, id, ref, ...props }: FieldHintProps) => {
  const generatedId = useId();
  const { registerHintId } = useFieldContext();
  const hintId = id ?? generatedId;
  const hasContent = hasRenderableChildren(children);

  useEffect(() => {
    if (!hasContent) {
      return undefined;
    }

    return registerHintId(hintId);
  }, [hasContent, hintId, registerHintId]);

  if (!hasContent) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={hintId}
      className={cn('text-2xs leading-normal text-(--ui-text-muted)', className)}
      {...props}
    >
      {children}
    </p>
  );
};
