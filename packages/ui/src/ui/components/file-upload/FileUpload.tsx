'use client';

import { Upload } from 'lucide-react';
import { useId, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../../../lib/cn';
import { Button } from '../../primitives/button/button';
import {
  Field,
  FieldContext,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  resolveFieldControlId,
} from '../fields';
import {
  useFileUpload,
  type FileUploadError,
  type UseFileUploadOptions,
} from '../../hooks/useFileUpload';
import {
  fileUploadDropzoneLayout,
  fileUploadDropzoneToneClasses,
  fileUploadRootLayout,
  type FileUploadSize,
  type FileUploadTone,
  type FileUploadVariant,
} from './file-upload.styles';

export type { FileUploadSize, FileUploadTone, FileUploadVariant };

/**
 * The interaction surface handed to a custom render-prop trigger
 * ({@link FileUploadProps.children}). Gives consumers full control over the
 * trigger markup while keeping dialog, selection, and state wiring in the hook.
 */
export interface FileUploadRenderApi {
  /** Currently selected browser `File` objects. */
  files: File[];
  /** True while files are being dragged over the dropzone. */
  isDragging: boolean;
  /** Typed validation errors from the latest failed validation. */
  errors: FileUploadError[];
  /** Open the native file picker. */
  openFileDialog: () => void;
  /** Remove a selected file by index or reference. */
  removeFile: (indexOrFile: number | File) => void;
  /** Clear the whole selection. */
  clearFiles: () => void;
  /** Whether the control is disabled. */
  disabled: boolean;
  /** Whether the control is in an invalid state. */
  invalid: boolean;
  /** Whether the control is required. */
  required: boolean;
  /** The `aria-describedby` value from the Field context (hint + error IDs). */
  describedBy: string;
}

/**
 * Props for {@link FileUpload}.
 *
 * Hook options (`value`, `defaultValue`, `onChange`, `accept`, `multiple`,
 * `minFiles`, `maxFiles`, `maxSize`, `onFilesAdded`, `onError`) are forwarded to
 * {@link useFileUpload}. The component manages selected `File` objects only — it
 * does not render a persistent uploaded-file list.
 */
export interface FileUploadProps extends UseFileUploadOptions {
  /** Accessible name for the file input / trigger. */
  'aria-label'?: string;
  /** Field label rendered above the control. */
  label?: ReactNode;
  /** Helper text rendered below the label. */
  hint?: ReactNode;
  /** Error message; presence marks the field invalid. */
  error?: ReactNode;
  /** Marks the field required (adds the required indicator and `aria-required`). */
  required?: boolean;
  /** Force the invalid visual/ARIA state independently of `error`. */
  invalid?: boolean;
  /** Stable field id; auto-generated when omitted. */
  id?: string;
  /** Form control name applied to the native input. */
  name?: string;

  /** Tone used by the default button trigger and dropzone accent. @defaultValue `'red'` */
  tone?: FileUploadTone;
  /** Variant used by the default button trigger. @defaultValue `'solid'` */
  variant?: FileUploadVariant;
  /** Size token for trigger and dropzone. @defaultValue `'medium'` */
  size?: FileUploadSize;
  /** Fill available inline width. @defaultValue `false` */
  fullWidth?: boolean;

  /** Render a drag-and-drop zone instead of a button trigger. @defaultValue `false` */
  dropzone?: boolean;

  /** Static custom trigger node, replacing the default button. Clicking it opens the dialog. */
  trigger?: ReactNode;
  /** Render-prop trigger receiving the full {@link FileUploadRenderApi}. Takes precedence over `trigger`. */
  children?: (api: FileUploadRenderApi) => ReactNode;

  /** Called when focus leaves the interactive trigger. */
  onBlur?: () => void;

  /** Class applied to the outer wrapper. */
  className?: string;
  /** Class applied to the dropzone element (dropzone mode only). */
  dropzoneClassName?: string;
  /** Class applied to the hidden native file input. */
  inputClassName?: string;
}

const defaultTriggerLabel = (multiple: boolean) => (multiple ? 'Choose files' : 'Choose file');

const dropzonePrompt = (multiple: boolean) =>
  multiple ? 'Drag files here or click to browse' : 'Drag a file here or click to browse';

/**
 * Accessible, controllable file uploader built on {@link useFileUpload} and the
 * shared `Field` accessibility shells. Supports a default button trigger, a
 * custom static trigger, a render-prop trigger, and a drag-and-drop zone.
 *
 * Generic and app-domain-neutral: works for images, video, PDFs, or arbitrary
 * `accept` rules, in single or multi-select mode.
 *
 * @example
 * ```tsx
 * <FileUpload label="Avatar" accept="image/*" onChange={setFiles} />
 * ```
 *
 * @example
 * ```tsx
 * <FileUpload dropzone multiple accept={['.pdf', 'image/*']} maxFiles={5} />
 * ```
 */
export const FileUpload = ({
  // hook options
  value,
  defaultValue,
  onChange,
  accept,
  multiple = false,
  minFiles,
  maxFiles,
  maxSize,
  disabled = false,
  onFilesAdded,
  onError,
  // field
  'aria-label': ariaLabel,
  label,
  hint,
  error,
  required = false,
  invalid,
  id,
  name = 'file-upload',
  // styling
  tone = 'red',
  variant = 'solid',
  size = 'medium',
  fullWidth = false,
  dropzone = false,
  onBlur,
  trigger,
  children,
  className,
  dropzoneClassName,
  inputClassName,
}: FileUploadProps) => {
  const upload = useFileUpload({
    value,
    defaultValue,
    onChange,
    accept,
    multiple,
    minFiles,
    maxFiles,
    maxSize,
    disabled,
    onFilesAdded,
    onError,
  });

  const statusId = useId();
  const hookErrorMessage = upload.errors[0]?.message;
  const displayError = error ?? hookErrorMessage;
  const resolvedInvalid = invalid ?? (Boolean(error) || Boolean(hookErrorMessage));

  const renderApiBase: Omit<FileUploadRenderApi, 'required' | 'describedBy'> = {
    files: upload.files,
    isDragging: upload.isDragging,
    errors: upload.errors,
    openFileDialog: upload.openFileDialog,
    removeFile: upload.removeFile,
    clearFiles: upload.clearFiles,
    disabled,
    invalid: resolvedInvalid,
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      upload.openFileDialog();
    }
  };

  const dropzoneState = disabled
    ? 'disabled'
    : upload.isDragging
      ? 'active'
      : resolvedInvalid
        ? 'invalid'
        : 'idle';

  const renderTrigger = (fieldDescribedBy: string, fieldRequired: boolean): ReactNode => {
    const fullRenderApi: FileUploadRenderApi = {
      ...renderApiBase,
      required: fieldRequired,
      describedBy: fieldDescribedBy,
    };

    if (children) {
      return children(fullRenderApi);
    }

    if (dropzone) {
      const combinedDescribedBy =
        [statusId, fieldDescribedBy].filter(Boolean).join(' ') || undefined;
      return (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-invalid={resolvedInvalid || undefined}
          aria-required={fieldRequired || undefined}
          aria-label={ariaLabel ?? dropzonePrompt(multiple)}
          aria-describedby={combinedDescribedBy}
          data-dragging={upload.isDragging || undefined}
          data-disabled={disabled || undefined}
          onClick={disabled ? undefined : upload.openFileDialog}
          onKeyDown={handleDropzoneKeyDown}
          onBlur={onBlur}
          {...upload.dragHandlers}
          className={cn(
            fileUploadDropzoneLayout({ size, fullWidth, state: dropzoneState }),
            upload.isDragging && !disabled && fileUploadDropzoneToneClasses[tone],
            disabled && 'cursor-not-allowed opacity-60',
            !disabled && 'cursor-pointer',
            dropzoneClassName,
          )}
        >
          <Upload aria-hidden className="size-5 shrink-0" />
          <span aria-live="polite" id={statusId}>
            {upload.isDragging ? 'Drop to upload' : dropzonePrompt(multiple)}
          </span>
          {upload.files.length > 0 && (
            <span className="text-xs text-(--ui-text-subtle)">
              {upload.files.length} file{upload.files.length === 1 ? '' : 's'} selected
            </span>
          )}
        </div>
      );
    }

    if (trigger) {
      return (
        <span
          role="presentation"
          onClick={disabled ? undefined : upload.openFileDialog}
          className="contents"
        >
          {trigger}
        </span>
      );
    }

    return (
      <Button
        type="button"
        tone={tone}
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={fieldDescribedBy || undefined}
        aria-required={fieldRequired || undefined}
        onBlur={onBlur}
        onClick={upload.openFileDialog}
      >
        <Upload aria-hidden className="size-4 shrink-0" />
        {defaultTriggerLabel(multiple)}
      </Button>
    );
  };

  return (
    <Field
      className={cn(fileUploadRootLayout({ fullWidth }), className)}
      disabled={disabled}
      id={id}
      invalid={resolvedInvalid}
      name={name}
      required={required}
    >
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      <FieldControl>
        <input
          {...upload.getInputProps({
            // Pin the input to the Field's control id rather than letting the
            // hook's generated fallback win — `FieldLabel`'s `htmlFor` targets
            // this id, so a mismatch would detach the label.
            id: resolveFieldControlId(name, id),
            name,
            'aria-label': ariaLabel,
            className: cn('sr-only', inputClassName),
            tabIndex: -1,
          })}
        />
      </FieldControl>
      <FieldContext.Consumer>
        {(ctx) => renderTrigger(ctx?.describedBy ?? '', ctx?.required ?? false)}
      </FieldContext.Consumer>
      <FieldError>{displayError}</FieldError>
    </Field>
  );
};
