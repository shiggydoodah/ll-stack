'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type DragEvent,
  type Ref,
} from 'react';

/**
 * Discriminated reason a file (or batch of files) was rejected by validation.
 *
 * - `too-many-files` — adding the file(s) would exceed `maxFiles`.
 * - `too-few-files` — the current selection is below `minFiles`.
 * - `file-too-large` — the file exceeds `maxSize` bytes.
 * - `file-invalid-type` — the file does not match the `accept` allow-list.
 * - `duplicate-file` — the file is already in the selection (same name/size/lastModified).
 */
export type FileUploadErrorCode =
  'too-many-files' | 'too-few-files' | 'file-too-large' | 'file-invalid-type' | 'duplicate-file';

/**
 * A single typed validation error. `file` is present for per-file errors
 * (type/size/duplicate) and omitted for collection-level errors (count).
 */
export interface FileUploadError {
  code: FileUploadErrorCode;
  message: string;
  file?: File;
}

/**
 * Configuration options for {@link useFileUpload}. All options are optional;
 * with no options the hook accepts a single file of any type and size.
 */
export interface UseFileUploadOptions {
  /** Controlled list of selected files. When provided the hook is controlled. */
  value?: File[];
  /** Initial selection for uncontrolled usage. Ignored when `value` is set. */
  defaultValue?: File[];
  /** Fired whenever the committed selection changes (add, remove, clear). */
  onChange?: (files: File[]) => void;
  /**
   * Allowed file types. Accepts the same token forms as the native `accept`
   * attribute: exact MIME (`image/png`), wildcard MIME (`image/*`), or file
   * extensions (`.pdf`). A single comma-separated string is also accepted.
   */
  accept?: string | readonly string[];
  /** When true, multiple files can be selected. Otherwise selection is capped at one. */
  multiple?: boolean;
  /** Minimum number of files required. Surfaced for validation; never blocks adds. */
  minFiles?: number;
  /** Maximum number of files allowed. Extra files are rejected with `too-many-files`. */
  maxFiles?: number;
  /** Maximum size per file, in bytes. */
  maxSize?: number;
  /** When true, all mutations and the file dialog are inert. */
  disabled?: boolean;
  /** Fired with the files that passed validation and were added to the selection. */
  onFilesAdded?: (files: File[]) => void;
  /** Fired with the typed errors produced by a failed validation. */
  onError?: (errors: FileUploadError[]) => void;
}

/** Extra props merged onto the hidden native file input via {@link UseFileUploadReturn.getInputProps}. */
export type FileInputProps = ComponentPropsWithoutRef<'input'> & { ref?: Ref<HTMLInputElement> };

/** Drag-and-drop event handlers returned by the hook for a dropzone element. */
export interface FileUploadDragHandlers {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

/** State and actions returned by {@link useFileUpload}. */
export interface UseFileUploadReturn {
  /** The current committed selection. */
  files: File[];
  /** True while files are being dragged over the dropzone. */
  isDragging: boolean;
  /** The errors from the most recent failed validation. */
  errors: FileUploadError[];
  /** True when the current selection violates `minFiles`/`maxFiles`. */
  hasCountError: boolean;
  /** Validate and add files to the selection, honouring `multiple`/`accept`/`maxSize`/`maxFiles`. */
  addFiles: (files: FileList | File[]) => void;
  /** Remove a file by index or by reference. */
  removeFile: (indexOrFile: number | File) => void;
  /** Remove all files. */
  clearFiles: () => void;
  /** Clear the current error list without touching the selection. */
  clearErrors: () => void;
  /** Open the native file picker (no-op when disabled). */
  openFileDialog: () => void;
  /** Build props for the hidden native `<input type="file">`. */
  getInputProps: (props?: FileInputProps) => FileInputProps;
  /** Drag handlers to spread onto a dropzone element. */
  dragHandlers: FileUploadDragHandlers;
  /** Whether the hook is disabled. */
  disabled: boolean;
}

const toAcceptTokens = (accept?: string | readonly string[]): string[] => {
  if (!accept) return [];
  const list = Array.isArray(accept) ? [...accept] : String(accept).split(',');
  return list.map((token) => token.trim().toLowerCase()).filter((token) => token.length > 0);
};

const fileMatchesAccept = (file: File, tokens: string[]): boolean => {
  if (tokens.length === 0) return true;
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith('.')) {
      return fileName.endsWith(token);
    }
    if (token.endsWith('/*')) {
      const group = token.slice(0, token.indexOf('/'));
      return fileType.startsWith(`${group}/`);
    }
    return fileType === token;
  });
};

