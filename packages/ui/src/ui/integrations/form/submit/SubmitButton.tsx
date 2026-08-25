import { useSelector } from '@tanstack/react-form';
import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '../../../primitives/button';
import { useFormContext } from '../createAppForm';
import { useFormTask } from '../useFormTask';

export interface SubmitButtonProps extends Omit<
  ButtonProps,
  'children' | 'disabled' | 'loading' | 'type'
> {
  children: ReactNode;
  disabled?: boolean;
}

export const SubmitButton = ({ children, disabled, ...props }: SubmitButtonProps) => {
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const { isBusy } = useFormTask();
  const blocked = isSubmitting || isBusy;

  return (
    <Button disabled={disabled || blocked} loading={blocked} type="submit" {...props}>
      {children}
    </Button>
  );
};
