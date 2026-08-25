import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';
import { textareaBaseClass } from './textarea.styles';

export interface TextareaProps extends Omit<ComponentPropsWithoutRef<'textarea'>, 'color'> {
  ref?: Ref<HTMLTextAreaElement>;
}

export const Textarea = ({ className, ref, ...props }: TextareaProps) => (
  <textarea
    ref={ref}
    className={cn(textareaBaseClass, 'min-h-24 resize-y', className)}
    {...props}
  />
);
