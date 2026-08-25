import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { RuntimeEnvironment, resolveRequestPath } from '@repo/logging';

import {
  resolveErrorLogEvent,
  resolveErrorLogLevel,
  serializeExceptionForLogging,
} from '../logging/error-log-mapper';
import { RequestWithId, TRACE_ID_HEADER, resolveResponseTraceId } from '../utils/trace-context';

interface HttpErrorBody {
  message?: string | string[];
  error?: string;
}

const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';

// Intentionally loose: HttpErrorBody fields are all optional, so any non-null object qualifies.
// Field types are re-checked at the call site before use.
function isHttpErrorBody(value: unknown): value is HttpErrorBody {
  return typeof value === 'object' && value !== null;
}

function isRuntimeEnvironment(value: string): value is RuntimeEnvironment {
  return (
    value === 'development' || value === 'staging' || value === 'production' || value === 'test'
  );
}

function resolveRuntimeEnvironment(): RuntimeEnvironment {
  const normalizedNodeEnvironment = process.env['NODE_ENV']?.trim().toLowerCase();

  if (normalizedNodeEnvironment && isRuntimeEnvironment(normalizedNodeEnvironment)) {
    return normalizedNodeEnvironment;
  }

  return 'production';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly runtimeEnvironment = resolveRuntimeEnvironment();

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const serializedException = serializeExceptionForLogging(exception, this.runtimeEnvironment);

    // Resolved once and threaded through both the log line and the response
    // body, so the two can never disagree about which path failed.
    const path = resolveRequestPath(request);

    this.logException(request, path, serializedException);

    const traceId = resolveResponseTraceId(request.id ?? request.requestId);
    response.setHeader(TRACE_ID_HEADER, traceId);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const { message, error } =
        status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? {
              message: INTERNAL_SERVER_ERROR_MESSAGE,
              error: exception.name,
            }
          : this.extractHttpExceptionDetails(payload, exception.name);

      response.status(status).json({
        statusCode: status,
        error,
        message,
        path,
        timestamp: new Date().toISOString(),
        traceId,
      });

      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerErrorException',
      message: INTERNAL_SERVER_ERROR_MESSAGE,
      path,
      timestamp: new Date().toISOString(),
      traceId,
    });
  }

  private extractHttpExceptionDetails(
    payload: string | object,
    fallbackError: string,
  ): { message: string | string[]; error: string } {
    if (typeof payload === 'string') {
      return {
        message: payload,
        error: fallbackError,
      };
    }

    if (isHttpErrorBody(payload)) {
      const message =
        typeof payload.message === 'string' ||
        (Array.isArray(payload.message) && payload.message.every((m) => typeof m === 'string'))
          ? payload.message
          : 'Request failed';
      const error = typeof payload.error === 'string' ? payload.error : fallbackError;

      return { message, error };
    }

    return {
      message: 'Request failed',
      error: fallbackError,
    };
  }

  private logException(
    request: Request,
    path: string,
    serializedException: ReturnType<typeof serializeExceptionForLogging>,
  ): void {
    const logPayload = {
      event: resolveErrorLogEvent(serializedException.statusCode),
      message:
        serializedException.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Unhandled request exception.'
          : 'Request failed with handled exception.',
      method: request.method || 'UNKNOWN',
      path,
      statusCode: serializedException.statusCode,
      durationMs: null,
      error: serializedException.error,
    };

    if (resolveErrorLogLevel(serializedException.statusCode) === 'error') {
      this.logger.error(logPayload);
      return;
    }

    this.logger.warn(logPayload);
  }
}
