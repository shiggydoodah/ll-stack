'use client';

import { type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { Checkbox } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

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
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });

  return (
    <Field
      className={className}
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
            onBlur={field.handleBlur}
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
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
