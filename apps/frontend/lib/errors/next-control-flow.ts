// Next signals redirect()/notFound()/forbidden()/unauthorized() — and the
// NEXT_HTTP_ERROR_FALLBACK family that carries the 4xx statuses — by throwing
// tagged control-flow errors. They are navigations, not failures, and must
// never be recorded as errors by either the server-side onRequestError hook
// (lib/logging/request-error.ts) or the browser capture (LoggingProvider.tsx).
// Both consume this single list so a new Next prefix can never land in one
// filter and silently miss the other.
//
// This module must stay importable from BOTH server and client code: no
// 'server-only', no 'use client', no React, no logging imports.

export const NEXT_CONTROL_FLOW_PREFIXES = [
  'NEXT_REDIRECT',
  'NEXT_NOT_FOUND',
  'NEXT_HTTP_ERROR_FALLBACK',
] as const;

/**
 * True when the thrown value is a Next control-flow signal. The tag lives on
 * `digest` for real signal errors; the message/string fallbacks cover values
 * that lost their shape crossing a rejection or serialization boundary.
 */
export const isNextControlFlowSignal = (value: unknown): boolean => {
  const digest = (value as { digest?: unknown } | null | undefined)?.digest;
  const candidate =
    typeof digest === 'string'
      ? digest
      : value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : '';
  return NEXT_CONTROL_FLOW_PREFIXES.some((prefix) => candidate.startsWith(prefix));
};
