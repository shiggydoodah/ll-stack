import {
  metrics,
  ValueType,
  type Attributes,
  type Context,
  type Counter,
  type Histogram,
  type Meter,
  type MetricOptions,
  type UpDownCounter,
} from '@opentelemetry/api';

/**
 * Typed metrics helper over the OTel API global meter.
 *
 * D8 / cardinality rule — applies to EVERY attribute (label) recorded through
 * this module: attribute values are COARSE ENUMS and OPAQUE IDS ONLY (verdict,
 * outcome, usage, size bucket). Never storage keys, signed URLs, emails, raw
 * user input, or any other per-user/high-cardinality value. Instrument names
 * and their allowed attribute keys are centralised in this file as constants
 * so call sites cannot invent new labels — add new instruments HERE, with
 * their allowed keys, never inline at a call site.
 *
 * Instruments are LAZY and no-op-safe: each `add`/`record` resolves the
 * instrument from the CURRENT global `MeterProvider` at call time. When
 * telemetry is disabled (tests, local default) no provider is registered, the
 * API returns its no-op meter, and recording is a silent no-op — importing
 * this module never starts an exporter. When the provider IS registered
 * (NodeSDK start, or a test-local `MeterProvider`), the SDK dedupes repeated
 * `create*` calls with an identical descriptor onto the same storage, so
 * per-call resolution is safe and late-binding.
 */

/** The instrumentation-scope name shared by every backend-owned instrument. */
export const BACKEND_METER_NAME = 'llstack-backend';

/**
 * Duration histograms record SECONDS (OTel convention). Bucket boundaries
 * cover the backend's working range: sub-10ms fast paths (signed-URL minting,
 * DB reads) through multi-second scanner/storage round-trips.
 */
export const DURATION_SECONDS_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

/**
 * Attribute shape for an instrument declared with allowed keys `K`. Values
 * are plain strings because every allowed label is a coarse enum member or an
 * opaque enum-like token (see the D8 rule above).
 */
export type MetricAttributes<K extends string> = Partial<Record<K, string>>;

function resolveMeter(): Meter {
  return metrics.getMeter(BACKEND_METER_NAME);
}

/**
 * Lazy counter. `name` must be a constant declared in this file (see the
 * header rule); `A` pins the allowed attribute keys at the type level.
 */
export function counter<A extends Attributes = Attributes>(
  name: string,
  options?: MetricOptions,
): Counter<A> {
  return {
    add: (value: number, attributes?: A, context?: Context): void => {
      try {
        resolveMeter().createCounter<A>(name, options).add(value, attributes, context);
      } catch {
        // Recording must never break the operation being measured.
      }
    },
  };
}

/** Lazy up/down counter (gauge-like additive instrument). */
export function upDownCounter<A extends Attributes = Attributes>(
  name: string,
  options?: MetricOptions,
): UpDownCounter<A> {
  return {
    add: (value: number, attributes?: A, context?: Context): void => {
      try {
        resolveMeter().createUpDownCounter<A>(name, options).add(value, attributes, context);
      } catch {
        // Recording must never break the operation being measured.
      }
    },
  };
}

/** Lazy histogram. Prefer {@link durationHistogram} for timings. */
export function histogram<A extends Attributes = Attributes>(
  name: string,
  options?: MetricOptions,
): Histogram<A> {
  return {
    record: (value: number, attributes?: A, context?: Context): void => {
      try {
        resolveMeter().createHistogram<A>(name, options).record(value, attributes, context);
      } catch {
        // Recording must never break the operation being measured.
      }
    },
  };
}

/**
 * Duration histogram in SECONDS with the shared {@link DURATION_SECONDS_BUCKETS}
 * boundaries (applied via metric advice, so a view can still override them).
 */
export function durationHistogram<A extends Attributes = Attributes>(
  name: string,
  description: string,
): Histogram<A> {
  return histogram<A>(name, {
    description,
    unit: 's',
    valueType: ValueType.DOUBLE,
    advice: { explicitBucketBoundaries: [...DURATION_SECONDS_BUCKETS] },
  });
}

/**
 * One-shot duration timer shared by metric histograms (seconds) and log
 * payloads (`durationMs`) so both report the same measurement. Call the
 * returned function at a terminal point to read the elapsed time; it can be
 * read more than once (each read is "elapsed since start").
 */
export interface ElapsedDuration {
  readonly seconds: number;
  readonly millis: number;
}

export function startDurationTimer(): () => ElapsedDuration {
  const startedAt = process.hrtime.bigint();
  return () => {
    const elapsedNs = Number(process.hrtime.bigint() - startedAt);
    return { seconds: elapsedNs / 1e9, millis: Math.round(elapsedNs / 1e6) };
  };
}

/** Process-level metric names (registered by {@link registerProcessMetrics}). */
export const PROCESS_METRIC_NAMES = {
  uptimeSeconds: 'process_uptime_seconds',
} as const;

/**
 * Registers the always-on process-level observables. Called from
 * `startBackendTelemetry` AFTER the SDK has registered the global
 * `MeterProvider`, so the callbacks bind to the real meter; calling it with
 * telemetry disabled binds to the no-op meter and observes nothing.
 */
export function registerProcessMetrics(): void {
  const uptime = resolveMeter().createObservableGauge(PROCESS_METRIC_NAMES.uptimeSeconds, {
    description: 'Seconds since the backend process started.',
    unit: 's',
    valueType: ValueType.DOUBLE,
  });
  uptime.addCallback((result) => {
    result.observe(process.uptime());
  });
}
