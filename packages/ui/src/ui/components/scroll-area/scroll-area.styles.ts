import { cva } from 'class-variance-authority';

/** Which scrollbar(s) a {@link ScrollArea} renders. */
export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

/**
 * The scrollbar track. `touch-none` is deliberate: the bar never captures touch, so
 * native (momentum) scrolling stays in charge on mobile while the bar is just an
 * affordance. The transparent border reserves a hairline gutter against the viewport
 * edge so the thumb doesn't sit flush with the content.
 */
export const scrollbarClass = cva('flex touch-none select-none p-px transition-colors', {
  variants: {
    orientation: {
      vertical: 'h-full w-2.5 border-l border-l-transparent',
      horizontal: 'h-2.5 flex-col border-t border-t-transparent',
    },
  },
  defaultVariants: { orientation: 'vertical' },
});

/** The draggable thumb. Sized by Radix; we only style its look and hover feedback. */
export const scrollbarThumbClass =
  'relative flex-1 rounded-full bg-(--ui-border-strong) transition-colors hover:bg-(--ui-border-hover)';

/**
 * The scrollable viewport (the real overflow element). `rounded-[inherit]` keeps the
 * clipped content inside any radius set on the root; the focus ring shows when a
 * keyboard user tabs to the region to scroll it with the arrow keys.
 */
export const viewportClass =
  'size-full rounded-[inherit] outline-none transition-[color,box-shadow] ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--ui-focus-ring)';
