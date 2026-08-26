import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { ExternalToast } from 'sonner';

const SECOND_MS = 1000;

/**
 * Options for a toast. Mirrors Sonner's per-toast options (`description`,
 * `action`, `icon`, `closeButton`, `onDismiss`, …) but `duration` is expressed
 * in **seconds** for ergonomics.
 */
export interface NotifyOptions extends Omit<ExternalToast, 'duration'> {
  /**
   * Seconds before the toast auto-dismisses. Pass `Infinity` for a toast that
   * stays until manually dismissed. Omit to use the Toaster's default duration.
   */
  duration?: number;
}

/**
 * Converts a duration in seconds into the milliseconds Sonner expects.
 * `Infinity` is passed through so the toast never auto-dismisses; `undefined`
 * falls back to the Toaster default.
 */
export const toToastDuration = (seconds?: number): number | undefined => {
  if (seconds === undefined) return undefined;
  if (seconds === Infinity) return Infinity;
  return seconds * SECOND_MS;
};

const toSonnerOptions = ({ duration, ...rest }: NotifyOptions = {}): ExternalToast => ({
  ...rest,
  duration: toToastDuration(duration),
});

const toneIcon = {
  success: createElement(CircleCheck, { size: 18, className: 'text-tone-green' }),
  error: createElement(CircleAlert, { size: 18, className: 'text-tone-red' }),
  info: createElement(Info, { size: 18, className: 'text-tone-blue' }),
  warning: createElement(TriangleAlert, { size: 18, className: 'text-tone-amber' }),
};

const withIcon = (icon: ReactNode, options?: NotifyOptions): ExternalToast => ({
  icon,
  ...toSonnerOptions(options),
});

// ── notify.promise options ────────────────────────────────────────────────────

/**
 * Extended per-state result for {@link notify.promise}: the toast message plus
 * per-state options. Like every other notify helper, `duration` is in
 * **seconds** (Sonner's promise API takes it in milliseconds).
 */
export interface NotifyPromiseStateOptions extends NotifyOptions {
  message: ReactNode;
}

type NotifyPromiseStateResult<Data> =
  | ReactNode
  | NotifyPromiseStateOptions
  | ((
      data: Data,
    ) => ReactNode | NotifyPromiseStateOptions | Promise<ReactNode | NotifyPromiseStateOptions>);

/**
 * Options for {@link notify.promise}. Mirrors Sonner's `PromiseData`, but every
 * `duration` — top-level or inside a `success`/`error` state result — is
 * expressed in **seconds** like the rest of the notify helpers.
 */
export interface NotifyPromiseOptions<Data = unknown> extends Omit<NotifyOptions, 'description'> {
  loading?: string | ReactNode;
  success?: NotifyPromiseStateResult<Data>;
  error?: NotifyPromiseStateResult<unknown>;
  description?: string | ReactNode | ((data: unknown) => ReactNode | Promise<ReactNode>);
  finally?: () => void | Promise<void>;
}

// Sonner treats any non-element object result as an extended `{ message, ...options }`
// — mirror its exact check so we convert precisely what Sonner will read.
const isExtendedStateResult = (result: unknown): result is NotifyPromiseStateOptions =>
  typeof result === 'object' && result !== null && !isValidElement(result);

const toSonnerStateResult = (result: ReactNode | NotifyPromiseStateOptions) =>
  isExtendedStateResult(result)
    ? { ...result, duration: toToastDuration(result.duration) }
    : result;

/**
 * Converts a per-state `success`/`error` entry, unwrapping the function (and
 * promise-returning function) forms so a `duration` inside their results is
 * converted too.
 */
const toSonnerPromiseState = <Data>(state: NotifyPromiseStateResult<Data> | undefined) => {
  if (state === undefined) return undefined;
  if (typeof state === 'function') {
    return (data: Data) => {
      const result = state(data);
      return result instanceof Promise
        ? result.then(toSonnerStateResult)
        : toSonnerStateResult(result);
    };
  }
  return toSonnerStateResult(state);
};

/**
 * Imperative, typed API for firing toasts. Requires a {@link Toaster} mounted in
 * the tree (handled by the `NotificationProvider`).
 *
 * Each helper accepts {@link NotifyOptions}; pass `duration` (seconds) to
 * auto-dismiss after _n_ seconds, or `duration: Infinity` for manual-only.
 *
 * @example
 * ```ts
 * notify.success('Profile updated');
 * notify.error('Update failed', { description: 'Please try again.' });
 * notify.info('New message from Alex', { duration: Infinity });
 * ```
 */
export const notify = {
  /** Neutral toast with no semantic icon. */
  message: (message: ReactNode, options?: NotifyOptions) =>
    toast(message, toSonnerOptions(options)),
  /** Success toast (green check). */
  success: (message: ReactNode, options?: NotifyOptions) =>
    toast.success(message, withIcon(toneIcon.success, options)),
  /** Error toast (red alert) — e.g. a failed update. */
  error: (message: ReactNode, options?: NotifyOptions) =>
    toast.error(message, withIcon(toneIcon.error, options)),
  /** Informational toast (blue) — e.g. a new DM message. */
  info: (message: ReactNode, options?: NotifyOptions) =>
    toast.info(message, withIcon(toneIcon.info, options)),
  /** Warning toast (amber). */
  warning: (message: ReactNode, options?: NotifyOptions) =>
    toast.warning(message, withIcon(toneIcon.warning, options)),
  /** Loading toast; resolve/replace it with the returned id. */
  loading: (message: ReactNode, options?: NotifyOptions) =>
    toast.loading(message, toSonnerOptions(options)),
  /** Fully custom toast rendered from your own element. */
  custom: (render: (id: number | string) => ReactElement, options?: NotifyOptions) =>
    toast.custom(render, toSonnerOptions(options)),
  /**
   * Bind a toast to a promise's lifecycle (loading → success/error). Durations
   * — top-level and inside `success`/`error` state results — are in seconds,
   * matching the other helpers; they are converted before reaching Sonner.
   */
  promise: <Data>(
    promise: Promise<Data> | (() => Promise<Data>),
    options?: NotifyPromiseOptions<Data>,
  ) => {
    if (options === undefined) return toast.promise(promise);
    const { duration, success, error, ...rest } = options;
    // The cast is unavoidable: Sonner's PromiseData types "plain message fn"
    // and "extended result fn" as two separate union arms, and the converter
    // returns one function covering both — TS cannot split it back across the
    // arms. The runtime shapes are exactly what Sonner reads.
    const data = {
      ...rest,
      duration: toToastDuration(duration),
      success: toSonnerPromiseState(success),
      error: toSonnerPromiseState(error),
    } as Parameters<typeof toast.promise<Data>>[1];
    return toast.promise(promise, data);
  },
  /** Dismiss a toast by id, or all toasts when called with no id. */
  dismiss: toast.dismiss,
};

export type Notify = typeof notify;
