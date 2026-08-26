import { parseSerializedLogRecord } from './sink-delivery';

// Maps serialized pino records onto Seq's CLEF format (compact log event
// format: one JSON object per line, newline-delimited, @-prefixed reified
// properties). Pure functions: the sink owns queueing and delivery, this
// module owns only the shape on the wire.

const SEQ_LEVEL_BY_LABEL: Record<string, string> = {
  trace: 'Verbose',
  verbose: 'Verbose',
  debug: 'Debug',
  info: 'Information',
  information: 'Information',
  warn: 'Warning',
  warning: 'Warning',
  error: 'Error',
  fatal: 'Fatal',
};

// Keys that land in the record under a CLEF built-in (@t, @l, @tr, @sp) and
// must not additionally be copied through as plain properties.
const SEQ_RESERVED_ATTRIBUTE_KEYS = new Set(['timestamp', 'time', 'traceId', 'spanId', 'level']);

/** Newline-joined CLEF entries; empty string when nothing in the batch parses. */
export function buildClefPayload(batch: readonly string[], now: () => number): string {
  const clefEntries = batch
    .map((serializedRecord) => toClefRecordLine(serializedRecord, now))
    .filter((entry): entry is string => entry.length > 0);

  return clefEntries.join('\n');
}

function toClefRecordLine(serializedRecord: string, now: () => number): string {
  const parsedRecord = parseSerializedLogRecord(serializedRecord);

  if (!parsedRecord) {
    return '';
  }

  const clefRecord: Record<string, unknown> = {
    '@t': resolveIsoTimestamp(parsedRecord, now),
    '@l': resolveClefLevel(parsedRecord.level),
    '@mt': resolveMessageTemplate(parsedRecord),
  };

  const traceId = resolveStringField(parsedRecord.traceId);

  if (traceId) {
    // Seq requires @tr to be a 32-char lowercase hex string (W3C trace ID).
    // Backend trace IDs arrive as UUIDs (dashes included); strip them so the
    // format is accepted rather than triggering a non-retryable 400.
    const normalized = traceId.replace(/-/g, '');
    clefRecord['@tr'] = /^[0-9a-f]{32}$/i.test(normalized) ? normalized : traceId;
  }

  const spanId = resolveStringField(parsedRecord.spanId);

  if (spanId) {
    clefRecord['@sp'] = spanId;
  }

  const exceptionStack = resolveExceptionStack(parsedRecord);

  if (exceptionStack) {
    clefRecord['@x'] = exceptionStack;
  }

  for (const [key, value] of Object.entries(parsedRecord)) {
    // Skipping @-prefixed record keys keeps callers from clobbering (or
    // spoofing) CLEF built-ins.
    if (SEQ_RESERVED_ATTRIBUTE_KEYS.has(key) || key.startsWith('@')) {
      continue;
    }

    // `defineProperty`, not assignment: a record can legitimately carry a
    // literal `__proto__` property (`JSON.parse` produces one, and the
    // sanitizer that every untrusted record passes through preserves it — see
    // log-redaction.ts `keepSanitizedField`), and assigning that key would set
    // this object's prototype instead of adding a property, silently dropping
    // the field from the CLEF line.
    Object.defineProperty(clefRecord, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return JSON.stringify(clefRecord);
}

function resolveIsoTimestamp(record: Record<string, unknown>, now: () => number): string {
  const timestampCandidate = record.timestamp;

  if (typeof timestampCandidate === 'number' && Number.isFinite(timestampCandidate)) {
    return new Date(timestampCandidate).toISOString();
  }

  if (typeof timestampCandidate === 'string') {
    const timestamp = Date.parse(timestampCandidate);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  const pinoTimeCandidate = record.time;

  if (typeof pinoTimeCandidate === 'number' && Number.isFinite(pinoTimeCandidate)) {
    return new Date(pinoTimeCandidate).toISOString();
  }

  if (typeof pinoTimeCandidate === 'string') {
    const timestamp = Date.parse(pinoTimeCandidate);

    if (Number.isFinite(timestamp)) {
      return new Date(timestamp).toISOString();
    }
  }

  return new Date(now()).toISOString();
}

// Numeric thresholds follow pino's level numbers (10 trace … 60 fatal); an
// unrecognizable level reads as Information rather than dropping the record.
function resolveClefLevel(level: unknown): string {
  if (typeof level === 'number' && Number.isFinite(level)) {
    if (level >= 60) {
      return 'Fatal';
    }

    if (level >= 50) {
      return 'Error';
    }

    if (level >= 40) {
      return 'Warning';
    }

    if (level >= 30) {
      return 'Information';
    }

    if (level >= 20) {
      return 'Debug';
    }

    return 'Verbose';
  }

  if (typeof level === 'string') {
    const mappedLevel = SEQ_LEVEL_BY_LABEL[level.trim().toLowerCase()];

    if (mappedLevel) {
      return mappedLevel;
    }
  }

  return 'Information';
}

// Deliberately the inverse of the OTLP body preference: Seq queries group by
// @mt, and `event` is the stable, low-cardinality event name call sites emit,
// so it beats the free-form msg/message text here.
function resolveMessageTemplate(record: Record<string, unknown>): string {
  const eventCandidate = resolveStringField(record.event);

  if (eventCandidate) {
    return eventCandidate;
  }

  const msgCandidate = resolveStringField(record.msg);

  if (msgCandidate) {
    return msgCandidate;
  }

  const messageCandidate = resolveStringField(record.message);

  if (messageCandidate) {
    return messageCandidate;
  }

  return 'log event';
}

function resolveStringField(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (trimmedValue.length > 0) {
      return trimmedValue;
    }

    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function resolveExceptionStack(record: Record<string, unknown>): string | null {
  const directStack = resolveStringField(record.stack);

  if (directStack) {
    return directStack;
  }

  const errorCandidate = record.error;
  const errorStack = resolveStackFromErrorCandidate(errorCandidate);

  if (errorStack) {
    return errorStack;
  }

  return resolveStackFromErrorCandidate(record.err);
}

function resolveStackFromErrorCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const stackCandidate = (value as { stack?: unknown }).stack;

  return resolveStringField(stackCandidate);
}