const isSameFile = (a: File, b: File): boolean =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
};

/**
 * Headless file-selection hook. Owns selection state, validation, the native
 * file input, and drag-and-drop interaction. It is presentation-agnostic — pair
 * it with any trigger or dropzone UI.
 *
 * Manages browser `File` objects only; it does not upload, persist, or manage a
 * remote file list.
 *
 * @example
 * ```tsx
 * const upload = useFileUpload({ accept: 'image/*', multiple: true, maxSize: 5_000_000 });
 * <button onClick={upload.openFileDialog}>Choose images</button>
 * <input {...upload.getInputProps()} hidden />
 * ```
 */
export const useFileUpload = (options: UseFileUploadOptions = {}): UseFileUploadReturn => {
  const {
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
  } = options;

  const isControlled = value !== undefined;
  const [internalFiles, setInternalFiles] = useState<File[]>(() => defaultValue ?? []);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<FileUploadError[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  // Every consumer renders a real `<input type="file">`, so the hook owns a
  // default `id` for it — without one the browser reports the field as
  // unidentifiable ("A form field element should have an id or name
  // attribute"). Only the `id` is defaulted: a generated `name` carries no
  // meaning and would ride along in a native form submit. Callers that need a
  // real `name` (or their own id) pass it through `getInputProps`.
  const generatedInputId = useId();

  const files = isControlled ? value : internalFiles;
  const acceptTokens = useMemo(() => toAcceptTokens(accept), [accept]);
  const acceptAttr = useMemo(() => {
    if (!accept) return undefined;
    return Array.isArray(accept) ? accept.join(',') : String(accept);
  }, [accept]);

  // Latest-ref pattern so the stable callbacks below always see current values.
  const filesRef = useRef(files);
  const onChangeRef = useRef(onChange);
  const onFilesAddedRef = useRef(onFilesAdded);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    filesRef.current = files;
    onChangeRef.current = onChange;
    onFilesAddedRef.current = onFilesAdded;
    onErrorRef.current = onError;
  });

  const commit = useCallback(
    (next: File[]) => {
      if (!isControlled) {
        setInternalFiles(next);
      }
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      if (disabled) return;

      const candidates = Array.from(incoming);
      if (candidates.length === 0) return;

      const accepted: File[] = [];
      const nextErrors: FileUploadError[] = [];
      // In single mode each batch replaces the selection; in multiple mode it appends.
      const startingFiles = multiple ? filesRef.current : [];

      for (const file of candidates) {
        if (acceptTokens.length > 0 && !fileMatchesAccept(file, acceptTokens)) {
          nextErrors.push({
            code: 'file-invalid-type',
            message: `"${file.name}" is not an accepted file type.`,
            file,
          });
          continue;
        }

        if (maxSize !== undefined && file.size > maxSize) {
          nextErrors.push({
            code: 'file-too-large',
            message: `"${file.name}" is larger than the ${formatBytes(maxSize)} limit.`,
            file,
          });
          continue;
        }

        const alreadySelected = [...startingFiles, ...accepted].some((existing) =>
          isSameFile(existing, file),
        );
        if (alreadySelected) {
          nextErrors.push({
            code: 'duplicate-file',
            message: `"${file.name}" has already been added.`,
            file,
          });
          continue;
        }

        accepted.push(file);

        // Single-select keeps only the latest valid file.
        if (!multiple) break;
      }

      let nextFiles = multiple ? [...startingFiles, ...accepted] : accepted;

      if (multiple && maxFiles !== undefined && nextFiles.length > maxFiles) {
        const overflow = nextFiles.length - maxFiles;
        nextErrors.push({
          code: 'too-many-files',
          message: `You can upload at most ${maxFiles} file${maxFiles === 1 ? '' : 's'}.`,
        });
        nextFiles = nextFiles.slice(0, maxFiles);
        // Drop the rejected files from the "added" notification too.
        accepted.splice(accepted.length - overflow, overflow);
      }

      if (minFiles !== undefined && nextFiles.length < minFiles) {
        nextErrors.push({
          code: 'too-few-files',
          message: `At least ${minFiles} file${minFiles === 1 ? '' : 's'} required.`,
        });
      }

      setErrors(nextErrors);
      if (nextErrors.length > 0) {
        onErrorRef.current?.(nextErrors);
      }

      if (accepted.length > 0) {
        commit(nextFiles);
        onFilesAddedRef.current?.(accepted);
      }
    },
    [acceptTokens, commit, disabled, maxFiles, maxSize, minFiles, multiple],
  );

  const tooFewError = useCallback(
    (count: number): FileUploadError | null =>
      minFiles !== undefined && count < minFiles
        ? {
            code: 'too-few-files',
            message: `At least ${minFiles} file${minFiles === 1 ? '' : 's'} required.`,
          }
        : null,
    [minFiles],
  );

  const removeFile = useCallback(
    (indexOrFile: number | File) => {
      if (disabled) return;
      const current = filesRef.current;
      const next =
        typeof indexOrFile === 'number'
          ? current.filter((_, index) => index !== indexOrFile)
          : current.filter((file) => file !== indexOrFile);
      if (next.length !== current.length) {
        commit(next);
        const err = tooFewError(next.length);
        setErrors(err ? [err] : []);
      }
    },
    [commit, disabled, tooFewError],
  );

  const clearFiles = useCallback(() => {
    if (disabled) return;
    if (filesRef.current.length > 0) {
      commit([]);
      const err = tooFewError(0);
      setErrors(err ? [err] : []);
    }
  }, [commit, disabled, tooFewError]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const openFileDialog = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        addFiles(event.target.files);
      }
      // Reset so selecting the same file again re-fires the change event.
      event.target.value = '';
    },
    [addFiles],
  );

  const getInputProps = useCallback(
    (props: FileInputProps = {}): FileInputProps => {
      const { onChange: overrideOnChange, ref: overrideRef, ...rest } = props;
      const mergedRef = (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof overrideRef === 'function') {
          overrideRef(node);
        } else if (overrideRef && 'current' in overrideRef) {
          (overrideRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      };
      return {
        type: 'file',
        accept: acceptAttr,
        multiple,
        disabled,
        id: generatedInputId,
        ...rest,
        ref: mergedRef,
        onChange: (event) => {
          handleInputChange(event);
          overrideOnChange?.(event);
        },
      };
    },
    [acceptAttr, disabled, generatedInputId, handleInputChange, multiple],
  );

  const dragHandlers = useMemo<FileUploadDragHandlers>(
    () => ({
      onDragEnter: (event) => {
        event.preventDefault();
        if (disabled) return;
        // Only light up for drags that actually carry files — dragging text or
        // links across the dropzone must not announce "drop to upload".
        if (!event.dataTransfer?.types?.includes('Files')) return;
        dragDepth.current += 1;
        setIsDragging(true);
      },
      onDragOver: (event) => {
        event.preventDefault();
      },
      onDragLeave: (event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
          setIsDragging(false);
        }
      },
      onDrop: (event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        if (disabled) return;
        if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
          addFiles(event.dataTransfer.files);
        }
      },
    }),
    [addFiles, disabled],
  );

  const hasCountError = useMemo(() => {
    if (minFiles !== undefined && files.length < minFiles) return true;
    if (maxFiles !== undefined && files.length > maxFiles) return true;
    return false;
  }, [files.length, maxFiles, minFiles]);

  return {
    files,
    isDragging,
    errors,
    hasCountError,
    addFiles,
    removeFile,
    clearFiles,
    clearErrors,
    openFileDialog,
    getInputProps,
    dragHandlers,
    disabled,
  };
};
