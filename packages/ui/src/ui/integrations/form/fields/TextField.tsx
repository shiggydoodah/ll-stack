'use client';

import { useState } from 'react';
import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute, ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Input } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

/**
 * Input types that own a native picker (calendar / clock). Left alone, a date or time
 * input only reveals its picker via the small indicator icon at the right edge, so we
 * open it as soon as the field is reached. Deliberately excludes `color` and `file`,
 * whose pickers are modal enough that auto-opening them would trap the user.
 */
const NATIVE_PICKER_TYPES = new Set<HTMLInputTypeAttribute>([
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

const openNativePicker = (element: HTMLInputElement) => {
  if (element.disabled || element.readOnly || typeof element.showPicker !== 'function') {
    return;
  }

  try {
    element.showPicker();
  } catch {
    // showPicker throws without transient user activation (e.g. focus moved
    // programmatically after a failed submit) or on an immutable control. The
    // field is still typeable and the indicator icon still works, so ignore it.
  }
};

export interface TextFieldProps {
  /** Browser autofill hint (e.g. `username`, `email`, `current-password`). */
  autoComplete?: HTMLInputAutoCompleteAttribute;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  placeholder?: string;
  required?: boolean;
  showValid?: boolean;
  type?: HTMLInputTypeAttribute;
  validateOnBlur?: boolean;
}

export const TextField = ({
  autoComplete,
  className,
  disabled,
  fullWidth = true,
  hint,
  id,
  label,
  placeholder,
  required = false,
  showValid = false,
  type = 'text',
  validateOnBlur = false,
}: TextFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const [hasBlurred, setHasBlurred] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;
  // Always boolean (never undefined) when showValid=true so Input's DOM structure stays stable.
  // Gate on `show` so the checkmark only appears after blur (or submit attempt).
  const isValid: boolean | undefined = showValid
    ? show && field.state.meta.errors.length === 0 && !!field.state.value
    : undefined;
  const opensNativePicker = NATIVE_PICKER_TYPES.has(type);

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
        <Input
          autoComplete={autoComplete}
          isValid={isValid}
          onBlur={() => {
            setHasBlurred(true);
            field.handleBlur();
          }}
          onChange={(event) => field.handleChange(event.target.value)}
          onFocus={opensNativePicker ? (event) => openNativePicker(event.currentTarget) : undefined}
          onPointerDown={
            opensNativePicker
              ? (event) => {
                  // Clicking a field that already holds focus fires no focus event,
                  // so re-open the picker here (e.g. after dismissing it with Escape).
                  if (document.activeElement === event.currentTarget) {
                    openNativePicker(event.currentTarget);
                  }
                }
              : undefined
          }
          placeholder={placeholder}
          type={type}
          value={field.state.value ?? ''}
        />
      </FieldControl>
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
