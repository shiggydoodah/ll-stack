'use client';

import { useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Select } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface SelectFieldOption {
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export type SelectFieldProps = {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hideErrorMessage?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  options: ReadonlyArray<SelectFieldOption>;
  required?: boolean;
  validateOnBlur?: boolean;
} & ({ label: ReactNode; placeholder?: string } | { label?: undefined; placeholder: string });

export const SelectField = ({
  className,
  disabled,
  fullWidth = true,
  hideErrorMessage = false,
  hint,
  id,
  label,
  options,
  placeholder,
  required = false,
  validateOnBlur = false,
}: SelectFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;

  return (
    <Field
      className={cn(fullWidth && 'flex w-full flex-col gap-1', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      {label !== undefined && <FieldLabel>{label}</FieldLabel>}
      <FieldHint>{hint}</FieldHint>
      <FieldControl>
        <Select
          aria-label={label === undefined ? placeholder : undefined}
          onBlur={() => {
            setHasBlurred(true);
            field.handleBlur();
          }}
          onChange={(event) => field.handleChange(event.target.value)}
          value={field.state.value ?? ''}
        >
          {placeholder && (
            <option disabled value="">
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FieldControl>
      {!hideErrorMessage && <FieldError>{errorMessage}</FieldError>}
    </Field>
  );
};
