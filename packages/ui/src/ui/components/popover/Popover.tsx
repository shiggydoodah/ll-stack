import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';

// ── Root / Trigger / Anchor / Close ─────────────────────────────────────────────

/**
 * Root of a popover. Controls the open state and wires the trigger to the content.
 *
 * Use `open`/`onOpenChange` for controlled usage, or `defaultOpen` for uncontrolled.
 * `modal` toggles whether interaction outside the content is blocked while open.
 *
 * @example
 * ```tsx
 * <Popover>
 *   <PopoverTrigger asChild>
 *     <Button>Open</Button>
 *   </PopoverTrigger>
 *   <PopoverContent side="bottom" align="start">
 *     …content…
 *   </PopoverContent>
 * </Popover>
 * ```
 */
export const Popover = PopoverPrimitive.Root;
export type PopoverProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>;

/**
 * The control that toggles the popover. Pass `asChild` to render your own element
 * (e.g. a {@link Button}) as the trigger while keeping the popover wiring.
 */
export const PopoverTrigger = PopoverPrimitive.Trigger;
export type PopoverTriggerProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>;

/**
 * Optional positioning anchor. Render this around (or pointing at) a different element
 * to position the content relative to it instead of the trigger.
 */
export const PopoverAnchor = PopoverPrimitive.Anchor;
export type PopoverAnchorProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>;

/**
 * Dismisses the popover when activated. Place inside {@link PopoverContent}, e.g. on a
 * menu item or a form's submit button. Pass `asChild` to use your own element.
 */
export const PopoverClose = PopoverPrimitive.Close;
export type PopoverCloseProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>;

// ── Arrow ───────────────────────────────────────────────────────────────────────

export interface PopoverArrowProps extends ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow> {
  ref?: Ref<SVGSVGElement>;
}

/**
 * A small triangle that points from the content toward the trigger. Filled with the
 * popover surface colour so it reads as an extension of the panel. Usually rendered via
 * the `showArrow` prop on {@link PopoverContent} rather than directly.
 */
export const PopoverArrow = ({ className, ref, ...props }: PopoverArrowProps) => (
  <PopoverPrimitive.Arrow
    ref={ref}
    className={cn('fill-(--ui-background)', className)}
    {...props}
  />
);

// ── Content ─────────────────────────────────────────────────────────────────────

export interface PopoverContentProps extends ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
> {
  /**
   * Render a small arrow pointing at the trigger.
   *
   * @defaultValue `false`
   */
  showArrow?: boolean;
  /**
   * DOM node the content is portalled into. Defaults to `document.body`. Pass a node to
   * scope the portal (e.g. inside a Dialog or a CSS containment boundary).
   */
  container?: HTMLElement | null;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The floating surface of a popover. Renders in a portal and owns placement, the styled
 * surface (border, background, shadow, radius), and the open/close animations.
 *
 * `side` (`top` | `right` | `bottom` | `left`) and `align` (`start` | `center` | `end`)
 * control placement; Radix flips/shifts to stay in view unless `avoidCollisions={false}`.
 * Holds any content — text, images, menus, forms — and the default `w-72 p-4` surface can
 * be overridden via `className` (e.g. `className="w-56 p-1"` for a menu).
 *
 * @example
 * ```tsx
 * <PopoverContent side="right" align="start" showArrow>
 *   <p>Account settings</p>
 * </PopoverContent>
 * ```
 */
export const PopoverContent = ({
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  showArrow = false,
  container,
  children,
  ref,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive.Portal container={container ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      side={side}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'ui-popover z-50 w-72 max-w-[calc(100vw-1rem)] rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border-strong) bg-(--ui-background) p-4 text-(--ui-text-body) shadow-(--ui-shadow-md) outline-none',
        'origin-(--radix-popover-content-transform-origin)',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    >
      {children}
      {showArrow ? <PopoverArrow /> : null}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);
