'use client';

import { type ReactNode } from 'react';

import { Field, FieldControl, FieldError, FieldHint, FieldLabel } from '../../../components/fields';
import { DropDown, type DropDownOption } from '../../../components/dropdown';
import { cn } from '../../../../lib/cn';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

export interface ComboBoxFieldProps {
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  fullWidth?: boolean;
  hideErrorMessage?: boolean;
  hint?: ReactNode;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  /** Visible field label. Provide this or `placeholder` so the control is named. */
  label?: ReactNode;
  options: DropDownOption[];
  /** Trigger placeholder; also the accessible name (via `aria-label`) when no `label` is set. */
  placeholder?: string;
  required?: boolean;
  /**
   * Render a search input inside the popover for client-side filtering.
   *
   * @defaultValue `true`
   */
  searchable?: boolean;
  validateOnBlur?: boolean;
}

/**
 * Form-integrated single-select combobox. Wraps {@link DropDown} (searchable,
 * icon-capable) and bridges it to TanStack form state. Use for any searchable
 * single choice — country, role, etc. — by passing `options`.
 *
 * Accessibility: provide a `label` (preferred) or a `placeholder` — one of them
 * names the control (a `label` wires `aria-labelledby`; otherwise `placeholder`
 * becomes the trigger's `aria-label`). With neither, the combobox has no
 * accessible name.
 */
export const ComboBoxField = ({
  className,
  disabled,
  emptyMessage,
  fullWidth = true,
  hideErrorMessage = false,
  hint,
  id,
  label,
  options,
  placeholder,
  required = false,
  searchable = true,
  validateOnBlur = false,
}: ComboBoxFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  // 'interaction': blur is awkward on a popover combobox (the trigger blurs when the
  // popover opens), so picking an option counts as much as blurring the trigger.
  const { errorMessage, invalid } = useFieldErrorDisplay({
    revealOn: 'interaction',
    validateOnBlur,
  });

  return (
    <Field
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled}
      id={id}
      invalid={invalid}
      labelAssociation={label === undefined ? 'for' : 'labelledby'}
      name={field.name}
      required={required}
    >
      {label !== undefined && <FieldLabel>{label}</FieldLabel>}
      <FieldHint>{hint}</FieldHint>
      {/* The DropDown trigger is a `<div role="combobox">` (not a labelable
          element), so FieldControl names it via aria-labelledby instead of a
          `<label htmlFor>`, and forwards id + aria-describedby/invalid/required. */}
      <FieldControl>
        <DropDown
          aria-label={label === undefined ? placeholder : undefined}
          className={cn(invalid && 'border-tone-red')}
          emptyMessage={emptyMessage}
          options={options}
          placeholder={placeholder}
          searchable={searchable}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(next) => {
            field.handleChange(Array.isArray(next) ? next[0] : next);
          }}
        />
      </FieldControl>
      {!hideErrorMessage && <FieldError>{errorMessage}</FieldError>}
    </Field>
  );
};
