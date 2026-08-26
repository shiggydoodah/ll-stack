'use client';

import { useId, type ReactNode } from 'react';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { fieldLabelBaseClass } from '../../../components/fields/fieldLabel.styles';
import { cn } from '../../../../lib/cn';
import { CheckboxButton } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { FieldGroup } from './FieldGroup';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

export interface ChipSelectFieldProps {
  className?: string;
  disabled?: boolean;
  hint?: ReactNode;
  label: ReactNode;
  options: readonly string[];
  required?: boolean;
  validateOnBlur?: boolean;
}

/**
 * Form-bound single-select chip group rendered as a row of {@link CheckboxButton}s.
 * The single-select sibling of {@link CheckboxButtonGroupField}: it reads/writes a
 * `string` field value, and clicking the already-selected chip clears it back to
 * `''` — the "not provided" sentinel these optional fields already accept. Every
 * option's label is its value, so call sites pass a plain `readonly string[]`.
 *
 * @example
 * ```tsx
 * <form.ChipSelectField name="interest" label="Interest" options={['gaming', 'reading', 'sports']} />
 * ```
 */
export const ChipSelectField = ({
  className,
  disabled,
  hint,
  label,
  options,
  required = false,
  validateOnBlur = false,
}: ChipSelectFieldProps) => {
  const field = useTanStackFieldContext<string>();
  const value = field.state.value ?? '';
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });
  const groupId = useId();
  const labelId = `${groupId}-label`;

  return (
    <Field
      className={cn(className)}
      disabled={disabled}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <span className={fieldLabelBaseClass} id={labelId}>
        {label}
        {required && (
          <span aria-hidden className="text-(--ui-accent)">
            *
          </span>
        )}
      </span>
      <FieldHint>{hint}</FieldHint>
      <FieldGroup aria-labelledby={labelId} className="flex flex-wrap gap-2" role="group">
        {options.map((option) => (
          <CheckboxButton
            key={option}
            disabled={disabled}
            onBlur={field.handleBlur}
            onClick={() => field.handleChange(value === option ? '' : option)}
            selected={value === option}
          >
            {option}
          </CheckboxButton>
        ))}
      </FieldGroup>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
