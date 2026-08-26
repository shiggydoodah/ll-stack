'use client';

import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { formatRelativeTime } from '../../../lib/format-relative-time';
import { Check, CheckCheck, Clock } from 'lucide-react';

import { cn } from '../../../lib/cn';
import {
  messageBubbleClass,
  messageBubbleContainerClass,
  messageBubbleMetaClass,
  messageBubbleRowClass,
  messageBubbleSenderClass,
} from './message-bubble.styles';
import type { MessageBubbleVariant } from './message-bubble.styles';

export type { MessageBubbleVariant } from './message-bubble.styles';

/**
 * Generic delivery lifecycle for a sent message. Intentionally app-agnostic — it
 * carries no read-receipt, routing, or backend semantics, so the bubble stays a
 * reusable primitive.
 */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

/**
 * Delivery-status check icons, mirroring common chat conventions: a clock while
 * sending, a single tick once sent or delivered, and an accent-tinted double tick
 * once read. Each carries an accessible label so the state is announced — `delivered`
 * still announces "Delivered" even though it shares the single-tick glyph with `sent`.
 */
const statusIcon: Record<MessageStatus, ReactNode> = {
  sending: <Clock size={14} role="img" aria-label="Sending" className="text-(--ui-text-subtle)" />,
  sent: <Check size={14} role="img" aria-label="Sent" className="text-(--ui-text-subtle)" />,
  delivered: (
    <Check size={14} role="img" aria-label="Delivered" className="text-(--ui-text-subtle)" />
  ),
  read: <CheckCheck size={14} role="img" aria-label="Read" className="text-(--ui-accent)" />,
};

/**
 * Props for {@link MessageBubble}.
 *
 * Extends every standard `div` attribute except `color` (which collides with the
 * SVG colour attribute typing inherited by some consumers).
 */
export interface MessageBubbleProps extends Omit<ComponentPropsWithoutRef<'div'>, 'color'> {
  /** Whether this is the current user's own message (`sent`) or an incoming one. */
  variant: MessageBubbleVariant;

  /** Bubble body — text, an `<img>`, a link, or any node. The app composes the content. */
  children: ReactNode;

  /** Optional sender name rendered above the bubble (typically for received messages). */
  senderName?: ReactNode;

  /**
   * Optional timestamp, rendered as relative time via `formatRelativeTime`.
   *
   * The relative label is computed at render time, so the text can differ
   * between server-rendered HTML and client hydration (and goes stale until the
   * next re-render). Unparsable values render no timestamp at all.
   */
  timestamp?: Date | string | number;

  /** Delivery status. Rendered as a check icon **only** when `variant === 'sent'`. */
  status?: MessageStatus;

  /** Slot for an avatar element, e.g. `<Avatar />`. */
  avatar?: ReactNode;

  /** Slot for per-message actions, e.g. an overflow menu, revealed on hover by the consumer. */
  actions?: ReactNode;

  ref?: Ref<HTMLDivElement>;
}

/**
 * Presentational chat bubble with `sent` / `received` variants. A thin, reusable
 * primitive: content is a `children` slot and per-message actions are a `ReactNode`
 * slot, so the bubble knows nothing about routes, entities, or the backend. Apps
 * compose richer behaviour (menus, read-receipts) around it.
 *
 * @example
 * ```tsx
 * <MessageBubble
 *   variant="received"
 *   senderName="Marcus"
 *   avatar={<Avatar initials="MB" size="sm" />}
 *   timestamp={message.createdAt}
 * >
 *   Hey, are we still on for tomorrow?
 * </MessageBubble>
 *
 * <MessageBubble variant="sent" timestamp={message.createdAt} status="read">
 *   Yes — see you at 10.
 * </MessageBubble>
 * ```
 */
export const MessageBubble = ({
  variant,
  children,
  senderName,
  timestamp,
  status,
  avatar,
  actions,
  className,
  ...props
}: MessageBubbleProps) => {
  const parsedDate = timestamp != null ? new Date(timestamp) : null;
  // `new Date('garbage')` yields an Invalid Date that passes the null check but
  // throws from `toISOString()` — treat it the same as no timestamp at all.
  const date = parsedDate !== null && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const showStatus = variant === 'sent' && status != null;
  const showMeta = date != null || showStatus;

  return (
    <div className={cn(messageBubbleContainerClass({ variant }), className)} {...props}>
      {senderName ? <span className={messageBubbleSenderClass}>{senderName}</span> : null}
      <div className={messageBubbleRowClass({ variant })}>
        {avatar}
        <div className={messageBubbleClass({ variant })}>{children}</div>
        {actions}
      </div>
      {showMeta ? (
        <div className={messageBubbleMetaClass}>
          {date ? <time dateTime={date.toISOString()}>{formatRelativeTime(date)}</time> : null}
          {variant === 'sent' && status != null ? statusIcon[status] : null}
        </div>
      ) : null}
    </div>
  );
};
