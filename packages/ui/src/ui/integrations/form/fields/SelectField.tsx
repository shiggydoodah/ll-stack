'use client';

import { type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Select } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

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
      {label !== undefined && <FieldLabel>{label}</FieldLabel>}
      <FieldHint>{hint}</FieldHint>
      <FieldControl>
        <Select
          aria-label={label === undefined ? placeholder : undefined}
          onBlur={field.handleBlur}
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
