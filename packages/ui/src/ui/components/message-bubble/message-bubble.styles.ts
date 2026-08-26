import { cva } from 'class-variance-authority';

/**
 * Whose message the bubble represents: `sent` is the current user's own message
 * (accent fill, trailing edge); `received` is an incoming message (surface fill,
 * leading edge).
 */
export type MessageBubbleVariant = 'sent' | 'received';

/**
 * Outer column. Stacks the optional sender name, the avatar + bubble row, and the
 * meta row, all aligned to the sender's side of the thread.
 */
export const messageBubbleContainerClass = cva('flex flex-col gap-1', {
  variants: {
    variant: {
      sent: 'items-end',
      received: 'items-start',
    },
  },
  defaultVariants: { variant: 'received' },
});

/**
 * Avatar + bubble (+ actions) row. Sent messages flip the row so the avatar and
 * any actions sit on the trailing edge, mirroring the received layout. `w-full`
 * gives the row a *definite* width so the bubble's percentage `max-w` resolves
 * against it — otherwise the shrink-to-fit row leaves the percentage indefinite
 * and browsers collapse `min(75%, …)` to 0, squashing the bubble to one word per
 * line. The bubble's own `w-fit` still hugs its content within that width.
 */
export const messageBubbleRowClass = cva('flex w-full items-end gap-2', {
  variants: {
    variant: {
      sent: 'flex-row-reverse',
      received: 'flex-row',
    },
  },
  defaultVariants: { variant: 'received' },
});

/**
 * The bubble surface itself. `w-fit` hugs the content and `max-w` keeps it
 * readable on desktop and mobile; `whitespace-pre-wrap` wraps long messages at
 * spaces and preserves newlines without ever splitting a word mid-character.
 * Each variant rounds the corner nearest its tail less, for a subtle pointer.
 */
export const messageBubbleClass = cva(
  'relative w-fit max-w-[min(75%,34rem)] rounded-(--ui-radius-lg) px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
  {
    variants: {
      variant: {
        sent: 'bg-(--ui-accent) text-(--ui-accent-contrast) rounded-br-(--ui-radius-sm)',
        received: 'bg-(--ui-input-background) text-(--ui-foreground) rounded-bl-(--ui-radius-sm)',
      },
    },
    defaultVariants: { variant: 'received' },
  },
);

/** Sender name shown above the bubble (typically on received messages). */
export const messageBubbleSenderClass = 'text-2xs font-semibold text-(--ui-text-subtle)';

/** Timestamp + delivery-status row shown beneath the bubble. */
export const messageBubbleMetaClass = 'flex items-center gap-1 text-2xs text-(--ui-text-subtle)';
