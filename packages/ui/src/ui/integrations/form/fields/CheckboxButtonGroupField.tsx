'use client';

import { useId, type ReactNode } from 'react';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { fieldLabelBaseClass } from '../../../components/fields/fieldLabel.styles';
import { cn } from '../../../../lib/cn';
import { CheckboxButton } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { FieldGroup } from './FieldGroup';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

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
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });
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
        {items.map((item) => {
          const itemDisabled = disabled || item.disabled;

          return (
            <CheckboxButton
              key={item.value}
              disabled={itemDisabled}
              onBlur={field.handleBlur}
              onClick={() => toggle(item.value)}
              selected={value.includes(item.value)}
            >
              {item.label}
            </CheckboxButton>
          );
        })}
      </FieldGroup>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
