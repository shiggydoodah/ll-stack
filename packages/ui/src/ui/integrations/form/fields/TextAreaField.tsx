'use client';

import { type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Textarea } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

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
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });

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
          onBlur={field.handleBlur}
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
