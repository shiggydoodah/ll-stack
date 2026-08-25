import type { UiTone } from '../../../types/ui.types';

export type SliderTone = UiTone;
export type SliderSize = 'sm' | 'md' | 'lg';

/**
 * Root container. `touch-none` lets the thumb be dragged on touch devices
 * without the page scrolling. Orientation + disabled styling keys off the
 * `data-orientation` / `data-disabled` attributes Radix sets on the root.
 */
export const sliderRootClass =
  'relative flex touch-none select-none items-center ' +
  'data-[orientation=horizontal]:w-full ' +
  'data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:flex-col ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

/** Muted, rounded track that clips the range fill at its corners. */
export const sliderTrackClass =
  'relative grow overflow-hidden rounded-full bg-(--ui-foreground)/10';

/** Track thickness — height when horizontal, width when vertical. */
export const sliderTrackThicknessClass = {
  sm: 'data-[orientation=horizontal]:h-1 data-[orientation=vertical]:w-1',
  md: 'data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5',
  lg: 'data-[orientation=horizontal]:h-2.5 data-[orientation=vertical]:w-2.5',
} satisfies Record<SliderSize, string>;

/** Filled portion of the track (between thumbs, or from the start to the thumb). */
export const sliderRangeBaseClass =
  'absolute rounded-full data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full';

/** Range fill colour — mirrors the solid row of the shared tone palette. */
export const sliderRangeToneClasses = {
  neutral: 'bg-(--ui-foreground)',
  red: 'bg-tone-red',
  green: 'bg-tone-green',
  amber: 'bg-tone-amber',
  blue: 'bg-tone-blue',
  purple: 'bg-tone-purple',
  magenta: 'bg-tone-magenta',
} satisfies Record<SliderTone, string>;

/** Draggable handle. Sized for a comfortable touch target at md/lg. */
export const sliderThumbBaseClass =
  'block shrink-0 cursor-grab rounded-full border-2 bg-(--ui-background) shadow-(--ui-shadow-sm) transition-[box-shadow,border-color] ' +
  'hover:bg-(--ui-background) active:cursor-grabbing ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ui-focus-ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--ui-background) ' +
  'data-[disabled]:cursor-not-allowed';

/** Thumb diameter per size token (16 / 20 / 24px). */
export const sliderThumbSizeClass = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} satisfies Record<SliderSize, string>;

/** Thumb border colour, matched to the range tone. */
export const sliderThumbToneClasses = {
  neutral: 'border-(--ui-foreground)',
  red: 'border-tone-red',
  green: 'border-tone-green',
  amber: 'border-tone-amber',
  blue: 'border-tone-blue',
  purple: 'border-tone-purple',
  magenta: 'border-tone-magenta',
} satisfies Record<SliderTone, string>;

/** Row of option/tick labels rendered beneath a horizontal track. */
export const sliderMarksRowClass = 'mt-2 flex w-full justify-between gap-1';

/** A single option/tick label. */
export const sliderMarkLabelClass = 'text-2xs text-(--ui-text-subtle)';

/** Numeric value readout shown above the track when `showValue` is set. */
export const sliderValueReadoutClass =
  'mb-1.5 text-2xs font-mono text-(--ui-text-subtle) tabular-nums';
