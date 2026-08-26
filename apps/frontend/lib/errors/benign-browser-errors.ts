// Browser-emitted "errors" that are not failures and must never be recorded as
// `client.error.unhandled` (LoggingProvider.tsx). Unlike next-control-flow.ts
// (thrown navigation signals), these arrive as `window` `error` events the
// browser dispatches for its own benign, self-correcting conditions — there is
// no thrown value, so the ErrorEvent carries no `error` and no stack.
//
// Client-only: these conditions never occur server-side, so this list is not
// shared with the onRequestError capture (request-error.ts).

/**
 * The ResizeObserver "loop" notifications. The spec has the browser *report* an
 * error when a ResizeObserver callback resizes an observed element, deferring
 * the remaining callbacks to the next frame rather than looping synchronously —
 * a harmless, self-correcting deferral, not a bug. It surfaces here because the
 * Radix HoverCard used for the feed member-preview card (MemberProfileHoverCard)
 * repositions when its body swaps skeleton→content, tripping the observer.
 *
 * Two wordings exist across engine versions, both containing "ResizeObserver
 * loop"; matching that substring covers both (and any `Uncaught ` prefix):
 *   - "ResizeObserver loop completed with undelivered notifications." (Chromium)
 *   - "ResizeObserver loop limit exceeded"                            (older)
 *
 * Accepts `unknown` so it composes with the same value the control-flow filter
 * reads (`errorEvent.error ?? errorEvent.message`); the benign event's `error`
 * is null, so in practice the message string is what matches.
 */
export const isBenignResizeObserverError = (value: unknown): boolean => {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  return message.includes('ResizeObserver loop');
};
