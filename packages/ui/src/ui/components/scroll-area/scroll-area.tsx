'use client';

import type { ComponentPropsWithoutRef, Ref } from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '../../../lib/cn';
import { scrollbarClass, scrollbarThumbClass, viewportClass } from './scroll-area.styles';
import type { ScrollAreaOrientation } from './scroll-area.styles';

export type { ScrollAreaOrientation } from './scroll-area.styles';

/** Props for {@link ScrollBar}. Extends every Radix `ScrollArea.Scrollbar` prop. */
export interface ScrollBarProps extends ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.ScrollAreaScrollbar
> {
  /**
   * Axis this scrollbar controls.
   *
   * @defaultValue `'vertical'`
   */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * A single themed scrollbar and its draggable thumb. {@link ScrollArea} renders these
 * for you based on its `orientation`; reach for this directly only when composing the
 * underlying `@radix-ui/react-scroll-area` parts by hand.
 */
export const ScrollBar = ({ orientation = 'vertical', className, ...props }: ScrollBarProps) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    orientation={orientation}
    className={cn(scrollbarClass({ orientation }), className)}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className={scrollbarThumbClass} />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
);

/**
 * Props for {@link ScrollArea}. Extends every Radix `ScrollArea.Root` prop (so `type`,
 * `scrollHideDelay`, `dir`, and `asChild` work as documented), plus the visual and
 * accessibility props below. `aria-label` / `aria-labelledby` are applied to the
 * scrollable viewport (not the root) so assistive tech announces the right element.
 */
export interface ScrollAreaProps extends ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /**
   * Which scrollbar(s) to render. `both` also renders the corner where they meet.
   *
   * @defaultValue `'vertical'`
   */
  orientation?: ScrollAreaOrientation;

  /**
   * Visually hide the scrollbar(s) while keeping the content scrollable (wheel, touch,
   * and keyboard still work). Useful for carousels / snap rails where the bar is noise.
   * The bar stays mounted under the hood — Radix only makes an axis scrollable while its
   * scrollbar is present — so this hides it with `display:none` rather than removing it.
   *
   * @defaultValue `false`
   */
  hideScrollbar?: boolean;

  /**
   * Ref to the scrollable viewport node — the element that actually overflows. Use it
   * to read or drive scroll position (e.g. scroll a chat log to the bottom).
   */
  viewportRef?: Ref<HTMLDivElement>;

  /** Extra classes for the viewport (the root takes `className`). */
  viewportClassName?: string;
}

/**
 * Cross-platform scroll container with a themed overlay scrollbar, backed by
 * `@radix-ui/react-scroll-area`. It hides the inconsistent native scrollbar and renders
 * a brand-styled one while preserving native (momentum) scrolling — including touch.
 *
 * The viewport is keyboard-focusable (`tabIndex=0`) so it can be scrolled with the arrow
 * keys; pass `aria-label` / `aria-labelledby` to expose it as a named `region`.
 *
 * **You must bound the size.** ScrollArea grows with its content unless you constrain
 * it — give it a height (and/or width for horizontal), e.g. `className="h-72"`.
 *
 * @example
 * ```tsx
 * <ScrollArea className="h-72 w-full rounded-(--ui-radius-md) border" aria-label="Release notes">
 *   <article className="p-4">{longContent}</article>
 * </ScrollArea>
 * ```
 *
 * @example Horizontal, with a ref to drive scroll position
 * ```tsx
 * const viewportRef = useRef<HTMLDivElement>(null);
 * <ScrollArea orientation="horizontal" className="w-96" viewportRef={viewportRef}>
 *   <div className="flex gap-2">{tags}</div>
 * </ScrollArea>
 * ```
 */
export const ScrollArea = ({
  orientation = 'vertical',
  hideScrollbar = false,
  type = 'scroll',
  viewportRef,
  viewportClassName,
  className,
  children,
  role,
  tabIndex,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}: ScrollAreaProps) => {
  const labelled = ariaLabel != null || ariaLabelledby != null;
  // `display:none` keeps the bar mounted (so the axis stays scrollable) but invisible.
  const barClassName = hideScrollbar ? 'hidden' : undefined;
  return (
    <ScrollAreaPrimitive.Root type={type} className={cn('relative', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        tabIndex={tabIndex ?? 0}
        role={role ?? (labelled ? 'region' : undefined)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cn(viewportClass, viewportClassName)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {(orientation === 'vertical' || orientation === 'both') && (
        <ScrollBar orientation="vertical" className={barClassName} />
      )}
      {(orientation === 'horizontal' || orientation === 'both') && (
        <ScrollBar orientation="horizontal" className={barClassName} />
      )}
      {orientation === 'both' && !hideScrollbar && <ScrollAreaPrimitive.Corner />}
    </ScrollAreaPrimitive.Root>
  );
};
