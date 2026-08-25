import { context, metrics, propagation, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { PrismaInstrumentation } from '@prisma/instrumentation';

import { envSchema, type Env } from '../src/config/env.schema';
import {
  buildTelemetrySdkConfig,
  resolveMetricsEnablement,
  resolveTelemetryEnablement,
  startBackendTelemetry,
} from '../src/common/telemetry/backend-telemetry';

const baseEnvInput = {
  NODE_ENV: 'test',
  PORT: '3100',
  DATABASE_URL: 'postgresql://postgres:@localhost:5433/llstack_test',
  BACKEND_API_SECRET: 'api-secret',
  ADMIN_API_KEY: 'admin-key',
  FRONTEND_PUBLIC_URL: 'https://app.example.test',
};

function parseEnv(overrides: Record<string, unknown> = {}): Env {
  return envSchema.parse({ ...baseEnvInput, ...overrides });
}

describe('resolveTelemetryEnablement', () => {
  it('is disabled when OTEL_TRACES_ENABLED is false', () => {
    expect(resolveTelemetryEnablement(parseEnv(), { openApiExtract: false })).toBe(false);
  });

  it('is enabled when tracing is on and not extracting OpenAPI', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
    });

    expect(resolveTelemetryEnablement(env, { openApiExtract: false })).toBe(true);
  });

  it('is disabled during OpenAPI extraction even when tracing is on', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
    });

    expect(resolveTelemetryEnablement(env, { openApiExtract: true })).toBe(false);
  });

  it('is enabled for a metrics-only configuration (traces off)', () => {
    const env = parseEnv({
      OTEL_METRICS_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
    });

    expect(resolveTelemetryEnablement(env, { openApiExtract: false })).toBe(true);
  });
});

describe('resolveMetricsEnablement', () => {
  it('mirrors trace enablement when OTEL_METRICS_ENABLED is omitted', () => {
    expect(resolveMetricsEnablement(parseEnv(), { openApiExtract: false })).toBe(false);

    const mirrored = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
    });
    expect(resolveMetricsEnablement(mirrored, { openApiExtract: false })).toBe(true);
  });

  it('can be switched off independently of tracing', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      OTEL_METRICS_ENABLED: 'false',
    });

    expect(resolveMetricsEnablement(env, { openApiExtract: false })).toBe(false);
    expect(resolveTelemetryEnablement(env, { openApiExtract: false })).toBe(true);
  });

  it('is disabled during OpenAPI extraction even when metrics are on', () => {
    const env = parseEnv({
      OTEL_METRICS_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
    });

    expect(resolveMetricsEnablement(env, { openApiExtract: true })).toBe(false);
  });
});

describe('buildTelemetrySdkConfig', () => {
  it('constructs the OTLP exporter, ratio sampler, and the three instrumentations', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      OTEL_TRACES_SAMPLE_RATE: '0.5',
    });

    const config = buildTelemetrySdkConfig(env);

    expect(config.traceExporter).toBeInstanceOf(OTLPTraceExporter);
    expect(config.sampler).toBeInstanceOf(TraceIdRatioBasedSampler);
    expect(config.sampler?.toString()).toContain('0.5');

    const instrumentations = (config.instrumentations ?? []).flat();
    expect(instrumentations).toHaveLength(3);
    expect(instrumentations.some((i) => i instanceof HttpInstrumentation)).toBe(true);
    expect(instrumentations.some((i) => i instanceof ExpressInstrumentation)).toBe(true);
    expect(instrumentations.some((i) => i instanceof PrismaInstrumentation)).toBe(true);
  });

  it('includes an OTLP periodic metric reader when metrics are enabled (mirrored from traces)', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
    });

    const config = buildTelemetrySdkConfig(env);

    expect(config.metricReaders).toHaveLength(1);
    expect(config.metricReaders?.[0]).toBeInstanceOf(PeriodicExportingMetricReader);
  });

  it('pins metricReaders to an explicit empty array when OTEL_METRICS_ENABLED is false', () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      OTEL_METRICS_ENABLED: 'false',
    });

    const config = buildTelemetrySdkConfig(env);

    // MUST be [] and not absent: an absent metrics section makes NodeSDK fall
    // back to env config, whose spec default (`OTEL_METRICS_EXPORTER=otlp`)
    // would create a default OTLP metric reader and export the disabled signal.
    expect(config.metricReaders).toEqual([]);
    expect(config.traceExporter).toBeInstanceOf(OTLPTraceExporter);
  });

  it('pins spanProcessors empty (no exporter/sampler) for a metrics-only configuration', () => {
    const env = parseEnv({
      OTEL_METRICS_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
    });

    const config = buildTelemetrySdkConfig(env);

    expect(config.traceExporter).toBeUndefined();
    expect(config.sampler).toBeUndefined();
    // Same env-fallback hazard as metrics: absent tracer config would yield a
    // default OTLP span processor (`OTEL_TRACES_EXPORTER=otlp` spec default).
    expect(config.spanProcessors).toEqual([]);
    expect(config.metricReaders).toHaveLength(1);
  });

  it('always pins logRecordProcessors empty — application logs flow through pino', () => {
    const tracesOnly = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      OTEL_METRICS_ENABLED: 'false',
    });
    const metricsOnly = parseEnv({
      OTEL_METRICS_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
    });

    expect(buildTelemetrySdkConfig(tracesOnly).logRecordProcessors).toEqual([]);
    expect(buildTelemetrySdkConfig(metricsOnly).logRecordProcessors).toEqual([]);
  });
});

