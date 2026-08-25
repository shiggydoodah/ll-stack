import { trace } from '@opentelemetry/api';
import type { Request } from 'express';

import { generateRequestId } from './request-id';

// The trace id is surfaced on every HTTP response under this header. Shared by
// the interceptor (success path) and the exception filter (error path) so the
// header name stays in lockstep.
export const TRACE_ID_HEADER = 'x-trace-id';

// Express request augmented by RequestIdMiddleware with the per-request id.
export type RequestWithId = Request & { id?: string; requestId?: string };

export interface TraceCorrelationFields {
  traceId: string | null;
  spanId: string | null;
}

// Reads the OpenTelemetry trace/span ids from the active span, if any. Used to
// stamp every log line so logs can be grouped by distributed trace.
export function resolveTraceCorrelationFields(): TraceCorrelationFields {
  const activeSpan = trace.getActiveSpan();

  if (!activeSpan) {
    return {
      traceId: null,
      spanId: null,
    };
  }

  const activeSpanContext = activeSpan.spanContext();

  return {
    traceId: activeSpanContext.traceId || null,
    spanId: activeSpanContext.spanId || null,
  };
}

// The trace id surfaced on every HTTP response (header + body). Prefers the OTel
// trace id; falls back to the per-request id so a non-null value is guaranteed
// even when no span is active. Lets a frontend log line jump to the matching
// backend log.
export function resolveResponseTraceId(fallbackRequestId: string | undefined): string {
  return resolveTraceCorrelationFields().traceId ?? fallbackRequestId ?? generateRequestId();
}
