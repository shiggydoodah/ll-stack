'use client';

import { type ReactNode } from 'react';

import { FileUpload } from '../../../components/file-upload';
import type {
  FileUploadSize,
  FileUploadTone,
  FileUploadVariant,
} from '../../../components/file-upload';
import { useTanStackFieldContext } from '../createAppForm';
import { useFieldErrorDisplay } from './useFieldErrorDisplay';

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
  // 'interaction': a file picker has no meaningful blur moment (focus jumps to the
  // native dialog), so selecting/removing files counts as much as blurring the control.
  const { errorMessage, invalid } = useFieldErrorDisplay({
    revealOn: 'interaction',
    validateOnBlur,
  });

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
