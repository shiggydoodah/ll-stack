import { Injectable, NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  acceptId,
  generateRequestId,
} from '../utils/request-id';

type RequestWithId = Request & { id?: string; requestId?: string; correlationId?: string };

// A client-supplied request ID is echoed back in the response header and into
// every log line, so it is validated (see acceptId) before use; anything
// malformed is discarded and a fresh ID is generated instead. An inbound
// x-correlation-id is validated the same way and stashed for logging; when
// absent (no FE wiring yet, or a direct caller) it falls back to requestId so
// the field is never empty. The raw rejected header is never logged.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const requestId =
      acceptId(req.header(REQUEST_ID_HEADER)) || req.id || req.requestId || generateRequestId();

    req.id = requestId;
    req.requestId = requestId;
    req.correlationId = acceptId(req.header(CORRELATION_ID_HEADER)) || requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
