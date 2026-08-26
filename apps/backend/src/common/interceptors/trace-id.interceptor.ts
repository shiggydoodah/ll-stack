import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RequestWithId, TRACE_ID_HEADER, resolveResponseTraceId } from '../utils/trace-context';

// Surfaces the backend trace id on every successful response: as the `x-trace-id`
// header and as an additive `traceId` field on object bodies (existing fields are
// untouched — not a wrapping envelope). Error responses are handled by
// HttpExceptionFilter. Lets a frontend log line jump to the matching backend log.
@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const traceId = resolveResponseTraceId(request.id ?? request.requestId);
    response.setHeader(TRACE_ID_HEADER, traceId);

    return next
      .handle()
      .pipe(map((body) => (isAugmentableBody(body) ? { ...body, traceId } : body)));
  }
}

// Only merge into plain JSON object bodies. Arrays, primitives, Buffers, and
// streams (file responses) are passed through untouched.
function isAugmentableBody(body: unknown): body is Record<string, unknown> {
  return (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !Buffer.isBuffer(body) &&
    typeof (body as { pipe?: unknown }).pipe !== 'function'
  );
}
