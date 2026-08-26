'use client';

import { useId, type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { MetricInput, type MetricInputProps } from '../../../components/metric-input';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

/** {@link MetricInput} configuration the field forwards (the field owns the rest). */
type MetricFieldInputProps = Omit<
  MetricInputProps,
  | 'value'
  | 'onChange'
  | 'ref'
  | 'invalid'
  | 'id'
  | 'name'
  | 'aria-label'
  | 'aria-labelledby'
  | 'onBlur'
>;

interface MetricFieldShellProps {
  className?: string;
  disabled?: boolean;
  /** @defaultValue `true` */
  fullWidth?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  required?: boolean;
  /** Defer error display until the control is blurred. @defaultValue `false` */
  validateOnBlur?: boolean;
}

export type MetricFieldProps = MetricFieldShellProps & MetricFieldInputProps;

/**
 * Form-bound metric input for TanStack Form. Consumed as `form.MetricField({ ... })`.
 * Wraps the {@link MetricInput} component in the shared field shell (label, hint,
 * error, ARIA wiring). The bound field value is the canonical number (in
 * `canonicalUnit`) or `null`; switching display units never mutates it.
 */
export const MetricField = (props: MetricFieldProps) => {
  const {
    className,
    disabled,
    fullWidth = true,
    hint,
    id,
    label,
    required = false,
    validateOnBlur = false,
    ...inputProps
  } = props;

  const field = useTanStackFieldContext<number | null>();
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });
  const labelId = useId();

  // FieldControl injects id/name/aria-describedby/aria-required/disabled; we supply
  // the accessible name via aria-labelledby and the controlled value/handlers.
  const control = (
    <MetricInput
      {...inputProps}
      aria-labelledby={labelId}
      disabled={disabled}
      invalid={invalid}
      onBlur={field.handleBlur}
      onChange={(next) => field.handleChange(next)}
      value={field.state.value ?? null}
    />
  );

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <FieldHint>{hint}</FieldHint>
      <FieldControl>{control}</FieldControl>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
