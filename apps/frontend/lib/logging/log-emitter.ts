import 'server-only';
import { resolveActiveLogSink, type LogSink, type LogSinkConfig } from '@repo/logging';
import { getServerEnv } from '../../config/env';

// Shared server-side emission path for both the Next server logger and the
// /api/client-logs ingestion route. Records are emitted through the same
// @repo/logging sink the backend uses (stdout/seq/http_otlp) when remote
// shipping is enabled, otherwise printed to the terminal for local dev.

let cachedSink: LogSink | null = null;

const buildSinkConfig = (): LogSinkConfig => {
  const env = getServerEnv();
  return {
    sinkType: env.LOG_SINK,
    serviceName: env.APPLICATION_NAME,
    environment: env.NODE_ENV,
    seqServerUrl: env.SEQ_SERVER_URL,
    seqApiKey: env.SEQ_API_KEY,
    otlpEndpoint: env.LOG_HTTP_OTLP_ENDPOINT,
    timeoutMs: 5_000,
    batchSize: 100,
    queueSize: 1_000,
    flushIntervalMs: 5_000,
    maxRetries: 3,
    backoffBaseMs: 200,
    backoffMaxMs: 10_000,
    backoffJitterFactor: 0.3,
    failureFallbackThreshold: 5,
    initFailureFallbackThreshold: 3,
    circuitOpenMs: 30_000,
    shutdownDrainTimeoutMs: 10_000,
  };
};

export const isRemoteLoggingEnabled = (): boolean => {
  const env = getServerEnv();
  return env.LOG_REMOTE ?? env.NODE_ENV !== 'development';
};

const consoleMethodForLevel = (level: number): 'debug' | 'info' | 'warn' | 'error' => {
  if (level >= 50) return 'error';
  if (level >= 40) return 'warn';
  if (level >= 30) return 'info';
  return 'debug';
};

// Logging must never throw into the request path; swallow sink/serialisation errors.
// This is the single server-side emission point, so it stamps the service
// identity authoritatively (last write wins) for every frontend record —
// server-logger output and forwarded browser logs alike.
export const writeServerLogRecord = (record: Record<string, unknown>): void => {
  try {
    const env = getServerEnv();
    const enriched: Record<string, unknown> = {
      ...record,
      application: env.APPLICATION_NAME,
      env: env.NODE_ENV,
    };
    if (isRemoteLoggingEnabled()) {
      cachedSink ??= resolveActiveLogSink(buildSinkConfig());
      void cachedSink.emit(JSON.stringify(enriched));
      return;
    }
    const level = typeof enriched.level === 'number' ? enriched.level : 30;
    console[consoleMethodForLevel(level)](JSON.stringify(enriched));
  } catch {
    // Intentionally ignored — a logging failure must not break the caller.
  }
};
