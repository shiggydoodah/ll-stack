import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { createElement, type ReactElement, type ReactNode } from 'react';
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
  /** Bind a toast to a promise's lifecycle (loading → success/error). */
  promise: toast.promise,
  /** Dismiss a toast by id, or all toasts when called with no id. */
  dismiss: toast.dismiss,
};

export type Notify = typeof notify;
