import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

import type { Env } from '../../config/env.schema';
import { registerProcessMetrics } from './metrics';

/**
 * Backend-only OpenTelemetry tracing + metrics bootstrap.
 *
 * This must run BEFORE NestFactory / Express / Prisma are imported so the
 * HTTP/Express/Prisma instrumentations can patch those modules at require time
 * (see main.ts). The frontend is out of scope — this starts telemetry at the
 * backend boundary. Traces and metrics share one `NodeSDK` (and one `Resource`/
 * service name) and are gated per-signal by `OTEL_TRACES_ENABLED` /
 * `OTEL_METRICS_ENABLED`.
 */

export interface BackendTelemetryOptions {
  /**
   * Build-time OpenAPI extraction boots the Nest app with no real runtime;
   * tracing is skipped there (mirrors how PrismaService is skipped). Defaults to
   * reading `process.env.OPENAPI_EXTRACT`.
   */
  readonly openApiExtract?: boolean;
}

export interface BackendTelemetryHandle {
  /** Whether the OTel SDK was actually started. */
  readonly enabled: boolean;
  /** Drains and shuts down the SDK; safe to call when disabled (no-op). */
  shutdown: () => Promise<void>;
}

/**
 * Whether the OTel SDK should run for this process: at least one signal
 * (traces or metrics) is enabled. Off unless explicitly enabled, and always
 * off during OpenAPI extraction. Per-signal gating happens in
 * {@link buildTelemetrySdkConfig}.
 */
export function resolveTelemetryEnablement(env: Env, options?: BackendTelemetryOptions): boolean {
  const openApiExtract = options?.openApiExtract ?? process.env['OPENAPI_EXTRACT'] === 'true';

  return (env.OTEL_TRACES_ENABLED === true || env.OTEL_METRICS_ENABLED === true) && !openApiExtract;
}

/**
 * Whether metrics specifically should run (the metric reader is configured and
 * process metrics are registered). A subset of
 * {@link resolveTelemetryEnablement}; metrics are always off during OpenAPI
 * extraction and in tests/local default (the env flag defaults off).
 */
export function resolveMetricsEnablement(env: Env, options?: BackendTelemetryOptions): boolean {
  const openApiExtract = options?.openApiExtract ?? process.env['OPENAPI_EXTRACT'] === 'true';

  return env.OTEL_METRICS_ENABLED === true && !openApiExtract;
}

/**
 * Builds the `NodeSDK` configuration: per-signal exporters (OTLP HTTP traces
 * with a `TraceIdRatioBasedSampler`; an OTLP HTTP periodic metric reader), the
 * resolved service name shared by both signals, and the explicit
 * HTTP/Express/Prisma instrumentations.
 *
 * A DISABLED signal is pinned to explicit empty config — `spanProcessors: []`
 * / `metricReaders: []` — never left absent. `NodeSDK` (>=0.2xx) falls back to
 * env-derived config for an absent signal, and the OTel env spec DEFAULTS
 * `OTEL_TRACES_EXPORTER`/`OTEL_METRICS_EXPORTER` to `otlp`: an omitted section
 * would silently create a default OTLP exporter and export the disabled
 * signal anyway (unexpected egress, env-contract break). An explicit empty
 * array takes the SDK's manual-config branch, whose `length > 0` guard then
 * skips registering that signal's provider entirely. `logRecordProcessors` is
 * always pinned empty for the same reason — application logs flow through
 * pino, never the OTel logs SDK.
 *
 * Pure and side-effect free so it can be asserted on in unit tests without
 * starting the SDK (the metric reader's export timer only starts once a
 * MeterProvider registers the reader, i.e. on `sdk.start()`).
 */
export function buildTelemetrySdkConfig(
  env: Env,
): NonNullable<ConstructorParameters<typeof NodeSDK>[0]> {
  const tracesEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const metricsEndpoint = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  const serviceName = env.OTEL_SERVICE_NAME ?? env.APPLICATION_NAME;

  return {
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PrismaInstrumentation(),
    ],
    logRecordProcessors: [],
    ...(env.OTEL_TRACES_ENABLED
      ? {
          traceExporter: new OTLPTraceExporter(tracesEndpoint ? { url: tracesEndpoint } : {}),
          sampler: new TraceIdRatioBasedSampler(env.OTEL_TRACES_SAMPLE_RATE),
        }
      : { spanProcessors: [] }),
    ...(env.OTEL_METRICS_ENABLED
      ? {
          metricReaders: [
            new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter(metricsEndpoint ? { url: metricsEndpoint } : {}),
            }),
          ],
        }
      : { metricReaders: [] }),
  };
}

function createNoopHandle(): BackendTelemetryHandle {
  return {
    enabled: false,
    shutdown: async () => {
      // No SDK was started; nothing to drain.
    },
  };
}

/**
 * Drains the SDK with a bounded timeout so shutdown never blocks forever — the
 * budget reuses the established `LOG_HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS` style.
 */
async function shutdownWithTimeout(sdk: NodeSDK, drainTimeoutMs: number): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeout = new Promise<void>((resolve) => {
    timeoutHandle = setTimeout(resolve, drainTimeoutMs);
    timeoutHandle.unref();
  });

  try {
    await Promise.race([sdk.shutdown().catch(() => undefined), timeout]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Starts backend telemetry (tracing and/or metrics) when enabled; otherwise
 * returns a no-op handle. Returns a handle whose `shutdown()` drains spans and
 * metrics on Nest close / SIGTERM.
 */
export function startBackendTelemetry(
  env: Env,
  options?: BackendTelemetryOptions,
): BackendTelemetryHandle {
  if (!resolveTelemetryEnablement(env, options)) {
    return createNoopHandle();
  }

  const sdk = new NodeSDK(buildTelemetrySdkConfig(env));
  sdk.start();

  // The SDK registered the global MeterProvider above, so the process-level
  // observables bind to the real meter (no-op when metrics are off).
  if (resolveMetricsEnablement(env, options)) {
    registerProcessMetrics();
  }

  const drainTimeoutMs = env.LOG_HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS;
  let shutdownPromise: Promise<void> | undefined;

  return {
    enabled: true,
    shutdown: () => {
      shutdownPromise ??= shutdownWithTimeout(sdk, drainTimeoutMs);
      return shutdownPromise;
    },
  };
}
