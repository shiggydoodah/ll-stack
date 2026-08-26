// Node-only barrel: resolve-log-sink pulls in node:stream. Browser and edge
// code imports '@repo/logging/shared' instead (see shared.ts).
//
// Sink internals (stdout-sink, sink-delivery, payload mappers, the per-sink
// config/dependency types) are deliberately not re-exported: consumers
// configure sinks through LogSinkConfig and resolveActiveLogSink, and the
// sink classes surface here only so tests can construct them with injected
// dependencies.
export type { LogSink, LogSinkConfig, LogSinkType } from './log-sink';
export { SUPPORTED_LOG_SINK_TYPES } from './log-sink';
export { HttpOtlpLogSink } from './http-otlp-sink';
export { SeqLogSink } from './seq-sink';
export {
  __resetActiveLogSinkForTests,
  createPinoSinkStream,
  resolveActiveLogSink,
  shutdownActiveLogSink,
} from './resolve-log-sink';
export * from './log-redaction';
export * from './log-level.defaults';
export * from './request-path';
