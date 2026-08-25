'use client';

import { useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Checkbox } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface CheckboxFieldProps {
  className?: string;
  disabled?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  required?: boolean;
  validateOnBlur?: boolean;
}

export const CheckboxField = ({
  className,
  disabled,
  hint,
  id,
  label,
  required,
  validateOnBlur = false,
}: CheckboxFieldProps) => {
  const field = useTanStackFieldContext<boolean | undefined>();
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;

  return (
    <Field
      className={cn('space-y-0', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <div className="flex items-start gap-2">
        <FieldControl>
          <Checkbox
            checked={field.state.value ?? false}
            onBlur={() => {
              setHasBlurred(true);
              field.handleBlur();
            }}
            onCheckedChange={(checked) => field.handleChange(checked)}
          />
        </FieldControl>
        <div className="space-y-1">
          <FieldLabel className="m-0 font-(family-name:--ui-font-body) text-sm font-normal tracking-normal text-(--ui-foreground) normal-case">
            {label}
          </FieldLabel>
          <FieldHint>{hint}</FieldHint>
        </div>
      </div>
      <FieldError className="mt-2">{errorMessage}</FieldError>
    </Field>
  );
};
