import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'http';

import { resolveRequestPath, type RequestPathSource } from './request-path';

export const REDACTED_LOG_VALUE = '[REDACTED]';
export const OMITTED_LOG_VALUE = '[OMITTED]';

const CIRCULAR_LOG_VALUE = '[Circular]';
const TRUNCATED_LOG_VALUE = '[Truncated]';
const DEFAULT_MAX_REDACTION_DEPTH = 8;

const TOKEN_LIKE_VALUE_PATTERNS = [
  /^Bearer\s+\S+$/i,
  /^Basic\s+\S+$/i,
  /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/,
];

// Substring-matched against the normalized field name, so `secret` also covers
// `secretHash`, `apikey` covers `x-api-key`, and so on. Extend this list — not a
// per-app redact path list — when a new sensitive field is introduced: this is
// the deep sanitizer every backend log record actually passes through (wired
// up as `formatters.log` in the backend's logger config).
const SENSITIVE_KEYWORDS = [
  'authorization',
  'cookie',
  'token',
  'apikey',
  'secret',
  'password',
  'privatekey',
  // Credential material handed back to a caller once and never persisted
  // (e.g. the plaintext value of a freshly minted API key).
  'plaintext',
] as const;

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'xapikey',
]);

const SAFE_REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'content-length',
  'content-type',
  'host',
  'user-agent',
  'x-forwarded-for',
  'x-request-id',
]);

const SAFE_RESPONSE_HEADER_ALLOWLIST = new Set([
  'cache-control',
  'content-length',
  'content-type',
  'etag',
  'location',
  'x-request-id',
]);

type HeaderValue = string | number | readonly string[] | undefined;

interface ResolvedLogRedactionPolicy {
  readonly maxDepth: number;
}

export interface LogRedactionPolicy {
  readonly maxDepth?: number;
}

interface RedactionTraversalState {
  readonly policy: ResolvedLogRedactionPolicy;
  readonly visited: WeakSet<object>;
  readonly depth: number;
}

function normalizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9*]/g, '');
}

function sanitizeStringValue(value: string): string {
  const trimmedValue = value.trim();

  if (
    trimmedValue.length > 0 &&
    TOKEN_LIKE_VALUE_PATTERNS.some((pattern) => pattern.test(trimmedValue))
  ) {
    return REDACTED_LOG_VALUE;
  }

  return value;
}

function isSensitiveFieldName(fieldName: string): boolean {
  const normalizedFieldName = normalizeSegment(fieldName);

  if (normalizedFieldName.length === 0) {
    return false;
  }

  return SENSITIVE_KEYWORDS.some((keyword) => normalizedFieldName.includes(keyword));
}

function resolvePolicy(policy?: LogRedactionPolicy): ResolvedLogRedactionPolicy {
  const maxDepth = policy?.maxDepth;

  return {
    maxDepth:
      typeof maxDepth === 'number' && Number.isFinite(maxDepth) && maxDepth >= 1
        ? Math.floor(maxDepth)
        : DEFAULT_MAX_REDACTION_DEPTH,
  };
}

function sanitizeHeaderValue(value: HeaderValue): HeaderValue {
  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (typeof value === 'number' || typeof value === 'undefined') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStringValue(item));
  }

  return undefined;
}

function extractSafeHeaders(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders | undefined,
  allowlist: ReadonlySet<string>,
): Record<string, HeaderValue> {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  const sanitizedHeaders: Record<string, HeaderValue> = {};

  for (const [headerName, rawValue] of Object.entries(headers)) {
    const normalizedHeaderName = headerName.trim().toLowerCase();
    const headerNameForMatching = normalizeSegment(normalizedHeaderName);

    if (SENSITIVE_HEADER_NAMES.has(headerNameForMatching)) {
      sanitizedHeaders[normalizedHeaderName] = REDACTED_LOG_VALUE;
      continue;
    }

    if (!allowlist.has(normalizedHeaderName)) {
      continue;
    }

    sanitizedHeaders[normalizedHeaderName] = sanitizeHeaderValue(rawValue as HeaderValue);
  }

  return sanitizedHeaders;
}

