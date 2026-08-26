import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, Ref } from 'react';

import { cn } from '../../../lib/cn';

// ── Animation ───────────────────────────────────────────────────────────────────

/** Entrance/exit animation for {@link DialogContent}. @see DialogContentProps.animation */
export type DialogAnimation = 'none' | 'fade' | 'scale' | 'float';

const ANIMATE_FADE =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0';

/** The backdrop only ever cross-fades; `none` opts out entirely. */
const dialogOverlayAnimationClass: Record<DialogAnimation, string> = {
  none: '',
  fade: ANIMATE_FADE,
  scale: ANIMATE_FADE,
  float: ANIMATE_FADE,
};

/**
 * Content animations. The panel is centred with Tailwind v4's `translate` *property*
 * (`-translate-x-1/2 -translate-y-1/2` → `translate: -50% -50%`), which composes with —
 * is never replaced by — the `transform` the tw-animate-css keyframes animate. Enter/exit
 * utilities must therefore contribute **only the delta**: adding `slide-*-1/2` "pins"
 * here doubles the −50% and flies the panel in from the corner.
 *
 * - `scale`: subtle zoom pop in place.
 * - `float`: starts 12px below centre and fully transparent, then drifts up into place
 *   (250ms ease-(--ui-ease)); exits with a quick fade back down (default 150ms).
 */
const dialogContentAnimationClass: Record<DialogAnimation, string> = {
  none: '',
  fade: ANIMATE_FADE,
  scale: ANIMATE_FADE + ' data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
  float:
    ANIMATE_FADE +
    ' data-[state=open]:animation-duration-(--ui-motion-fast) data-[state=open]:ease-(--ui-ease)' +
    ' data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:slide-out-to-bottom-3',
};

// ── Root / Trigger / Close ───────────────────────────────────────────────────────

/**
 * The control that opens the dialog. Pass `asChild` to render your own element
 * (e.g. a {@link Button}) as the trigger while keeping the dialog wiring.
 *
 * Optional — a dialog can also be opened by controlling `open` on {@link Dialog}.
 */
export const DialogTrigger = DialogPrimitive.Trigger;
export type DialogTriggerProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>;

/**
 * Dismisses the dialog when activated. Place inside {@link DialogContent} (e.g. on a
 * Cancel button). Pass `asChild` to use your own element.
 */
export const DialogClose = DialogPrimitive.Close;
export type DialogCloseProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Close>;

// ── Overlay ───────────────────────────────────────────────────────────────────────

export interface DialogOverlayProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Overlay
> {
  ref?: Ref<HTMLDivElement>;
}

/**
 * The dimmed, blurred backdrop behind the dialog. Rendered automatically by
 * {@link DialogContent}, so you rarely use this directly.
 */
export const DialogOverlay = ({ className, ref, ...props }: DialogOverlayProps) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-(--ui-overlay) backdrop-blur-sm', className)}
    {...props}
  />
);

// ── Content ─────────────────────────────────────────────────────────────────────

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Hide the default close (X) button. @defaultValue `false` */
  hideClose?: boolean;
  /** Entrance/exit animation for the overlay + panel. @defaultValue `'scale'` */
  animation?: DialogAnimation;
  /**
   * DOM node the dialog is portalled into. Defaults to `document.body`. Pass a node to
   * scope the portal (e.g. inside a CSS containment boundary).
   */
  container?: HTMLElement | null;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The centered surface of a dialog. Renders in a portal and bundles the
 * {@link DialogOverlay}, the styled panel (border, background, shadow, radius), focus
 * trap, scroll lock, and the default close (X) button.
 *
 * Always render a {@link DialogTitle} and {@link DialogDescription} inside (Radix logs a
 * console warning when the description is missing); add `className="sr-only"` to either if
 * it's visually redundant. The default `max-w-lg` panel can be widened/narrowed via
 * `className`.
 *
 * @example
 * ```tsx
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Crop photo</DialogTitle>
 *       <DialogDescription>Drag to reposition.</DialogDescription>
 *     </DialogHeader>
 *     …
 *   </DialogContent>
 * </Dialog>
 * ```
 */
