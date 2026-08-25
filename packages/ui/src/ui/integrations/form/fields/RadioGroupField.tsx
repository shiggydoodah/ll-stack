'use client';

import { useId, useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldError, FieldHint } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Radio } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

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
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;
  const groupId = useId();
  const labelId = `${groupId}-label`;

  return (
    <Field
      aria-labelledby={labelId}
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      invalid={invalid}
      name={field.name}
      required={required}
      role="radiogroup"
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
      <div className="flex flex-col gap-2">
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
                onBlur={() => {
                  setHasBlurred(true);
                  field.handleBlur();
                }}
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
      </div>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
