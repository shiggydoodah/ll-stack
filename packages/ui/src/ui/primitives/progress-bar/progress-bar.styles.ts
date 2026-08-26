import type { UiTone } from '../../../types/ui.types';

export type ProgressBarTone = UiTone;
export type ProgressBarSize = 'xs' | 'sm' | 'md' | 'lg';

/** Muted, full-width rounded track that clips the fill at its corners. */
export const progressBarTrackClass =
  'ui-progress relative w-full overflow-hidden rounded-full bg-(--ui-foreground)/10';

export const progressBarSizeClasses = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
} satisfies Record<ProgressBarSize, string>;

/** Shared fill base — height + rounding, common to both modes. */
export const progressBarFillBaseClass = 'h-full rounded-full';

/** Determinate fill animates its width smoothly as `value` changes. */
export const progressBarFillDeterminateClass =
  'transition-[width] duration-(--ui-motion-slow) ease-(--ui-ease)';

/** Indeterminate fill is a fixed-width segment that slides across the track. */
export const progressBarIndeterminateClass = 'w-2/5 animate-progress-indeterminate';

/** Solid tone applied to the fill — mirrors the `solid` row of {@link badgeToneClasses}. */
export const progressBarFillToneClasses = {
  neutral: 'bg-(--ui-foreground)',
  red: 'bg-tone-red',
  green: 'bg-tone-green',
  amber: 'bg-tone-amber',
  blue: 'bg-tone-blue',
  purple: 'bg-tone-purple',
  magenta: 'bg-tone-magenta',
} satisfies Record<ProgressBarTone, string>;