export const DialogContent = ({
  className,
  hideClose = false,
  animation = 'scale',
  container,
  children,
  ref,
  ...props
}: DialogContentProps) => (
  <DialogPrimitive.Portal container={container ?? undefined}>
    <DialogOverlay className={dialogOverlayAnimationClass[animation]} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-5',
        'ui-dialog rounded-(--ui-radius-lg) border-(length:--ui-border-width) border-(--ui-border-strong) bg-(--ui-background) p-6 shadow-(--ui-shadow-md)',
        'focus:outline-none',
        dialogContentAnimationClass[animation],
        className,
      )}
      {...props}
    >
      {hideClose ? null : (
        // Rendered before children so it leads the tab order rather than trailing it.
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute top-4 right-4 flex size-8 shrink-0 items-center justify-center rounded-(--ui-radius-md) text-(--ui-text-subtle) transition-colors hover:bg-(--ui-foreground)/8 hover:text-(--ui-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-focus-ring)"
        >
          <X aria-hidden="true" size={18} />
        </DialogPrimitive.Close>
      )}
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

// ── Header / Title / Description / Footer ─────────────────────────────────────────

/**
 * Stacks a {@link DialogTitle} and {@link DialogDescription} at the top of the dialog.
 */
export const DialogHeader = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('flex flex-col gap-1', className)} {...props} />
);

export interface DialogTitleProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
  ref?: Ref<HTMLHeadingElement>;
}

/**
 * The dialog's accessible title. Required for an accessible dialog; Radix wires it to
 * `aria-labelledby` on the content.
 */
export const DialogTitle = ({ className, ref, ...props }: DialogTitleProps) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-lg font-black', className)}
    {...props}
  />
);

export interface DialogDescriptionProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Description
> {
  ref?: Ref<HTMLParagraphElement>;
}

/**
 * Supporting copy under the title, wired to `aria-describedby`. Use `className="sr-only"`
 * when there's no visible description but you still want to satisfy Radix's a11y warning.
 */
export const DialogDescription = ({ className, ref, ...props }: DialogDescriptionProps) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-(--ui-text-muted)', className)}
    {...props}
  />
);

/**
 * Right-aligned row for the dialog's action buttons (e.g. Cancel / Confirm).
 */
export const DialogFooter = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
  <div className={cn('flex justify-end gap-2', className)} {...props} />
);

// ── Root ──────────────────────────────────────────────────────────────────────────

export type DialogProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;

const DialogRoot = (props: DialogProps) => <DialogPrimitive.Root {...props} />;

/**
 * Accessible modal dialog built on `@radix-ui/react-dialog` (focus trap, Escape, scroll
 * lock, overlay click-to-close for free). Styled with the shared UI tokens to match the
 * popover/card surfaces.
 *
 * `Dialog` is the open-state provider — control it via `open`/`onOpenChange` (or
 * `defaultOpen` for uncontrolled). Compose the modal from the sub-components, available
 * both as named exports and as dot-notation statics (`Dialog.Content`, `Dialog.Title`, …).
 *
 * @example
 * ```tsx
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <Dialog.Content>
 *     <Dialog.Header>
 *       <Dialog.Title>Delete account</Dialog.Title>
 *       <Dialog.Description>This cannot be undone.</Dialog.Description>
 *     </Dialog.Header>
 *     …
 *     <Dialog.Footer>…</Dialog.Footer>
 *   </Dialog.Content>
 * </Dialog>
 * ```
 */
export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogTrigger,
  Close: DialogClose,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Header: DialogHeader,
  Title: DialogTitle,
  Description: DialogDescription,
  Footer: DialogFooter,
});
