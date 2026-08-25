'use client';

import { useId, useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { fieldLabelBaseClass } from '../../../components/fields/fieldLabel.styles';
import { cn } from '../../../../lib/cn';
import { CheckboxButton } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface CheckboxButtonGroupItem {
  label: ReactNode;
  value: string;
  disabled?: boolean;
}

export interface CheckboxButtonGroupFieldProps {
  className?: string;
  disabled?: boolean;
  hint?: ReactNode;
  items: ReadonlyArray<CheckboxButtonGroupItem>;
  label: ReactNode;
  required?: boolean;
  validateOnBlur?: boolean;
}

/**
 * Form-bound multi-select group rendered as a row of {@link CheckboxButton}s.
 * The multi-select sibling of {@link RadioButtonGroupField}: it reads/writes a
 * `string[]` field value and toggles each option's membership on click.
 *
 * @example
 * ```tsx
 * <form.CheckboxButtonGroupField
 *   name="interests"
 *   label="Interests"
 *   items={options.map((value) => ({ label: value, value }))}
 * />
 * ```
 */
export const CheckboxButtonGroupField = ({
  className,
  disabled,
  hint,
  items,
  label,
  required = false,
  validateOnBlur = false,
}: CheckboxButtonGroupFieldProps) => {
  const field = useTanStackFieldContext<string[]>();
  const value = field.state.value ?? [];
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;
  const groupId = useId();
  const labelId = `${groupId}-label`;

  const toggle = (optionValue: string) => {
    field.handleChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  return (
    <Field
      aria-labelledby={labelId}
      className={cn('flex flex-col gap-3', className)}
      disabled={disabled}
      invalid={invalid}
      name={field.name}
      required={required}
      role="group"
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
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const itemDisabled = disabled || item.disabled;

          return (
            <CheckboxButton
              key={item.value}
              disabled={itemDisabled}
              onBlur={() => {
                setHasBlurred(true);
                field.handleBlur();
              }}
              onClick={() => toggle(item.value)}
              selected={value.includes(item.value)}
            >
              {item.label}
            </CheckboxButton>
          );
        })}
      </div>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
