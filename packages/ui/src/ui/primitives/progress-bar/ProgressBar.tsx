import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '../../../lib/cn';
import {
  progressBarFillBaseClass,
  progressBarFillDeterminateClass,
  progressBarFillToneClasses,
  progressBarIndeterminateClass,
  progressBarSizeClasses,
  progressBarTrackClass,
} from './progress-bar.styles';
import type { ProgressBarSize, ProgressBarTone } from './progress-bar.styles';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Props for {@link ProgressBar}.
 *
 * Includes every standard React `div` attribute except `color`, plus typed
 * progress, tone, and size controls. `className` lands on the outer wrapper;
 * everything else (`aria-*`, `data-*`, `id`, `ref`) lands on the
 * `role="progressbar"` track element so assistive tech reads it there.
 */
export interface ProgressBarProps extends Omit<ComponentPropsWithoutRef<'div'>, 'color'> {
  /**
   * Current progress, between `0` and {@link ProgressBarProps.max}. Ignored when
   * `indeterminate`.
   *
   * @defaultValue `0`
   */
  value?: number;
  /**
   * Upper bound for `value`.
   *
   * @defaultValue `100`
   */
  max?: number;
  /**
   * Brand colour applied to the fill.
   *
   * @defaultValue `'red'`
   */
  tone?: ProgressBarTone;
  /**
   * Track and fill height.
   *
   * @defaultValue `'md'`
   */
  size?: ProgressBarSize;
  /**
   * Animated unknown-progress state. Drops `value` semantics and omits
   * `aria-valuenow` so assistive tech announces it as busy/indeterminate.
   *
   * @defaultValue `false`
   */
  indeterminate?: boolean;
  /** Optional caption rendered above the track, on the left. */
  label?: ReactNode;
  /**
   * Render the rounded-(--ui-radius-sm) percentage (e.g. `42%`) on the right of the header row.
   * Has no effect while `indeterminate`.
   *
   * @defaultValue `false`
   */
  showValue?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Progress indicator for tasks with known (`value`) or unknown (`indeterminate`)
 * completion. Reuses the shared `UiTone` palette and exposes an optional caption
 * and percentage.
 *
 * @example
 * ```tsx
 * <ProgressBar value={64} showValue label="Uploading…" />
 * <ProgressBar indeterminate tone="blue" />
 * ```
 */
export const ProgressBar = ({
  value = 0,
  max = 100,
  tone = 'red',
  size = 'md',
  indeterminate = false,
  label,
  showValue = false,
  className,
  'aria-label': ariaLabel,
  ...props
}: ProgressBarProps) => {
  const labelId = useId();
  const hasLabel = label != null && label !== '';

  const clampedValue = clamp(value, 0, max);
  const pct = !indeterminate && max > 0 ? (clampedValue / max) * 100 : 0;
  const rounded = Math.round(pct);

  const showPercent = showValue && !indeterminate;
  const showHeader = hasLabel || showPercent;

  return (
    <div className={cn('w-full', className)}>
      {showHeader && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {hasLabel ? (
            <span id={labelId} className="text-2xs font-mono text-(--ui-text-subtle)">
              {label}
            </span>
          ) : (
            <span />
          )}
          {showPercent && (
            <span className="text-2xs font-mono text-(--ui-text-subtle) tabular-nums">
              {rounded}%
            </span>
          )}
        </div>
      )}
      {/* Consumer aria-*, data-*, and ref land here, on the element carrying
          the progressbar role, so assistive tech associates them correctly. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : Math.round(clampedValue)}
        aria-labelledby={hasLabel ? labelId : undefined}
        aria-label={hasLabel ? undefined : ariaLabel}
        className={cn(progressBarTrackClass, progressBarSizeClasses[size])}
        {...props}
      >
        <div
          className={cn(
            progressBarFillBaseClass,
            progressBarFillToneClasses[tone],
            indeterminate ? progressBarIndeterminateClass : progressBarFillDeterminateClass,
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
