import { HttpException, HttpStatus } from '@nestjs/common';

import type { RuntimeEnvironment } from '@repo/logging';

const HTTP_ERROR_EVENT = 'http.request.error';
const HTTP_WARN_EVENT = 'http.request.warn';

interface HttpExceptionPayload {
  message?: unknown;
  code?: unknown;
}

export interface SerializedErrorMetadata {
  type: string;
  code: string;
  message: string;
  stack?: string;
}

export interface SerializedExceptionLog {
  statusCode: number;
  error: SerializedErrorMetadata;
}

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4_000;
const MAX_MESSAGE_ITEMS = 5;
const UNKNOWN_EXCEPTION_TYPE = 'UnknownException';
const INTERNAL_UNHANDLED_EXCEPTION_CODE = 'SYSTEM_UNHANDLED_EXCEPTION';
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';
const GENERIC_REQUEST_FAILED_MESSAGE = 'Request failed';

function isHttpExceptionPayload(value: unknown): value is HttpExceptionPayload {
  return typeof value === 'object' && value !== null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeErrorCode(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '';
  }

  return trimmedValue
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveHttpStatusCode(statusCode: number): string {
  const statusName = HttpStatus[statusCode];

  if (typeof statusName === 'string' && statusName.length > 0) {
    return `HTTP_${statusName}`;
  }

  return `HTTP_${statusCode}`;
}

function resolveSafeMessageFromValue(value: unknown, fallbackMessage: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return truncate(value.trim(), MAX_ERROR_MESSAGE_LENGTH);
  }

  if (Array.isArray(value)) {
    const normalizedMessages = value
      .filter((message): message is string => typeof message === 'string')
      .map((message) => message.trim())
      .filter((message) => message.length > 0)
      .slice(0, MAX_MESSAGE_ITEMS);

    if (normalizedMessages.length > 0) {
      return truncate(normalizedMessages.join('; '), MAX_ERROR_MESSAGE_LENGTH);
    }
  }

  return truncate(fallbackMessage, MAX_ERROR_MESSAGE_LENGTH);
}

function shouldIncludeErrorStack(environment: RuntimeEnvironment): boolean {
  return environment === 'development' || environment === 'staging';
}

function resolveHttpExceptionMessage(exception: HttpException, payload: unknown): string {
  if (exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return INTERNAL_SERVER_ERROR_MESSAGE;
  }

  if (isHttpExceptionPayload(payload)) {
    return resolveSafeMessageFromValue(
      payload.message,
      exception.message || GENERIC_REQUEST_FAILED_MESSAGE,
    );
  }

  if (typeof payload === 'string') {
    return resolveSafeMessageFromValue(payload, exception.message);
  }

  return resolveSafeMessageFromValue(exception.message, GENERIC_REQUEST_FAILED_MESSAGE);
}

function resolveHttpExceptionCode(statusCode: number, payload: unknown): string {
  if (isHttpExceptionPayload(payload) && typeof payload.code === 'string') {
    const normalizedCode = normalizeErrorCode(payload.code);

    if (normalizedCode.length > 0) {
      return normalizedCode;
    }
  }

  return resolveHttpStatusCode(statusCode);
}

function resolveUnknownExceptionType(exception: unknown): string {
  if (exception instanceof Error && exception.name.trim().length > 0) {
    return exception.name;
  }

  return UNKNOWN_EXCEPTION_TYPE;
}

export function resolveErrorLogLevel(statusCode: number): 'warn' | 'error' {
  return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? 'error' : 'warn';
}

export function resolveErrorLogEvent(statusCode: number): string {
  return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? HTTP_ERROR_EVENT : HTTP_WARN_EVENT;
}

export function serializeExceptionForLogging(
  exception: unknown,
  environment: RuntimeEnvironment,
): SerializedExceptionLog {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    const serializedException: SerializedExceptionLog = {
      statusCode,
      error: {
        type: exception.name,
        code: resolveHttpExceptionCode(statusCode, payload),
        message: resolveHttpExceptionMessage(exception, payload),
      },
    };

    if (
      shouldIncludeErrorStack(environment) &&
      statusCode >= HttpStatus.INTERNAL_SERVER_ERROR &&
      typeof exception.stack === 'string' &&
      exception.stack.length > 0
    ) {
      serializedException.error.stack = truncate(exception.stack, MAX_STACK_LENGTH);
    }

    return serializedException;
  }

  const serializedException: SerializedExceptionLog = {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: {
      type: resolveUnknownExceptionType(exception),
      code: INTERNAL_UNHANDLED_EXCEPTION_CODE,
      message: INTERNAL_SERVER_ERROR_MESSAGE,
    },
  };

  if (
    shouldIncludeErrorStack(environment) &&
    exception instanceof Error &&
    typeof exception.stack === 'string' &&
    exception.stack.length > 0
  ) {
    serializedException.error.stack = truncate(exception.stack, MAX_STACK_LENGTH);
  }

  return serializedException;
}
