import type { RuntimeEnvironment } from './log-level.defaults';

// The transport contract every sink implements. `emit` is synchronous
// fire-and-forget from the caller's perspective — a sink buffers internally
// and must never make application code wait on delivery or see a delivery
// error. `flush` waits (bounded) for buffered records to drain; `shutdown`
// stops accepting records. Implementations: stdout-sink.ts (default and
// fallback), http-otlp-sink.ts, seq-sink.ts; resolve-log-sink.ts owns
// selecting and instantiating one per process.
export interface LogSink {
  emit: (serializedRecord: string) => void | Promise<void>;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export const SUPPORTED_LOG_SINK_TYPES = ['stdout', 'http_otlp', 'seq'] as const;

export type LogSinkType = (typeof SUPPORTED_LOG_SINK_TYPES)[number];

// One knob surface for every sink type, mirroring the LOG_* env vars declared
// in both apps' env schemas (see the package CONTEXT.md: add a knob in all
// three places or not at all). Sinks ignore the knobs that don't apply to
// them — stdout uses none, seq has no circuit breaker.
export interface LogSinkConfig {
  sinkType: LogSinkType;
  serviceName: string;
  environment: RuntimeEnvironment;
  seqServerUrl?: string;
  seqApiKey?: string;
  otlpEndpoint?: string;
  timeoutMs: number;
  batchSize: number;
  queueSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  backoffJitterFactor: number;
  failureFallbackThreshold: number;
  initFailureFallbackThreshold: number;
  circuitOpenMs: number;
  shutdownDrainTimeoutMs: number;
}
