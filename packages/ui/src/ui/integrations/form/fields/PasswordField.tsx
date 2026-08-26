'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CircleCheck, Eye, EyeOff } from 'lucide-react';

import { Field, FieldControl, FieldError, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { IconButton, Input } from '../../../primitives';
import { PasswordStrengthMeter } from '../../../components/password-strength-meter';
import type { PasswordStrength } from '../../../components/password-strength-meter';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

/** Default `minLength` for {@link PasswordField} and its derived validator. */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Default `onChange` validator derived from `minLength`. Consumer-supplied
 * `fieldValidators` merge over the defaults per hook, so this stays in force
 * unless they set `onChange` themselves. Empty stays valid — like the native
 * `minlength` attribute, emptiness is `required`'s concern, not length's.
 */
export const passwordMinLengthValidator =
  (minLength: number) =>
  ({ value }: { value: unknown }): string | undefined =>
    typeof value === 'string' && value.length > 0 && value.length < minLength
      ? `Password must be at least ${minLength} characters.`
      : undefined;

export interface PasswordFieldProps {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  /**
   * Minimum password length. Sets the native `minLength` attribute and derives an
   * `onChange` validator so the limit actually blocks submission (it also feeds
   * the placeholder and counter). Consumer `fieldValidators` merge over that per
   * hook, so only supplying `onChange` yourself replaces the length check.
   *
   * @defaultValue `12`
   */
  minLength?: number;
  /** Overrides the default `` `At least ${minLength} characters` `` placeholder (e.g. to localise it). */
  placeholder?: string;
  required?: boolean;
  showValid?: boolean;
  validateOnBlur?: boolean;
}

const scorePassword = (value: string): PasswordStrength => {
  if (!value) return 0;
  const len = value.length;
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^a-zA-Z\d]/.test(value);
  const types = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (len >= 12 && types >= 4) return 5;
  if (len >= 8 && types >= 3) return 4;
  if (len >= 8 && types >= 2) return 3;
  if (len >= 8 || types >= 2) return 2;
  return 1;
};

export const PasswordField = ({
  className,
  disabled,
  fullWidth = true,
  id,
  label,
  minLength = PASSWORD_MIN_LENGTH,
  placeholder,
  required = false,
  showValid = false,
  validateOnBlur = false,
}: PasswordFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const value = field.state.value ?? '';
  const { errorMessage, invalid, show } = useFieldErrorDisplay({ validateOnBlur });
  const strength = scorePassword(value);
  const showValidIcon = showValid && show && field.state.meta.errors.length === 0 && !!value;

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
      <div className="relative">
        <FieldControl>
          <Input
            className={showValidIcon ? 'pr-16' : 'pr-10'}
            minLength={minLength}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder={placeholder ?? `At least ${minLength} characters`}
            type={showPassword ? 'text' : 'password'}
            value={value}
          />
        </FieldControl>
        {showValidIcon && (
          <span className="pointer-events-none absolute inset-y-0 right-11 flex items-center">
            <CircleCheck aria-hidden="true" className="text-tone-green size-5" />
          </span>
        )}
        <IconButton
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute top-1/2 right-2 -translate-y-1/2"
          onClick={() => setShowPassword((p) => !p)}
          size="small"
          tone="neutral"
          type="button"
          variant="ghost"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </IconButton>
      </div>
      <PasswordStrengthMeter
        strength={strength}
        rightContent={value.length > 0 ? `${value.length} / ${minLength} min` : undefined}
      />
      <FieldError>{errorMessage}</FieldError>
    </Field>
  );
};
