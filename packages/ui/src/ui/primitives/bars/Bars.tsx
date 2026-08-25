import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** One bar of a {@link Bars} series. */
export interface BarsDatum {
  /** Bar magnitude. Expected `>= 0`; negative values render as an empty bar. */
  value: number;
  /** Native per-bar tooltip (e.g. `"2026-07-01: 4"`). */
  title?: string;
}

/**
 * Props for {@link Bars}.
 *
 * Includes every standard React `div` attribute, with the accessible name
 * (`aria-label`) made required — the chart is a single `role="img"` graphic.
 */
export interface BarsProps extends ComponentPropsWithoutRef<'div'> {
  /** The series to plot, one bar per datum, in order. */
  data: readonly BarsDatum[];
  /**
   * Scale ceiling. Defaults to the largest datum value (minimum `1`, so an
   * all-zero or empty series still renders flat instead of dividing by zero).
   */
  max?: number;
  /** Muted axis label rendered under the bars, on the left. */
  labelStart?: string;
  /** Muted axis label rendered under the bars, on the right. */
  labelEnd?: string;
  /** REQUIRED — the chart's accessible name announced to assistive tech. */
  'aria-label': string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Minimal vertical bar-series chart. Takes plain numbers and strings — no axes,
 * gridlines, or tooltips beyond the native per-bar `title` — and is server-safe
 * (no hooks). The whole chart is one graphic to assistive tech: the container is
 * `role="img"` with a required `aria-label`; the bars are `aria-hidden`.
 *
 * The per-bar inline `height` is the sanctioned data-driven dynamic style
 * (the `ProgressBar` fill-width precedent) — legitimate inside `@ll-ui/react` only.
 *
 * @example
 * ```tsx
 * <Bars
 *   aria-label="Signups per day, 2026-06-01 to 2026-06-30"
 *   data={days.map((d) => ({ value: d.count, title: `${d.date}: ${d.count}` }))}
 *   labelStart="2026-06-01"
 *   labelEnd="2026-06-30"
 * />
 * ```
 */
export const Bars = ({ data, max, labelStart, labelEnd, className, ref, ...props }: BarsProps) => {
  const maxOfData = data.reduce((top, datum) => Math.max(top, datum.value), 0);
  const effectiveMax = Math.max(max ?? maxOfData, 1);
  const hasAxis = labelStart != null || labelEnd != null;

  return (
    <div
      ref={ref}
      role="img"
      className={cn('flex h-24 w-full flex-col gap-1', className)}
      {...props}
    >
      <div className="flex min-h-0 flex-1 items-end gap-px">
        {data.map((datum, index) => (
          <div
            key={index}
            aria-hidden="true"
            title={datum.title}
            className="min-w-0 flex-1 rounded-t-(--ui-radius-sm) bg-(--ui-background-muted) transition-colors hover:bg-(--ui-text-subtle)"
            style={{ height: `${clamp((datum.value / effectiveMax) * 100, 0, 100)}%` }}
          />
        ))}
      </div>
      {hasAxis && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-mono text-(--ui-text-muted)">{labelStart}</span>
          <span className="text-2xs font-mono text-(--ui-text-muted)">{labelEnd}</span>
        </div>
      )}
    </div>
  );
};
