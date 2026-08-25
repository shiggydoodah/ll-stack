import type { IncomingMessage, ServerResponse } from 'http';

import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

import type { Env } from '../../config/env.schema';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  acceptId,
  generateRequestId,
} from '../utils/request-id';
import { resolveTraceCorrelationFields } from '../utils/trace-context';
import type {
  LogLevel,
  LogSinkConfig,
  LogSinkType,
  RequestPathSource,
  RuntimeEnvironment,
} from '@repo/logging';
import {
  DEFAULT_LOG_LEVEL_BY_ENV,
  createPinoSinkStream,
  resolveActiveLogSink,
  resolveRequestPath,
  sanitizeLogRecord,
  serializeRequestForLogging,
  serializeResponseForLogging,
} from '@repo/logging';

import { BACKEND_LOG_EVENTS } from './log-events';

const SESSION_ID_HEADER_NAME = 'x-session-id';
// Pino's `redact` matches exact paths, so this list covers the request/response
// envelope only. Field-name-based redaction of the log body is `sanitizeLogRecord`
// (`formatters.log` below) — add new sensitive FIELD names to its
// SENSITIVE_KEYWORDS in `packages/logging/src/log-redaction.ts`, which walks
// nested objects; a path here only ever matches at the position written.
const DEFAULT_REDACT_PATHS = [
  // Top-level credential material. Second
  // layer behind sanitizeLogRecord, which also catches it when nested.
  'plaintext',
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['x-api-secret']",
  "req.headers['x-admin-key']",
  'req.body',
  'res.body',
  "res.headers['set-cookie']",
  "req.raw.headers['authorization']",
  "req.raw.headers['cookie']",
  "req.raw.headers['x-api-secret']",
  "req.raw.headers['x-admin-key']",
  'req.raw.body',
  'res.raw.body',
  "res.raw.headers['set-cookie']",
];
const ACCESS_LOG_CONTEXT = 'http.access';

type RequestIdValue = string | number | object;
type LoggerRequest = IncomingMessage &
  RequestPathSource & {
    id?: RequestIdValue;
  };
type PinoResponseTiming = {
  responseTime?: unknown;
};
type AccessLogEvent =
  | (typeof BACKEND_LOG_EVENTS)['http.request.received']
  | (typeof BACKEND_LOG_EVENTS)['http.request.completed']
  | (typeof BACKEND_LOG_EVENTS)['http.request.error']
  | (typeof BACKEND_LOG_EVENTS)['http.request.warn'];
type AccessLogExclusion = {
  methods: ReadonlySet<string>;
  path: string;
  includeSubpaths: boolean;
};

const ACCESS_LOG_EXCLUSIONS: readonly AccessLogExclusion[] = [
  {
    methods: new Set(['GET', 'HEAD']),
    path: '/docs',
    includeSubpaths: true,
  },
  {
    methods: new Set(['GET', 'HEAD']),
    path: '/docs-json',
    includeSubpaths: true,
  },
  {
    methods: new Set(['GET', 'HEAD']),
    path: '/health',
    includeSubpaths: false,
  },
];

function resolveRequestId(request: LoggerRequest): string {
  if (typeof request.id === 'string' && request.id.length > 0) {
    return request.id;
  }

  return generateRequestId();
}

function readHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

// Resolves the canonical request id at genReqId time (before RequestIdMiddleware
// runs). Honours a validated inbound x-request-id so the id is decided once and
// the request-scoped child logger, access log, and response header all agree.
export function resolveInboundRequestId(request: LoggerRequest): string {
  return acceptId(readHeader(request, REQUEST_ID_HEADER)) ?? resolveRequestId(request);
}

interface LogCorrelationProps {
  requestId: string;
  correlationId: string;
  sessionId?: string;
  traceId: string | null;
  spanId: string | null;
}

// Reserved identity fields stamped on every log record. correlationId is the
// cross-stack search key (validated inbound x-correlation-id, else requestId so
// the field is never empty); sessionId is the per-visit key (omitted when
// absent). Raw rejected headers are never logged. Pino merges these last, so
// user-supplied log context cannot overwrite these reserved fields.
export function buildLogCorrelationProps(request: LoggerRequest): LogCorrelationProps {
  const requestId =
    typeof request.id === 'string' && request.id.length > 0
      ? request.id
      : resolveRequestId(request);
  const traceCorrelationFields = resolveTraceCorrelationFields();
  const sessionId = acceptId(readHeader(request, SESSION_ID_HEADER_NAME));
  const correlationId = acceptId(readHeader(request, CORRELATION_ID_HEADER)) ?? requestId;

  return {
    requestId,
    correlationId,
    ...(sessionId ? { sessionId } : {}),
    traceId: traceCorrelationFields.traceId,
    spanId: traceCorrelationFields.spanId,
  };
}

function resolveLogLevel(configService: ConfigService<Env>, nodeEnv: RuntimeEnvironment): LogLevel {
  return configService.get('LOG_LEVEL', { infer: true }) ?? DEFAULT_LOG_LEVEL_BY_ENV[nodeEnv];
}

