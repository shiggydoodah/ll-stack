import type { ComponentPropsWithoutRef, Ref } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '../../../lib/cn';

// ── Root / Trigger / Portal / Close ─────────────────────────────────────────────

export type DrawerProps = ComponentPropsWithoutRef<typeof DrawerPrimitive.Root> & {
  /**
   * Allow a pointer drag that starts anywhere on the panel to move (and, past the
   * close threshold, dismiss) the drawer — vaul's default swipe gesture.
   *
   * Defaults to `false`, which restricts the drag gesture to the drag handle only, so
   * a drag that begins on an interactive control inside the drawer — a `Slider` thumb,
   * a reorderable row, a map — no longer drags the whole panel with it. Set it to
   * `true` for drawers where swiping the surface is the intended dismiss gesture
   * (e.g. a bottom sheet).
   *
   * Wired to vaul's `handleOnly` (`handleOnly = !dragToDismiss`); pass `handleOnly`
   * explicitly to override. Independent of `dismissible`, which governs whether the
   * overlay / Escape / a completed drag can close the drawer at all.
   *
   * @defaultValue `false`
   */
  dragToDismiss?: boolean;
};

/**
 * Root of a drawer — a panel that slides in from an edge of the screen. Controlled via
 * `open`/`onOpenChange`, or uncontrolled via `defaultOpen`. `direction`
 * (`'top' | 'right' | 'bottom' | 'left'`) sets the edge it slides from.
 *
 * Built on [vaul](https://github.com/emilkowalski/vaul), which sits on top of
 * `@radix-ui/react-dialog` — so focus trap, scroll lock, Escape-to-close, overlay
 * click-to-dismiss and the `role="dialog"` ARIA wiring come for free, plus optional
 * `snapPoints`. Toggle `modal` to control whether the page behind is inert, and
 * `dismissible={false}` to require an explicit close.
 *
 * Swipe-to-dismiss is opt-in: by default a pointer drag only moves the panel from its
 * drag handle, so interactive controls inside the drawer stay draggable in place. Set
 * {@link DrawerProps.dragToDismiss} to let a drag anywhere on the surface dismiss it.
 *
 * Styled entirely with the shared `--ui-*` tokens, so it is app-agnostic.
 *
 * @example
 * ```tsx
 * <Drawer direction="right">
 *   <DrawerTrigger asChild>
 *     <Button>Open</Button>
 *   </DrawerTrigger>
 *   <DrawerContent>
 *     <DrawerHeader>
 *       <DrawerTitle>Edit profile</DrawerTitle>
 *       <DrawerDescription>Make changes and save.</DrawerDescription>
 *     </DrawerHeader>
 *     <DrawerFooter>
 *       <Button>Save</Button>
 *       <DrawerClose asChild>
 *         <Button variant="outline">Cancel</Button>
 *       </DrawerClose>
 *     </DrawerFooter>
 *   </DrawerContent>
 * </Drawer>
 * ```
 */
export const Drawer = ({ dragToDismiss = false, handleOnly, ...props }: DrawerProps) => (
  <DrawerPrimitive.Root {...props} handleOnly={handleOnly ?? !dragToDismiss} />
);

/**
 * The control that opens the drawer. Pass `asChild` to render your own element (e.g. a
 * {@link Button}) as the trigger while keeping the drawer wiring.
 */
export const DrawerTrigger = DrawerPrimitive.Trigger;
export type DrawerTriggerProps = ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger>;

/**
 * Portals the overlay + content out to `document.body` (or a `container`). Rendered for
 * you by {@link DrawerContent}; only needed directly for fully custom compositions.
 */
export const DrawerPortal = DrawerPrimitive.Portal;
export type DrawerPortalProps = ComponentPropsWithoutRef<typeof DrawerPrimitive.Portal>;

/**
 * Dismisses the drawer when activated. Place inside {@link DrawerContent} (e.g. a Cancel
 * button in the footer). Pass `asChild` to use your own element.
 */
export const DrawerClose = DrawerPrimitive.Close;
export type DrawerCloseProps = ComponentPropsWithoutRef<typeof DrawerPrimitive.Close>;

// ── Overlay ─────────────────────────────────────────────────────────────────────

export interface DrawerOverlayProps extends ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Overlay
> {
  ref?: Ref<HTMLDivElement>;
}

/**
 * The dimmed backdrop behind the panel. Rendered automatically by {@link DrawerContent},
 * so you rarely use this directly. vaul drives the fade itself (including the
 * drag-proportional opacity while the panel is being dragged), so no keyframe
 * animation classes belong here — layering tw-animate fades on top caused a
 * visible opacity jump on drag-release dismiss.
 */
