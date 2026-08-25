'use client';

import { useState, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-form';

import { FileUpload } from '../../../components/file-upload';
import type {
  FileUploadSize,
  FileUploadTone,
  FileUploadVariant,
} from '../../../components/file-upload';
import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

/**
 * Props for {@link FileUploadField}.
 *
 * Value contract: the bound form value is `File[] | undefined`. Single-select
 * mode (`multiple` omitted/false) still writes a `File[]` of length 0 or 1, so
 * consumers always read one consistent shape. The value is `undefined` only
 * before any interaction (or after a reset).
 */
export interface FileUploadFieldProps {
  accept?: string | readonly string[];
  className?: string;
  disabled?: boolean;
  dropzone?: boolean;
  fullWidth?: boolean;
  hint?: ReactNode;
  label: ReactNode;
  maxFiles?: number;
  maxSize?: number;
  minFiles?: number;
  multiple?: boolean;
  required?: boolean;
  size?: FileUploadSize;
  tone?: FileUploadTone;
  validateOnBlur?: boolean;
  variant?: FileUploadVariant;
}

export const FileUploadField = ({
  accept,
  className,
  disabled,
  dropzone = false,
  fullWidth = true,
  hint,
  label,
  maxFiles,
  maxSize,
  minFiles,
  multiple = false,
  required = false,
  size,
  tone,
  validateOnBlur = false,
  variant,
}: FileUploadFieldProps) => {
  const field = useTanStackFieldContext<File[] | undefined>();
  const [hasInteracted, setHasInteracted] = useState(false);
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);
  const show = !validateOnBlur || hasInteracted || submissionAttempts > 0;
  const invalid = show && field.state.meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(field.state.meta.errors) : undefined;

  return (
    <FileUpload
      accept={accept}
      className={className}
      disabled={disabled}
      dropzone={dropzone}
      error={errorMessage}
      fullWidth={fullWidth}
      hint={hint}
      invalid={invalid}
      label={label}
      maxFiles={maxFiles}
      maxSize={maxSize}
      minFiles={minFiles}
      multiple={multiple}
      name={field.name}
      onBlur={field.handleBlur}
      onChange={(files) => {
        setHasInteracted(true);
        field.handleChange(files.length > 0 ? files : undefined);
      }}
      required={required}
      size={size}
      tone={tone}
      value={field.state.value ?? []}
      variant={variant}
    />
  );
};