function resolvePrettyOutput(
  configService: ConfigService<Env>,
  nodeEnv: RuntimeEnvironment,
): boolean {
  if (nodeEnv !== 'development') {
    return false;
  }

  const explicitPrettySetting = configService.get('LOG_PRETTY', { infer: true });

  if (typeof explicitPrettySetting === 'boolean') {
    return explicitPrettySetting;
  }

  return true;
}

function warnWhenPrettyOverridesConfiguredSink(
  sinkType: LogSinkType,
  isPrettyOutputEnabled: boolean,
): void {
  if (!isPrettyOutputEnabled || sinkType === 'stdout') {
    return;
  }

  process.stderr.write(
    `[logging] LOG_PRETTY=true uses pino-pretty transport and bypasses LOG_SINK=${sinkType}; set LOG_PRETTY=false to route logs through the configured sink.\n`,
  );
}

function parseRedactPathList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function resolveRedactPaths(configService: ConfigService<Env>): string[] {
  const configuredRedactPaths = configService.get('LOG_REDACT_PATHS', { infer: true });

  if (typeof configuredRedactPaths !== 'string') {
    return [...DEFAULT_REDACT_PATHS];
  }

  const trimmedConfiguredRedactPaths = configuredRedactPaths.trim();

  if (trimmedConfiguredRedactPaths.length === 0) {
    return [...DEFAULT_REDACT_PATHS];
  }

  if (trimmedConfiguredRedactPaths.startsWith('+')) {
    const appendedPaths = parseRedactPathList(trimmedConfiguredRedactPaths.slice(1));

    if (appendedPaths.length === 0) {
      return [...DEFAULT_REDACT_PATHS];
    }

    return dedupePaths([...DEFAULT_REDACT_PATHS, ...appendedPaths]);
  }

  const overridePaths = parseRedactPathList(trimmedConfiguredRedactPaths);

  if (overridePaths.length === 0) {
    return [...DEFAULT_REDACT_PATHS];
  }

  return dedupePaths(overridePaths);
}

function resolveRequestMethod(request: LoggerRequest): string {
  if (typeof request.method === 'string' && request.method.length > 0) {
    return request.method;
  }

  return 'UNKNOWN';
}

function resolveStructuredLogTimestamp(): string {
  return new Date().toISOString();
}

function shouldIgnoreAccessLog(request: LoggerRequest): boolean {
  const path = resolveRequestPath(request);
  const method = resolveRequestMethod(request).toUpperCase();

  return ACCESS_LOG_EXCLUSIONS.some((exclusion) => {
    if (!exclusion.methods.has(method)) {
      return false;
    }

    if (path === exclusion.path) {
      return true;
    }

    return exclusion.includeSubpaths && path.startsWith(`${exclusion.path}/`);
  });
}

function resolveAccessLogDurationMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  return null;
}

function resolveRequestFinishedAccessEvent(
  statusCode: number,
): Exclude<AccessLogEvent, (typeof BACKEND_LOG_EVENTS)['http.request.received']> {
  if (statusCode >= 500) {
    return BACKEND_LOG_EVENTS['http.request.error'];
  }

  if (statusCode >= 400) {
    return BACKEND_LOG_EVENTS['http.request.warn'];
  }

  return BACKEND_LOG_EVENTS['http.request.completed'];
}

// Emits the access log at a level that matches its event taxonomy
// (resolveRequestFinishedAccessEvent): 5xx/transport error → error, 4xx → warn,
// else info. Without this, pino-http defaults every completed response to
// `useLevel` (info), so a 4xx access line carried `event: http.request.warn`
// but was emitted at info — inconsistent with the HttpExceptionFilter warn line
// for the same request.
export function resolveAccessLogLevel(
  statusCode: number,
  hasError: boolean,
): 'info' | 'warn' | 'error' {
  if (hasError || statusCode >= 500) {
    return 'error';
  }

  if (statusCode >= 400) {
    return 'warn';
  }

  return 'info';
}

function createAccessLogBase(
  request: LoggerRequest,
  event: AccessLogEvent,
): {
  context: string;
  event: AccessLogEvent;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
} {
  return {
    context: ACCESS_LOG_CONTEXT,
    event,
    method: resolveRequestMethod(request),
    path: resolveRequestPath(request),
    statusCode: null,
    durationMs: null,
  };
}

