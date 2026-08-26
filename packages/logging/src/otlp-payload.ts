import type { RuntimeEnvironment } from './log-level.defaults';
import { parseSerializedLogRecord, safeJsonStringify } from './sink-delivery';

// Maps serialized pino records onto the OTLP/HTTP JSON logs payload
// (resourceLogs → scopeLogs → logRecords). Pure functions: the sink owns
// queueing and delivery, this module owns only the shape on the wire.
//
// The caps below bound the payload against pathological records (a single log
// line with hundreds of keys or a megabyte string) — collectors enforce hard
// limits of their own, and one oversized record must not sink the whole batch.
const MAX_OTLP_ATTRIBUTE_COUNT = 64;
const MAX_OTLP_ARRAY_VALUE_COUNT = 20;
const MAX_STRING_VALUE_LENGTH = 4_096;

type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtlpAnyValue[] } };

interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: OtlpAnyValue;
  attributes: Array<{
    key: string;
    value: OtlpAnyValue;
  }>;
}

export interface OtlpPayloadContext {
  readonly serviceName: string;
  readonly environment: RuntimeEnvironment;
  readonly now: () => number;
}

export function buildOtlpPayload(batch: readonly string[], context: OtlpPayloadContext): string {
  const parsedRecords = batch
    .map((record) => parseSerializedLogRecord(record))
    .filter((record): record is Record<string, unknown> => record !== null);

  const resourceAttributes = [
    {
      key: 'service.name',
      value: {
        stringValue: context.serviceName,
      },
    },
    {
      key: 'deployment.environment.name',
      value: {
        stringValue: context.environment,
      },
    },
  ];

  return JSON.stringify({
    resourceLogs: [
      {
        resource: {
          attributes: resourceAttributes,
        },
        scopeLogs: [
          {
            scope: {
              name: 'app.logsink',
            },
            logRecords: parsedRecords.map((record) => toOtlpLogRecord(record, context.now)),
          },
        ],
      },
    ],
  });
}

function toOtlpLogRecord(record: Record<string, unknown>, now: () => number): OtlpLogRecord {
  const severityText = resolveSeverityText(record.level);
  const severityNumber = resolveSeverityNumber(severityText);
  const message = resolveMessage(record);
  const timestamp = resolveTimestampNanoseconds(record, now);

  const attributes = Object.entries(record)
    .filter(
      ([key]) =>
        key !== 'timestamp' &&
        key !== 'time' &&
        key !== 'level' &&
        key !== 'message' &&
        key !== 'msg',
    )
    .slice(0, MAX_OTLP_ATTRIBUTE_COUNT)
    .map(([key, value]) => ({
      key,
      value: toOtlpAnyValue(value),
    }));

  return {
    timeUnixNano: timestamp,
    observedTimeUnixNano: timestamp,
    severityNumber,
    severityText,
    body: {
      stringValue: sanitizeStringValue(message),
    },
    attributes,
  };
}

// Numeric thresholds follow pino's level numbers (10 trace … 60 fatal); an
// unrecognizable level reads as INFO rather than dropping the record.
function resolveSeverityText(level: unknown): string {
  if (typeof level === 'number' && Number.isFinite(level)) {
    if (level >= 60) {
      return 'FATAL';
    }

    if (level >= 50) {
      return 'ERROR';
    }

    if (level >= 40) {
      return 'WARN';
    }

    if (level >= 30) {
      return 'INFO';
    }

    if (level >= 20) {
      return 'DEBUG';
    }

    return 'TRACE';
  }

  if (typeof level === 'string') {
    const normalizedLevel = level.toLowerCase();

    if (
      normalizedLevel === 'debug' ||
      normalizedLevel === 'trace' ||
      normalizedLevel === 'info' ||
      normalizedLevel === 'warn' ||
      normalizedLevel === 'error' ||
      normalizedLevel === 'fatal'
    ) {
      return normalizedLevel.toUpperCase();
    }
  }

  return 'INFO';
}

function resolveSeverityNumber(severityText: string): number {
  switch (severityText) {
    case 'TRACE':
      return 1;
    case 'DEBUG':
      return 5;
    case 'WARN':
      return 13;
    case 'ERROR':
      return 17;
    case 'FATAL':
      return 21;
    case 'INFO':
    default:
      return 9;
  }
}

function resolveMessage(record: Record<string, unknown>): string {
  const messageCandidate = record.message;

  if (typeof messageCandidate === 'string' && messageCandidate.length > 0) {
    return messageCandidate;
  }

  const msgCandidate = record.msg;

  if (typeof msgCandidate === 'string' && msgCandidate.length > 0) {
    return msgCandidate;
  }

  const eventCandidate = record.event;

  if (typeof eventCandidate === 'string' && eventCandidate.length > 0) {
    return eventCandidate;
  }

  return 'log event';
}

function resolveTimestampNanoseconds(record: Record<string, unknown>, now: () => number): string {
  const timestamp = record.timestamp;

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return toNanosecondsString(timestamp, now);
  }

  if (typeof timestamp === 'string') {
    const parsedTimestampMs = Date.parse(timestamp);

    if (Number.isFinite(parsedTimestampMs)) {
      return toNanosecondsString(parsedTimestampMs, now);
    }
  }

  // Support pino's default numeric `time` field when custom timestamp key is
  // unavailable.
  const pinoTimeCandidate = record.time;

  if (typeof pinoTimeCandidate === 'number' && Number.isFinite(pinoTimeCandidate)) {
    return toNanosecondsString(pinoTimeCandidate, now);
  }

  return toNanosecondsString(now(), now);
}

function toNanosecondsString(milliseconds: number, now: () => number): string {
  // Expects epoch milliseconds (for example pino `time`); OTLP wants a
  // nanosecond string, and BigInt keeps the ms → ns multiplication exact
  // where a double would round.
  const safeMilliseconds = Number.isFinite(milliseconds) ? Math.trunc(milliseconds) : now();

  return (BigInt(safeMilliseconds) * 1_000_000n).toString();
}

function toOtlpAnyValue(value: unknown): OtlpAnyValue {
  if (typeof value === 'string') {
    return {
      stringValue: sanitizeStringValue(value),
    };
  }

  if (typeof value === 'boolean') {
    return {
      boolValue: value,
    };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return {
        stringValue: String(value),
      };
    }

    // OTLP intValue is a 64-bit integer serialized as a string in JSON.
    if (Number.isInteger(value)) {
      return {
        intValue: String(value),
      };
    }

    return {
      doubleValue: value,
    };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.slice(0, MAX_OTLP_ARRAY_VALUE_COUNT).map((entry) => toOtlpAnyValue(entry)),
      },
    };
  }

  if (value === null || value === undefined) {
    return {
      stringValue: String(value),
    };
  }

  return {
    stringValue: sanitizeStringValue(safeJsonStringify(value)),
  };
}

function sanitizeStringValue(value: string): string {
  if (value.length <= MAX_STRING_VALUE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_VALUE_LENGTH)}...`;
}
