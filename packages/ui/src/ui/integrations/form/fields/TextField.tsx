'use client';

import { useRef } from 'react';
import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute, ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { Input } from '../../../primitives';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

/**
 * Input types that own a native picker (calendar / clock), eligible for
 * `autoOpenPicker`. Deliberately excludes `color` and `file`, whose pickers are
 * modal enough that auto-opening them would trap the user.
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
  /**
   * Open the native date/time picker when the field is clicked. Only applies to
   * picker-owning types (`date`, `time`, …) and only to pointer-initiated focus:
   * keyboard traversal (Tab) and programmatic focus (e.g. the failed-submit focus
   * move) never pop the picker, which would be an unexpected context change
   * (WCAG 3.2.1).
   *
   * @defaultValue `false`
   */
  autoOpenPicker?: boolean;
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
  autoOpenPicker = false,
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
  const { errorMessage, invalid, show } = useFieldErrorDisplay({ validateOnBlur });
  // Always boolean (never undefined) when showValid=true so Input's DOM structure stays stable.
  // Gate on `show` so the checkmark only appears after blur (or submit attempt).
  const isValid: boolean | undefined = showValid
    ? show && field.state.meta.errors.length === 0 && !!field.state.value
    : undefined;
  const opensNativePicker = autoOpenPicker && NATIVE_PICKER_TYPES.has(type);
  // Marks a focus event as pointer-initiated: pointerdown fires before the focus it
  // causes, so a set flag at focus time means "the user clicked in", while Tab or a
  // programmatic .focus() arrives with the flag clear.
  const pointerDownRef = useRef(false);

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
            pointerDownRef.current = false;
            field.handleBlur();
          }}
          onChange={(event) => field.handleChange(event.target.value)}
          onFocus={
            opensNativePicker
              ? (event) => {
                  if (pointerDownRef.current) {
                    pointerDownRef.current = false;
                    openNativePicker(event.currentTarget);
                  }
                }
              : undefined
          }
          onPointerDown={
            opensNativePicker
              ? (event) => {
                  // Clicking a field that already holds focus fires no focus event,
                  // so open the picker here (e.g. after dismissing it with Escape);
                  // otherwise flag the upcoming focus event as pointer-initiated.
                  if (document.activeElement === event.currentTarget) {
                    openNativePicker(event.currentTarget);
                  } else {
                    pointerDownRef.current = true;
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