function buildLogSinkConfig(
  configService: ConfigService<Env>,
  nodeEnv: RuntimeEnvironment,
  serviceName: string,
): LogSinkConfig {
  return {
    sinkType: configService.get('LOG_SINK', { infer: true }) ?? 'stdout',
    serviceName,
    environment: nodeEnv,
    seqServerUrl: configService.get('SEQ_SERVER_URL', { infer: true }),
    seqApiKey: configService.get('SEQ_API_KEY', { infer: true }),
    otlpEndpoint: configService.get('LOG_HTTP_OTLP_ENDPOINT', { infer: true }),
    timeoutMs: configService.get('LOG_HTTP_TIMEOUT_MS', { infer: true }) ?? 5_000,
    batchSize: configService.get('LOG_HTTP_BATCH_SIZE', { infer: true }) ?? 100,
    queueSize: configService.get('LOG_HTTP_QUEUE_SIZE', { infer: true }) ?? 1_000,
    flushIntervalMs: configService.get('LOG_HTTP_FLUSH_INTERVAL_MS', { infer: true }) ?? 5_000,
    maxRetries: configService.get('LOG_HTTP_MAX_RETRIES', { infer: true }) ?? 3,
    backoffBaseMs: configService.get('LOG_HTTP_BACKOFF_BASE_MS', { infer: true }) ?? 200,
    backoffMaxMs: configService.get('LOG_HTTP_BACKOFF_MAX_MS', { infer: true }) ?? 10_000,
    backoffJitterFactor:
      configService.get('LOG_HTTP_BACKOFF_JITTER_FACTOR', { infer: true }) ?? 0.3,
    failureFallbackThreshold:
      configService.get('LOG_HTTP_FAILURE_FALLBACK_THRESHOLD', { infer: true }) ?? 5,
    initFailureFallbackThreshold:
      configService.get('LOG_HTTP_INIT_FAILURE_FALLBACK_THRESHOLD', { infer: true }) ?? 3,
    circuitOpenMs: configService.get('LOG_HTTP_CIRCUIT_OPEN_MS', { infer: true }) ?? 30_000,
    shutdownDrainTimeoutMs:
      configService.get('LOG_HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS', { infer: true }) ?? 10_000,
  };
}

export function createLoggerConfig(configService: ConfigService<Env>): Params {
  const nodeEnv = configService.get('NODE_ENV', { infer: true }) ?? 'development';
  const applicationName = configService.get('APPLICATION_NAME', { infer: true }) ?? 'backend';
  const isPrettyOutputEnabled = resolvePrettyOutput(configService, nodeEnv);
  const logSinkConfig = buildLogSinkConfig(configService, nodeEnv, applicationName);
  warnWhenPrettyOverridesConfiguredSink(logSinkConfig.sinkType, isPrettyOutputEnabled);
  const logSink = resolveActiveLogSink(logSinkConfig);
  const logSinkStream = createPinoSinkStream(logSink);

  const pinoHttpOptions = {
    level: resolveLogLevel(configService, nodeEnv),
    formatters: {
      log: (record: Record<string, unknown>) => sanitizeLogRecord(record),
    },
    serializers: {
      req: serializeRequestForLogging,
      res: serializeResponseForLogging,
    },
    timestamp: (): string => `,"timestamp":"${resolveStructuredLogTimestamp()}"`,
    genReqId: (request: LoggerRequest, response: ServerResponse) => {
      // pino-http runs before RequestIdMiddleware and binds the request-scoped
      // child logger here, so the id must be resolved now — honouring a
      // validated inbound x-request-id (the "echo inbound id" contract) rather
      // than always generating. Otherwise manual logs (bound to this child)
      // carry a generated id while the access log re-reads the middleware's
      // echoed id, splitting requestId/correlationId across one request.
      const requestId = resolveInboundRequestId(request);
      request.id = requestId;
      response.setHeader(REQUEST_ID_HEADER, requestId);

      return requestId;
    },
    customProps: (request: LoggerRequest) => buildLogCorrelationProps(request),
    customLogLevel: (_request: LoggerRequest, response: ServerResponse, error?: Error) =>
      resolveAccessLogLevel(response.statusCode, Boolean(error)),
    autoLogging: {
      ignore: shouldIgnoreAccessLog,
    },
    customReceivedMessage: () => 'http request received',
    customReceivedObject: (request: LoggerRequest) =>
      createAccessLogBase(request, BACKEND_LOG_EVENTS['http.request.received']),
    customSuccessMessage: (_request: LoggerRequest, response: ServerResponse) =>
      response.statusCode < 400 ? 'http request completed' : 'http request failed',
    customSuccessObject: (
      request: LoggerRequest,
      response: ServerResponse,
      value: PinoResponseTiming,
    ) => ({
      ...createAccessLogBase(request, resolveRequestFinishedAccessEvent(response.statusCode)),
      statusCode: response.statusCode,
      durationMs: resolveAccessLogDurationMs(value.responseTime),
    }),
    customErrorMessage: () => 'http request failed',
    customErrorObject: (
      request: LoggerRequest,
      response: ServerResponse,
      _error: Error,
      value: PinoResponseTiming,
    ) => ({
      ...createAccessLogBase(request, BACKEND_LOG_EVENTS['http.request.error']),
      statusCode: response.statusCode,
      durationMs: resolveAccessLogDurationMs(value.responseTime),
    }),
    base: {
      application: applicationName,
      env: nodeEnv,
    },
    redact: {
      paths: resolveRedactPaths(configService),
      censor: '[REDACTED]',
    },
    ...(!isPrettyOutputEnabled
      ? {
          stream: logSinkStream,
        }
      : {}),
    ...(isPrettyOutputEnabled
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              singleLine: false,
            },
          },
        }
      : {}),
  };

  return {
    pinoHttp: pinoHttpOptions,
  };
}
