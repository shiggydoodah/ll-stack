'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { CircleCheck, Eye, EyeOff } from 'lucide-react';
import { useSelector } from '@tanstack/react-form';

import { Field, FieldControl, FieldError, FieldLabel } from '../../../components/fields';
import { cn } from '../../../../lib/cn';
import { IconButton, Input } from '../../../primitives';
import { PasswordStrengthMeter } from '../../../components/password-strength-meter';
import type { PasswordStrength } from '../../../components/password-strength-meter';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface PasswordFieldProps {
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Overrides the control id (defaults to `input-${name}`). */
  id?: string;
  label: ReactNode;
  minLength?: number;
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
  minLength = 12,
  required = false,
  showValid = false,
  validateOnBlur = false,
}: PasswordFieldProps) => {
  const field = useTanStackFieldContext<string | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const [hasBlurred, setHasBlurred] = useState(false);
  const value = field.state.value ?? '';
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasBlurred || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;
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
            onBlur={() => {
              setHasBlurred(true);
              field.handleBlur();
            }}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder={`At least ${minLength} characters`}
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