/**
 * Stores one sanitized field on the accumulator.
 *
 * Plain `sanitizedRecord[key] = value` is an assignment, and an assignment to
 * the literal key `__proto__` sets the accumulator's PROTOTYPE instead of
 * creating a field. `JSON.parse` does hand `__proto__` back as an ordinary own
 * property, so any record built from untrusted JSON — every browser record
 * `/api/client-logs` ingests — could reach this loop carrying one. The field
 * then vanished from the sanitizer's output entirely (spread, `Object.entries`
 * and `JSON.stringify` all read own-enumerable properties only), and the
 * caller's value became the accumulator's prototype for the rest of the call.
 *
 * `defineProperty` always creates an own field, so the key survives as ordinary
 * data under its own name and the accumulator keeps `Object.prototype`. This is
 * the layer to fix it at: this function is the deep sanitizer both apps share
 * (wired up as the backend's `formatters.log`), so every caller inherits it.
 */
function keepSanitizedField(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function sanitizeRecursively(value: unknown, state: RedactionTraversalState): unknown {
  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (
    value === null ||
    typeof value === 'undefined' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (state.depth >= state.policy.maxDepth) {
    return TRUNCATED_LOG_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeRecursively(entry, {
        ...state,
        depth: state.depth + 1,
      }),
    );
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (state.visited.has(value)) {
    return CIRCULAR_LOG_VALUE;
  }

  state.visited.add(value);

  const sourceRecord = value as Record<string, unknown>;
  const sanitizedRecord: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(sourceRecord)) {
    if (isSensitiveFieldName(key)) {
      keepSanitizedField(sanitizedRecord, key, REDACTED_LOG_VALUE);
      continue;
    }

    keepSanitizedField(
      sanitizedRecord,
      key,
      sanitizeRecursively(nestedValue, {
        ...state,
        depth: state.depth + 1,
      }),
    );
  }

  state.visited.delete(value);
  return sanitizedRecord;
}

export function sanitizeLogValue(value: unknown, policy?: LogRedactionPolicy): unknown {
  const resolvedPolicy = resolvePolicy(policy);

  return sanitizeRecursively(value, {
    policy: resolvedPolicy,
    visited: new WeakSet<object>(),
    depth: 0,
  });
}

export function sanitizeLogRecord(
  record: Record<string, unknown>,
  policy?: LogRedactionPolicy,
): Record<string, unknown> {
  const sanitized = sanitizeLogValue(record, policy);

  if (typeof sanitized !== 'object' || sanitized === null || Array.isArray(sanitized)) {
    return {};
  }

  return sanitized as Record<string, unknown>;
}

type LoggerRequest = IncomingMessage & RequestPathSource & { id?: unknown };

export function serializeRequestForLogging(request: LoggerRequest): Record<string, unknown> {
  const serializedRequest: Record<string, unknown> = {
    method: request.method,
    // `resolveRequestPath`, NOT the raw `request.url` — the same value the access
    // log's `path` field uses, and for the same reason: a credential can sit in
    // the PATH, not only the query. A route like `/v1/session/{token}` carries a
    // one-time token whose long segment `stripQueryAndFragmentFromUrl` would
    // have preserved verbatim on `req` — which pino-http binds via
    // `logger.child({ req })`, so it lands on EVERY line the request writes. This
    // resolves to the route template (`:token`) or masks the dynamic segment to
    // `{id}` (LONG_TOKEN_PATH_SEGMENT_PATTERN), while query/fragment stripping is
    // subsumed by `stripQueryString` inside it. Field-name and value-shape
    // redaction never caught this because `url` is not a sensitive name and an
    // opaque path segment is not token-SHAPED.
    url: resolveRequestPath(request),
    headers: extractSafeHeaders(request.headers, SAFE_REQUEST_HEADER_ALLOWLIST),
  };

  if (typeof request.id !== 'undefined') {
    serializedRequest.id = sanitizeLogValue(request.id);
  }

  if (request.socket?.remoteAddress) {
    serializedRequest.remoteAddress = request.socket.remoteAddress;
  }

  if (typeof request.socket?.remotePort === 'number') {
    serializedRequest.remotePort = request.socket.remotePort;
  }

  return serializedRequest;
}

type LoggerResponse = ServerResponse<IncomingMessage>;

export function serializeResponseForLogging(response: LoggerResponse): Record<string, unknown> {
  const serializedResponse: Record<string, unknown> = {
    statusCode: response.statusCode,
  };

  const headers = typeof response.getHeaders === 'function' ? response.getHeaders() : undefined;
  const sanitizedHeaders = extractSafeHeaders(headers, SAFE_RESPONSE_HEADER_ALLOWLIST);

  if (Object.keys(sanitizedHeaders).length > 0) {
    serializedResponse.headers = sanitizedHeaders;
  }

  return serializedResponse;
}
