'use client';

import { useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Textarea } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface TextAreaFieldProps {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  validateOnBlur?: boolean;
}

export const TextAreaField = ({
  className,
  disabled,
  fullWidth = true,
  hint,
  id,
  label,
  placeholder,
  required = false,
  rows,
  validateOnBlur = false,
}: TextAreaFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <FieldLabel>{label}</FieldLabel>
      <FieldHint>{hint}</FieldHint>
      <FieldControl>
        <Textarea
          onBlur={() => {
            setHasBlurred(true);
            field.handleBlur();
          }}
          onChange={(event) => field.handleChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
          value={field.state.value ?? ''}
        />
      </FieldControl>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