describe('per-signal global registration (start-level regression)', () => {
  // Regression for the NodeSDK env-fallback hazard: a DISABLED signal must not
  // register its global provider at start (an absent config section would have
  // the SDK build default OTLP exporters from env-spec defaults). The real SDK
  // is started (no start() mock); instrumentations are stripped so the shared
  // test process's http/express/prisma modules are never monkey-patched.
  let setMeterProviderSpy: jest.SpyInstance;
  let setTracerProviderSpy: jest.SpyInstance;

  beforeEach(() => {
    setMeterProviderSpy = jest.spyOn(metrics, 'setGlobalMeterProvider');
    setTracerProviderSpy = jest.spyOn(trace, 'setGlobalTracerProvider');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Unregister whatever the real start() registered. The empty-processor
    // LoggerProvider global needs no cleanup (api-logs is not a direct dep and
    // nothing emits OTel log records — it is inert by construction).
    trace.disable();
    metrics.disable();
    context.disable();
    propagation.disable();
  });

  async function startSdkWithoutInstrumentations(env: Env): Promise<NodeSDK> {
    const { NodeSDK: NodeSDKCtor } = await import('@opentelemetry/sdk-node');
    const sdk = new NodeSDKCtor({ ...buildTelemetrySdkConfig(env), instrumentations: [] });
    sdk.start();
    return sdk;
  }

  it('traces-only: registers a tracer provider and NO meter provider', async () => {
    const env = parseEnv({
      OTEL_TRACES_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      OTEL_METRICS_ENABLED: 'false',
    });

    const sdk = await startSdkWithoutInstrumentations(env);
    try {
      expect(setTracerProviderSpy).toHaveBeenCalledTimes(1);
      expect(setMeterProviderSpy).not.toHaveBeenCalled();
    } finally {
      await sdk.shutdown().catch(() => undefined);
    }
  });

  it('metrics-only: registers a meter provider and NO tracer provider', async () => {
    const env = parseEnv({
      OTEL_METRICS_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://localhost:4318/v1/metrics',
    });

    const sdk = await startSdkWithoutInstrumentations(env);
    try {
      expect(setMeterProviderSpy).toHaveBeenCalledTimes(1);
      expect(setTracerProviderSpy).not.toHaveBeenCalled();
    } finally {
      await sdk.shutdown().catch(() => undefined);
    }
  });
});

describe('startBackendTelemetry', () => {
  it('returns a no-op handle when tracing is disabled', async () => {
    const handle = startBackendTelemetry(parseEnv(), { openApiExtract: false });

    expect(handle.enabled).toBe(false);
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it('starts the SDK and delegates shutdown when tracing is enabled', async () => {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const sdkStart = jest.spyOn(NodeSDK.prototype, 'start').mockReturnValue(undefined);
    const sdkShutdown = jest.spyOn(NodeSDK.prototype, 'shutdown').mockResolvedValue(undefined);

    try {
      const env = parseEnv({
        OTEL_TRACES_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4318/v1/traces',
      });

      const handle = startBackendTelemetry(env, { openApiExtract: false });

      expect(handle.enabled).toBe(true);
      expect(sdkStart).toHaveBeenCalledTimes(1);

      await handle.shutdown();

      expect(sdkShutdown).toHaveBeenCalledTimes(1);
    } finally {
      sdkStart.mockRestore();
      sdkShutdown.mockRestore();
    }
  });
});
