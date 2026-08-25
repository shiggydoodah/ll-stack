'use client';

import type { ReactNode } from 'react';

import { Button } from '../../primitives/button/button';
import type { ButtonTone } from '../../primitives/button/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import type { DialogAnimation } from '../dialog';

/**
 * Props for {@link ActionModal}.
 */
export interface ActionModalProps {
  /** Whether the modal is open. Controlled. */
  open: boolean;
  /**
   * Called when the open state should change (overlay click, Escape, close button, Cancel).
   * Ignored while `pending` so the modal can't be dismissed mid-action.
   */
  onOpenChange: (open: boolean) => void;
  /** Accessible title rendered in the header. */
  title: ReactNode;
  /** Optional supporting copy under the title. Falls back to an `sr-only` echo of the title. */
  description?: ReactNode;
  /** Modal body rendered above the footer, inside the form (so Enter submits). */
  children?: ReactNode;
  /** Confirm button label. @defaultValue `'Confirm'` */
  confirmLabel?: ReactNode;
  /** Confirm button tone. @defaultValue `'neutral'` */
  confirmTone?: ButtonTone;
  /** Optional icon rendered before {@link ActionModalProps.confirmLabel}. */
  confirmIcon?: ReactNode;
  /** Disable the confirm button (e.g. until a confirmation input matches). @defaultValue `false` */
  confirmDisabled?: boolean;
  /** Called when the user confirms (clicks Confirm or presses Enter in the body). */
  onConfirm: () => void;
  /** Cancel button label. @defaultValue `'Cancel'` */
  cancelLabel?: ReactNode;
  /** Called when the user cancels. @defaultValue closes via `onOpenChange(false)` */
  onCancel?: () => void;
  /** Shows a spinner on Confirm, disables Cancel, and locks the modal closed. @defaultValue `false` */
  pending?: boolean;
  /** Hide the default close (X) button. @defaultValue `false` */
  hideClose?: boolean;
  /** Entrance/exit animation passed through to the dialog. @defaultValue `'scale'` */
  animation?: DialogAnimation;
  /** Class applied to the content panel. */
  className?: string;
}

/**
 * Generic confirm/cancel modal built on the compound {@link Dialog}. Owns the common
 * chrome — header, a `<form>` so Enter confirms, a right-aligned Cancel/Confirm footer,
 * and the "can't close mid-action" lock while `pending` — leaving callers to supply only
 * the body (`children`) and wire `onConfirm`/`onCancel`.
 *
 * @example
 * ```tsx
 * <ActionModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Delete your account"
 *   description="This is permanent and cannot be undone."
 *   confirmLabel="Delete my account"
 *   confirmTone="red"
 *   confirmDisabled={!canDelete}
 *   pending={pending}
 *   onConfirm={handleConfirm}
 * >
 *   <Callout tone="red">…</Callout>
 * </ActionModal>
 * ```
 */
export const ActionModal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  confirmTone = 'neutral',
  confirmIcon,
  confirmDisabled = false,
  onConfirm,
  cancelLabel = 'Cancel',
  onCancel,
  pending = false,
  hideClose = false,
  animation,
  className,
}: ActionModalProps) => {
  const handleOpenChange = (next: boolean): void => {
    // Don't let the modal close mid-action.
    if (pending) return;
    onOpenChange(next);
  };

  const handleCancel = (): void => {
    if (onCancel) {
      onCancel();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideClose={hideClose} animation={animation} className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            // Radix warns without a Description; echo the title for screen readers.
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            // Enter in the body submits the form; honour the same lock as the button.
            if (confirmDisabled || pending) return;
            onConfirm();
          }}
        >
          {children}

          <DialogFooter>
            <Button
              type="button"
              tone="neutral"
              variant="outline"
              disabled={pending}
              onClick={handleCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              tone={confirmTone}
              variant="solid"
              loading={pending}
              disabled={confirmDisabled || pending}
            >
              {confirmIcon}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
