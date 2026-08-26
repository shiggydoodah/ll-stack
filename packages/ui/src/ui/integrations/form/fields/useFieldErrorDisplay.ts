'use client';

import { useSelector } from '@tanstack/react-form';

import { useTanStackFieldContext } from '../createAppForm';
import { firstFieldErrorMessage } from './fieldError';

export interface FieldErrorDisplayOptions {
  /**
   * Defer error display until the user has finished with the control (or a
   * submit was attempted) instead of flagging errors while they type.
   *
   * @defaultValue `false`
   */
  validateOnBlur?: boolean;
  /**
   * Which interaction ends the `validateOnBlur` grace period. `'blur'` (the
   * default) waits for the control to lose focus. `'interaction'` counts any
   * engagement (change or blur) — for controls where blur is awkward or
   * meaningless (popover comboboxes, file pickers), waiting for a blur would
   * hide errors indefinitely.
   *
   * @defaultValue `'blur'`
   */
  revealOn?: 'blur' | 'interaction';
}

export interface FieldErrorDisplay {
  /** Whether validation results may be surfaced at all right now. */
  show: boolean;
  /** `show` gated: the field currently has errors the user should see. */
  invalid: boolean;
  /** First visible error message, or `undefined` while errors are deferred. */
  errorMessage: string | undefined;
}

/**
 * Shared error-display policy for every form-bound field wrapper: errors are
 * revealed after the user's first blur/interaction with the control or after
 * any submit attempt, whichever comes first.
 *
 * The interaction flags are read from TanStack field meta (`isBlurred` /
 * `isTouched`) rather than local component state so that `form.reset()` — which
 * resets field meta and `submissionAttempts` — also re-arms the deferral. A
 * local `useState` flag would survive the reset and leak errors on the next
 * keystroke.
 */
export const useFieldErrorDisplay = ({
  validateOnBlur = false,
  revealOn = 'blur',
}: FieldErrorDisplayOptions = {}): FieldErrorDisplay => {
  const field = useTanStackFieldContext<unknown>();
  const submissionAttempts = useSelector(field.form.store, (s) => s.submissionAttempts);

  const meta = field.state.meta;
  const hasRevealed = revealOn === 'blur' ? meta.isBlurred : meta.isTouched;
  const show = !validateOnBlur || hasRevealed || submissionAttempts > 0;
  const invalid = show && meta.errors.length > 0;
  const errorMessage = show ? firstFieldErrorMessage(meta.errors) : undefined;

  return { errorMessage, invalid, show };
};
