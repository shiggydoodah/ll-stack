import { Writable } from 'node:stream';

import { HttpOtlpLogSink } from './http-otlp-sink';
import type { LogSink, LogSinkConfig, LogSinkType } from './log-sink';
import { SUPPORTED_LOG_SINK_TYPES } from './log-sink';
import { SeqLogSink } from './seq-sink';
import { LOG_SINK_DISPATCH_CONTEXT } from './sink-delivery';
import { StdoutLogSink } from './stdout-sink';

// Owns the process-wide active sink: config validation, construction, the
// pino stream adapter, and shutdown. One sink per process — pino writes
// through a single stream, and letting the type change mid-run would strand
// the old sink's queue — so the active sink is a module-level singleton and a
// type change after initialization is a hard error.

const DEFAULT_LOG_SINK_TYPE: LogSinkType = 'stdout';

interface ActiveLogSinkState {
  readonly type: string;
  readonly sink: LogSink;
}

let activeLogSinkState: ActiveLogSinkState | null = null;

function normalizeConfiguredLogSinkType(rawValue: string | undefined): string {
  if (typeof rawValue !== 'string') {
    return DEFAULT_LOG_SINK_TYPE;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (normalized.length === 0) {
    return DEFAULT_LOG_SINK_TYPE;
  }

  return normalized;
}

// Error messages name the env vars (LOG_SINK, SEQ_SERVER_URL, …) rather than
// the config fields: they surface at boot, and the fix is an env change.
function resolveLogSinkFactory(logSinkType: string): (config: LogSinkConfig) => LogSink {
  if (logSinkType === 'stdout') {
    return () => new StdoutLogSink();
  }

  if (logSinkType === 'http_otlp') {
    return (config: LogSinkConfig) => {
      const endpoint = config.otlpEndpoint?.trim() || '';

      if (endpoint.length === 0) {
        throw new Error('LOG_HTTP_OTLP_ENDPOINT is required when LOG_SINK is set to "http_otlp".');
      }

      // Clamped, not rejected: these arrive through env schemas that already
      // bound them, and a nonsensical leftover (batch larger than the queue)
      // should degrade to a working sink rather than fail the boot.
      const queueSize = Math.max(1, Math.trunc(config.queueSize || 1));
      const batchSize = Math.max(1, Math.min(config.batchSize || 1, queueSize));

      return new HttpOtlpLogSink({
        endpoint,
        serviceName: config.serviceName,
        environment: config.environment,
        timeoutMs: config.timeoutMs,
        batchSize,
        queueSize,
        flushIntervalMs: config.flushIntervalMs,
        maxRetries: config.maxRetries,
        backoffBaseMs: config.backoffBaseMs,
        backoffMaxMs: config.backoffMaxMs,
        backoffJitterFactor: config.backoffJitterFactor,
        failureFallbackThreshold: config.failureFallbackThreshold,
        initFailureFallbackThreshold: config.initFailureFallbackThreshold,
        circuitOpenMs: config.circuitOpenMs,
        shutdownDrainTimeoutMs: config.shutdownDrainTimeoutMs,
      });
    };
  }

  if (logSinkType === 'seq') {
    return (config: LogSinkConfig) => {
      const serverUrl = config.seqServerUrl?.trim() || '';

      if (serverUrl.length === 0) {
        throw new Error('SEQ_SERVER_URL is required when LOG_SINK is set to "seq".');
      }

      let parsedServerUrl: URL;

      try {
        parsedServerUrl = new URL(serverUrl);
      } catch {
        throw new Error('SEQ_SERVER_URL must be a valid URL when LOG_SINK is set to "seq".');
      }

      // The ingestion path is appended here; a path in the configured value
      // would silently double up (…/logs/ingest/clef), so refuse it loudly.
      const hasNonRootPath =
        parsedServerUrl.pathname.length > 0 && parsedServerUrl.pathname !== '/';

      if (hasNonRootPath || parsedServerUrl.search.length > 0 || parsedServerUrl.hash.length > 0) {
        throw new Error(
          'SEQ_SERVER_URL must be a base URL without a path, query, or fragment when LOG_SINK is set to "seq".',
        );
      }

      const endpoint = new URL('/ingest/clef', parsedServerUrl).toString();
      const queueSize = Math.max(1, Math.trunc(config.queueSize || 1));
      const batchSize = Math.max(1, Math.min(config.batchSize || 1, queueSize));
      const apiKey = config.seqApiKey?.trim();
      const resolvedApiKey = typeof apiKey === 'string' && apiKey.length > 0 ? apiKey : undefined;

      return new SeqLogSink({
        endpoint,
        timeoutMs: config.timeoutMs,
        batchSize,
        queueSize,
        flushIntervalMs: config.flushIntervalMs,
        maxRetries: config.maxRetries,
        backoffBaseMs: config.backoffBaseMs,
        backoffMaxMs: config.backoffMaxMs,
        backoffJitterFactor: config.backoffJitterFactor,
        shutdownDrainTimeoutMs: config.shutdownDrainTimeoutMs,
        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
      });
    };
  }

  throw new Error(
    `Invalid LOG_SINK value "${logSinkType}". Supported values: ${SUPPORTED_LOG_SINK_TYPES.join(', ')}.`,
  );
}

export function resolveActiveLogSink(config: LogSinkConfig): LogSink {
  const configuredLogSinkType = normalizeConfiguredLogSinkType(config.sinkType);

  if (activeLogSinkState) {
    if (activeLogSinkState.type !== configuredLogSinkType) {
      throw new Error(
        `LOG_SINK cannot change after initialization. Active sink: "${activeLogSinkState.type}", requested: "${configuredLogSinkType}".`,
      );
    }

    return activeLogSinkState.sink;
  }

  const sink = resolveLogSinkFactory(configuredLogSinkType)(config);
  activeLogSinkState = {
    type: configuredLogSinkType,
    sink,
  };

  return sink;
}

/**
 * Adapts a sink to the writable stream pino expects. Emit errors are reported
 * on stderr and swallowed — erroring the stream would tear down the logger
 * and lose every record after the first bad one.
 */
export function createPinoSinkStream(sink: LogSink): NodeJS.WritableStream {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      const record = typeof chunk === 'string' ? chunk : chunk.toString();

      if (record.length === 0) {
        callback();
        return;
      }

      Promise.resolve()
        .then(() => sink.emit(record))
        .then(() => callback())
        .catch((error: unknown) => {
          process.stderr.write(
            `${LOG_SINK_DISPATCH_CONTEXT} Log sink emit failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
          );
          callback();
        });
    },
  });
}

export async function shutdownActiveLogSink(): Promise<void> {
  if (!activeLogSinkState) {
    return;
  }

  const currentSink = activeLogSinkState.sink;
  activeLogSinkState = null;
  await currentSink.flush();
  await currentSink.shutdown();
}

export function __resetActiveLogSinkForTests(): void {
  activeLogSinkState = null;
}