export const DrawerOverlay = ({ className, ref, ...props }: DrawerOverlayProps) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-(--ui-overlay) backdrop-blur-sm', className)}
    {...props}
  />
);

// ── Content ─────────────────────────────────────────────────────────────────────

export interface DrawerContentProps extends ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Content
> {
  /**
   * Render the drag handle. It is only visible for the `bottom` direction (where dragging
   * is the primary gesture); set to `false` to omit it entirely.
   *
   * @defaultValue `true`
   */
  showHandle?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The sliding panel surface. Renders its own {@link DrawerOverlay} inside a portal, then
 * the styled content. Position, size, border and radius are driven off vaul's
 * `data-vaul-drawer-direction` attribute, so the one component serves all four edges
 * (full-width sheets for `top`/`bottom`, side panels capped at `sm:max-w-sm` for
 * `left`/`right`). vaul animates the slide and the overlay fade itself; we only style the
 * surfaces.
 *
 * Holds any content — wrap copy in {@link DrawerHeader}/{@link DrawerFooter} and pair a
 * {@link DrawerTitle} (required for an accessible label) with an optional
 * {@link DrawerDescription}. Override the default surface via `className`.
 *
 * On open, focus moves to the panel itself. Pass your own `onOpenAutoFocus` and call
 * `event.preventDefault()` in it to place focus somewhere specific instead.
 */
export const DrawerContent = ({
  className,
  children,
  showHandle = true,
  onOpenAutoFocus,
  ref,
  ...props
}: DrawerContentProps) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        // A caller that prevented the default is placing focus itself.
        if (event.defaultPrevented) return;
        // vaul cancels Radix's focus-on-open unless its own `autoFocus` flag is set,
        // which strands focus on the trigger — inside the subtree Radix has just
        // marked `aria-hidden`. Chrome then refuses to apply that aria-hidden, so the
        // whole page stays in the accessibility tree behind the modal and the dialog
        // is never announced. Focus the panel rather than its first tabbable child:
        // the FocusScope container carries `tabIndex={-1}`, so the trap and the
        // announcement both work without an input inside the drawer grabbing focus
        // and popping the mobile keyboard (vaul's reason for opting out at all).
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)?.focus();
      }}
      className={cn(
        'ui-drawer group/drawer-content fixed z-50 flex h-auto flex-col bg-(--ui-background) text-(--ui-text-body) focus:outline-none',
        // bottom
        'data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-(--ui-radius-lg) data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=bottom]:border-(--ui-border-strong)',
        // top
        'data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-(--ui-radius-lg) data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=top]:border-(--ui-border-strong)',
        // right
        'data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:border-(--ui-border-strong) data-[vaul-drawer-direction=right]:sm:max-w-sm',
        // left
        'data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:border-(--ui-border-strong) data-[vaul-drawer-direction=left]:sm:max-w-sm',
        className,
      )}
      {...props}
    >
      {showHandle ? (
        <div
          aria-hidden="true"
          className="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-(--ui-border-strong) group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
        />
      ) : null}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
);

// ── Header / Footer ─────────────────────────────────────────────────────────────

export type DrawerHeaderProps = ComponentPropsWithoutRef<'div'>;

/** Groups the title and description at the top of the panel. */
export const DrawerHeader = ({ className, ...props }: DrawerHeaderProps) => (
  <div className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
);

export type DrawerFooterProps = ComponentPropsWithoutRef<'div'>;

/** Groups actions at the bottom of the panel; pushed to the bottom edge via `mt-auto`. */
export const DrawerFooter = ({ className, ...props }: DrawerFooterProps) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
);

// ── Title / Description ─────────────────────────────────────────────────────────

export interface DrawerTitleProps extends ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> {
  ref?: Ref<HTMLHeadingElement>;
}

/**
 * The drawer's accessible heading — labels the dialog for screen readers. Always include
 * one; pass `className="sr-only"` if you don't want it shown visually.
 */
export const DrawerTitle = ({ className, ref, ...props }: DrawerTitleProps) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn('font-display text-lg font-black text-(--ui-foreground)', className)}
    {...props}
  />
);

export interface DrawerDescriptionProps extends ComponentPropsWithoutRef<
  typeof DrawerPrimitive.Description
> {
  ref?: Ref<HTMLParagraphElement>;
}

/** Optional supporting copy under the title, wired to the dialog via `aria-describedby`. */
export const DrawerDescription = ({ className, ref, ...props }: DrawerDescriptionProps) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm text-(--ui-text-muted)', className)}
    {...props}
  />
);
