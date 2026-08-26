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
      // Announces errors that appear without a focus move (blur-triggered validation).
      // Assertive is deliberate over role="status": this node mounts only when an error
      // exists, and a freshly inserted polite region is unreliably announced, so the case
      // the role exists for is the one that would go silent. The submit path additionally
      // moves focus to the first invalid control.
      role="alert"
      className={cn(
        'text-tone-red flex items-center gap-1.5 text-xs leading-[1.4]',
        // The badge glyph itself comes from `.ui-field-error::before` in components.css,
        // where the alternative-text form of `content` sits behind an @supports guard —
        // see the comment there for why it cannot be a Tailwind utility.
        'ui-field-error',
        'before:flex before:items-center before:justify-center',
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
