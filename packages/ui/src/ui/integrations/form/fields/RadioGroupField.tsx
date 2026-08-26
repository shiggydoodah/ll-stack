'use client';

import { useId, type ReactNode } from 'react';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Radio } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { FieldGroup } from './FieldGroup';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

export interface RadioGroupItem {
  disabled?: boolean;
  hint?: ReactNode;
  label: ReactNode;
  value: string;
}

export interface RadioGroupFieldProps {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hint?: ReactNode;
  items: ReadonlyArray<RadioGroupItem>;
  label: ReactNode;
  required?: boolean;
  validateOnBlur?: boolean;
}

export const RadioGroupField = ({
  className,
  disabled,
  fullWidth = true,
  hint,
  items,
  label,
  required = false,
  validateOnBlur = false,
}: RadioGroupFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const { errorMessage, invalid } = useFieldErrorDisplay({ validateOnBlur });
  const groupId = useId();
  const labelId = `${groupId}-label`;

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      invalid={invalid}
      name={field.name}
      required={required}
    >
      <span className="block text-sm font-medium text-(--ui-text-body)" id={labelId}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-(--ui-accent)">
            *
          </span>
        )}
      </span>
      <FieldHint>{hint}</FieldHint>
      <FieldGroup aria-labelledby={labelId} className="flex flex-col gap-2" role="radiogroup">
        {items.map((item) => {
          const itemId = `${groupId}-${item.value}`;
          const itemDisabled = disabled || item.disabled;

          return (
            <label
              className={cn(
                'flex items-start gap-2 text-sm text-(--ui-text-body)',
                itemDisabled && 'cursor-not-allowed opacity-60',
              )}
              htmlFor={itemId}
              key={item.value}
            >
              <Radio
                aria-invalid={invalid || undefined}
                checked={field.state.value === item.value}
                disabled={itemDisabled}
                id={itemId}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={() => field.handleChange(item.value)}
                value={item.value}
              />
              <span className="space-y-1">
                <span className="block">{item.label}</span>
                {item.hint && (
                  <span className="block text-xs text-(--ui-text-muted)">{item.hint}</span>
                )}
              </span>
            </label>
          );
        })}
      </FieldGroup>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
