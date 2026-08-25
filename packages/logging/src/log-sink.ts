import { Writable } from 'node:stream';

import type { RuntimeEnvironment } from './log-level.defaults';

export interface LogSink {
  emit: (serializedRecord: string) => void | Promise<void>;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export const SUPPORTED_LOG_SINK_TYPES = ['stdout', 'http_otlp', 'seq'] as const;

export type LogSinkType = (typeof SUPPORTED_LOG_SINK_TYPES)[number];

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

type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtlpAnyValue[] } };

interface ActiveLogSinkState {
  readonly type: string;
  readonly sink: LogSink;
}

interface HttpRequestInit {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly signal: AbortSignal;
}

interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
}

interface HttpOtlpSinkDependencies {
  readonly fetchFn: (endpoint: string, init: HttpRequestInit) => Promise<HttpResponseLike>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly random: () => number;
  readonly initialize: () => Promise<void>;
}

interface HttpOtlpSinkConfig {
  readonly endpoint: string;
  readonly serviceName: string;
  readonly environment: RuntimeEnvironment;
  readonly timeoutMs: number;
  readonly batchSize: number;
  readonly queueSize: number;
  readonly flushIntervalMs: number;
  readonly maxRetries: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly backoffJitterFactor: number;
  readonly failureFallbackThreshold: number;
  readonly initFailureFallbackThreshold?: number;
  readonly circuitOpenMs: number;
  readonly shutdownDrainTimeoutMs: number;
}

interface SeqSinkDependencies {
  readonly fetchFn: (endpoint: string, init: HttpRequestInit) => Promise<HttpResponseLike>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly random: () => number;
}

interface SeqSinkConfig {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
  readonly batchSize: number;
  readonly queueSize: number;
  readonly flushIntervalMs: number;
  readonly maxRetries: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly backoffJitterFactor: number;
  readonly shutdownDrainTimeoutMs: number;
}

const DEFAULT_LOG_SINK_TYPE: LogSinkType = 'stdout';
const LOG_SINK_DISPATCH_CONTEXT = '[logging]';
const OPERATIONAL_WARNING_THROTTLE_MS = 5_000;
const MAX_OTLP_ATTRIBUTE_COUNT = 64;
const MAX_OTLP_ARRAY_VALUE_COUNT = 20;
const MAX_STRING_VALUE_LENGTH = 4_096;

class StdoutLogSink implements LogSink {
  public emit(serializedRecord: string): void {
    if (serializedRecord.length === 0) {
      return;
    }

    process.stdout.write(serializedRecord);
  }

  public async flush(): Promise<void> {
    return Promise.resolve();
  }

  public async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export class HttpOtlpLogSink implements LogSink {
  private readonly config: HttpOtlpSinkConfig;

  private readonly dependencies: HttpOtlpSinkDependencies;

  private readonly fallbackSink: LogSink;

  private readonly queue: string[] = [];

  private readonly drainWaiters: Array<(didDrain: boolean) => void> = [];

  private readonly warningLastEmittedAtMsByKey = new Map<string, number>();

  private dispatchLoopPromise: Promise<void> | null = null;

  private initializationPromise: Promise<void> | null = null;

  private isInitialized = false;

  private initializationFailureCount = 0;

  private isShutdownRequested = false;

  private circuitOpenUntilMs: number | null = null;

  private consecutiveFailedBatches = 0;

  private inFlightRecordCount = 0;

  private readonly requestHeaders: Record<string, string> = {
    'content-type': 'application/json',
  };

  public constructor(
    config: HttpOtlpSinkConfig,
    dependencies: Partial<HttpOtlpSinkDependencies> = {},
    fallbackSink: LogSink = new StdoutLogSink(),
  ) {
    this.config = config;
    this.dependencies = {
      fetchFn: async (endpoint: string, init: HttpRequestInit): Promise<HttpResponseLike> => {
        const response = await fetch(endpoint, init);

        return {
          ok: response.ok,
          status: response.status,
        };
      },
      sleep: (ms: number): Promise<void> =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }),
      now: () => Date.now(),
      random: () => Math.random(),
      initialize: () => Promise.resolve(),
      ...dependencies,
    };
    this.fallbackSink = fallbackSink;
  }

  public emit(serializedRecord: string): void {
    if (serializedRecord.length === 0) {
      return;
    }

    this.refreshCircuitState();

    if (this.isShutdownRequested || this.isCircuitOpen()) {
      this.writeRecordToFallback(serializedRecord, 'sink_unavailable');
      return;
    }

    if (this.queue.length >= this.config.queueSize) {
      this.writeOperationalWarning(
        'queue_full',
        'HTTP sink queue is full; evicting oldest entry.',
        {
          queueSize: this.config.queueSize,
        },
        OPERATIONAL_WARNING_THROTTLE_MS,
      );
      this.queue.shift();
    }

    this.queue.push(serializedRecord);
    this.ensureDispatchLoop();
  }

  public async flush(): Promise<void> {
    this.ensureDispatchLoop();

    const didDrain = await this.waitForDrain(this.config.shutdownDrainTimeoutMs);

    if (didDrain) {
      return;
    }

    this.writeOperationalWarning(
      'drain_timeout',
      'HTTP sink drain timed out; flushing queued records to stdout fallback.',
      {
        timeoutMs: this.config.shutdownDrainTimeoutMs,
        queuedRecords: this.queue.length,
        inFlightRecords: this.inFlightRecordCount,
      },
    );

    await this.flushQueueToFallback('drain_timeout');
  }

  public async shutdown(): Promise<void> {
    this.isShutdownRequested = true;
    await this.fallbackSink.shutdown();
  }

  private ensureDispatchLoop(): void {
    if (this.dispatchLoopPromise) {
      return;
    }

    this.dispatchLoopPromise = this.runDispatchLoop().finally(() => {
      this.dispatchLoopPromise = null;
      this.resolveDrainWaitersIfIdle();

      if (this.queue.length > 0 && !this.isShutdownRequested) {
        this.ensureDispatchLoop();
      }
    });
  }

  private async runDispatchLoop(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    try {
      try {
        await this.ensureInitialized();
        this.initializationFailureCount = 0;
      } catch (error) {
        this.initializationFailureCount += 1;
        const initFailureFallbackThreshold = this.resolveInitFailureFallbackThreshold();

        if (
          this.initializationFailureCount >= initFailureFallbackThreshold &&
          !this.isShutdownRequested
        ) {
          this.writeOperationalWarning(
            'init_failure_threshold',
            'HTTP sink initialization failure threshold reached; opening circuit and routing queued records to stdout fallback.',
            {
              attempt: this.initializationFailureCount,
              initFailureFallbackThreshold,
            },
          );
          this.openCircuit();
          await this.flushQueueToFallback('init_failure_threshold');
          return;
        }

        const retryDelayMs = this.resolveRetryDelayMs(this.initializationFailureCount - 1);

        this.writeOperationalWarning(
          'init_failed',
          'HTTP sink initialization failed; retrying after backoff.',
          {
            attempt: this.initializationFailureCount,
            nextDelayMs: retryDelayMs,
            error: this.resolveErrorMessage(error),
          },
          OPERATIONAL_WARNING_THROTTLE_MS,
        );

        if (!this.isShutdownRequested) {
          await this.dependencies.sleep(retryDelayMs);
        }

        return;
      }

      while (this.queue.length > 0 && !this.isShutdownRequested) {
        this.refreshCircuitState();

        if (this.isCircuitOpen()) {
          await this.flushQueueToFallback('circuit_open');
          return;
        }

        const batch = this.queue.splice(0, this.config.batchSize);

        if (batch.length === 0) {
          break;
        }

        const didDeliverBatch = await this.deliverBatchWithRetry(batch);

        if (!didDeliverBatch) {
          this.consecutiveFailedBatches += 1;

          await this.writeBatchToFallback(batch, 'delivery_exhausted');

          if (this.consecutiveFailedBatches >= this.config.failureFallbackThreshold) {
            this.openCircuit();
            await this.flushQueueToFallback('failure_threshold');
            return;
          }
        } else {
          this.consecutiveFailedBatches = 0;
        }

        if (this.config.flushIntervalMs > 0 && this.queue.length > 0) {
          await this.dependencies.sleep(this.config.flushIntervalMs);
        }
      }
    } finally {
      this.resolveDrainWaitersIfIdle();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      await this.dependencies.initialize();
      this.isInitialized = true;
    })().finally(() => {
      this.initializationPromise = null;
    });

    return this.initializationPromise;
  }

  private async deliverBatchWithRetry(batch: readonly string[]): Promise<boolean> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const attemptNumber = attempt + 1;

      try {
        this.inFlightRecordCount = batch.length;
        await this.sendBatch(batch);
        this.inFlightRecordCount = 0;

        return true;
      } catch (error) {
        this.inFlightRecordCount = 0;

        if (attempt >= this.config.maxRetries) {
          this.writeOperationalWarning(
            'delivery_failed',
            'HTTP sink batch delivery failed after retries; switching this batch to stdout fallback.',
            {
              attempt: attemptNumber,
              maxRetries: this.config.maxRetries,
              error: this.resolveErrorMessage(error),
              batchSize: batch.length,
            },
          );

          return false;
        }

        const retryDelayMs = this.resolveRetryDelayMs(attempt);

        this.writeOperationalWarning(
          'delivery_retry',
          'HTTP sink batch delivery failed; retrying with backoff.',
          {
            attempt: attemptNumber,
            nextDelayMs: retryDelayMs,
            error: this.resolveErrorMessage(error),
            batchSize: batch.length,
          },
        );

        if (this.isShutdownRequested) {
          return false;
        }

        await this.dependencies.sleep(retryDelayMs);
      }
    }

    return false;
  }

  private resolveRetryDelayMs(retryAttemptIndex: number): number {
    const exponentialDelayMs = Math.min(
      this.config.backoffMaxMs,
      this.config.backoffBaseMs * 2 ** retryAttemptIndex,
    );

    if (this.config.backoffJitterFactor <= 0) {
      return exponentialDelayMs;
    }

    const jitterRangeMs = Math.floor(exponentialDelayMs * this.config.backoffJitterFactor);

    if (jitterRangeMs === 0) {
      return exponentialDelayMs;
    }

    const randomOffset = Math.floor(this.dependencies.random() * (jitterRangeMs * 2 + 1));
    const jitterOffsetMs = randomOffset - jitterRangeMs;

    return Math.max(0, exponentialDelayMs + jitterOffsetMs);
  }

  private resolveInitFailureFallbackThreshold(): number {
    const configuredThreshold = this.config.initFailureFallbackThreshold;

    if (
      typeof configuredThreshold === 'number' &&
      Number.isInteger(configuredThreshold) &&
      configuredThreshold > 0
    ) {
      return configuredThreshold;
    }

    return this.config.failureFallbackThreshold;
  }

  private async sendBatch(batch: readonly string[]): Promise<void> {
    const payload = this.buildOtlpPayload(batch);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.timeoutMs);

    try {
      const response = await this.dependencies.fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: this.requestHeaders,
        body: payload,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildOtlpPayload(batch: readonly string[]): string {
    const parsedRecords = batch
      .map((record) => this.parseRecord(record))
      .filter((record): record is Record<string, unknown> => record !== null);

    const resourceAttributes = [
      {
        key: 'service.name',
        value: {
          stringValue: this.config.serviceName,
        },
      },
      {
        key: 'deployment.environment.name',
        value: {
          stringValue: this.config.environment,
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
              logRecords: parsedRecords.map((record) =>
                this.transformRecordToOtlpLogRecord(record),
              ),
            },
          ],
        },
      ],
    });
  }

  private parseRecord(serializedRecord: string): Record<string, unknown> | null {
    const trimmedRecord = serializedRecord.trim();

    if (trimmedRecord.length === 0) {
      return null;
    }

    try {
      const parsedRecord = JSON.parse(trimmedRecord) as unknown;

      if (
        typeof parsedRecord === 'object' &&
        parsedRecord !== null &&
        !Array.isArray(parsedRecord)
      ) {
        return parsedRecord as Record<string, unknown>;
      }

      return {
        message: trimmedRecord,
      };
    } catch {
      return {
        message: trimmedRecord,
      };
    }
  }

  private transformRecordToOtlpLogRecord(record: Record<string, unknown>): {
    timeUnixNano: string;
    observedTimeUnixNano: string;
    severityNumber: number;
    severityText: string;
    body: OtlpAnyValue;
    attributes: Array<{
      key: string;
      value: OtlpAnyValue;
    }>;
  } {
    const severityText = this.resolveSeverityText(record.level);
    const severityNumber = this.resolveSeverityNumber(severityText);
    const message = this.resolveMessage(record);
    const timestamp = this.resolveTimestampNanoseconds(record);

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
        value: this.toOtlpAnyValue(value),
      }));

    return {
      timeUnixNano: timestamp,
      observedTimeUnixNano: timestamp,
      severityNumber,
      severityText,
      body: {
        stringValue: this.sanitizeStringValue(message),
      },
      attributes,
    };
  }

  private resolveSeverityText(level: unknown): string {
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

  private resolveSeverityNumber(severityText: string): number {
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

  private resolveMessage(record: Record<string, unknown>): string {
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

  private resolveTimestampNanoseconds(record: Record<string, unknown>): string {
    const timestamp = record.timestamp;
    const fallbackTimestampMs = this.dependencies.now();

    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      return this.toNanosecondsString(timestamp);
    }

    if (typeof timestamp === 'string') {
      const parsedTimestampMs = Date.parse(timestamp);

      if (Number.isFinite(parsedTimestampMs)) {
        return this.toNanosecondsString(parsedTimestampMs);
      }
    }

    // Support pino's default numeric `time` field when custom timestamp key is unavailable.
    const pinoTimeCandidate = record.time;

    if (typeof pinoTimeCandidate === 'number' && Number.isFinite(pinoTimeCandidate)) {
      return this.toNanosecondsString(pinoTimeCandidate);
    }

    return this.toNanosecondsString(fallbackTimestampMs);
  }

  private toNanosecondsString(milliseconds: number): string {
    // toNanosecondsString expects epoch milliseconds (for example pino `time`).
    // safeMilliseconds comes from a finite input or this.dependencies.now(), then converts ms -> ns.
    const safeMilliseconds = Number.isFinite(milliseconds)
      ? Math.trunc(milliseconds)
      : this.dependencies.now();

    return (BigInt(safeMilliseconds) * 1_000_000n).toString();
  }

  private toOtlpAnyValue(value: unknown): OtlpAnyValue {
    if (typeof value === 'string') {
      return {
        stringValue: this.sanitizeStringValue(value),
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
          values: value
            .slice(0, MAX_OTLP_ARRAY_VALUE_COUNT)
            .map((entry) => this.toOtlpAnyValue(entry)),
        },
      };
    }

    if (value === null || value === undefined) {
      return {
        stringValue: String(value),
      };
    }

    return {
      stringValue: this.sanitizeStringValue(this.safeJsonStringify(value)),
    };
  }

  private sanitizeStringValue(value: string): string {
    if (value.length <= MAX_STRING_VALUE_LENGTH) {
      return value;
    }

    return `${value.slice(0, MAX_STRING_VALUE_LENGTH)}...`;
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable]';
    }
  }

  private refreshCircuitState(): void {
    if (this.circuitOpenUntilMs === null) {
      return;
    }

    if (this.dependencies.now() < this.circuitOpenUntilMs) {
      return;
    }

    this.circuitOpenUntilMs = null;
    this.consecutiveFailedBatches = 0;
    this.initializationFailureCount = 0;
    this.writeOperationalWarning(
      'circuit_closed',
      'HTTP sink circuit has closed; retrying remote delivery.',
    );
  }

  private openCircuit(): void {
    this.circuitOpenUntilMs = this.dependencies.now() + this.config.circuitOpenMs;
    this.writeOperationalWarning(
      'circuit_open',
      'HTTP sink circuit opened due to sustained delivery failures; routing to stdout fallback.',
      {
        openForMs: this.config.circuitOpenMs,
        failureFallbackThreshold: this.config.failureFallbackThreshold,
      },
    );
  }

  private isCircuitOpen(): boolean {
    return this.circuitOpenUntilMs !== null && this.dependencies.now() < this.circuitOpenUntilMs;
  }

  private writeOperationalWarning(
    key: string,
    message: string,
    details: Record<string, unknown> = {},
    throttleMs = 0,
  ): void {
    const now = this.dependencies.now();
    const previousEmissionMs = this.warningLastEmittedAtMsByKey.get(key);

    if (
      throttleMs > 0 &&
      previousEmissionMs !== undefined &&
      now - previousEmissionMs < throttleMs
    ) {
      return;
    }

    this.warningLastEmittedAtMsByKey.set(key, now);

    const detailsSuffix =
      Object.keys(details).length === 0 ? '' : ` ${this.safeJsonStringify(details)}`;

    process.stderr.write(`${LOG_SINK_DISPATCH_CONTEXT} ${message}${detailsSuffix}\n`);
  }

  private resolveDrainWaitersIfIdle(): void {
    if (!this.isIdle()) {
      return;
    }

    while (this.drainWaiters.length > 0) {
      const resolveWaiter = this.drainWaiters.shift();

      resolveWaiter?.(true);
    }
  }

  private isIdle(): boolean {
    return (
      this.queue.length === 0 && this.dispatchLoopPromise === null && this.inFlightRecordCount === 0
    );
  }

  private async waitForDrain(timeoutMs: number): Promise<boolean> {
    if (this.isIdle()) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let didSettle = false;

      const timeoutId = setTimeout(() => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        this.removeDrainWaiter(resolveDrainWaiter);
        resolve(false);
      }, timeoutMs);

      const resolveDrainWaiter = (didDrain: boolean): void => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeoutId);
        resolve(didDrain);
      };

      this.drainWaiters.push(resolveDrainWaiter);
    });
  }

  private removeDrainWaiter(targetWaiter: (didDrain: boolean) => void): void {
    const waiterIndex = this.drainWaiters.indexOf(targetWaiter);

    if (waiterIndex === -1) {
      return;
    }

    this.drainWaiters.splice(waiterIndex, 1);
  }

  private async flushQueueToFallback(reason: string): Promise<void> {
    const queuedRecords = this.queue.splice(0, this.queue.length);
    await this.writeBatchToFallback(queuedRecords, reason);
  }

  private async writeBatchToFallback(batch: readonly string[], reason: string): Promise<void> {
    for (const record of batch) {
      await this.writeRecordToFallbackAsync(record, reason);
    }
  }

  private writeRecordToFallback(serializedRecord: string, reason: string): void {
    void this.writeRecordToFallbackAsync(serializedRecord, reason);
  }

  private async writeRecordToFallbackAsync(
    serializedRecord: string,
    reason: string,
  ): Promise<void> {
    try {
      await Promise.resolve(this.fallbackSink.emit(serializedRecord));
    } catch (error) {
      this.writeOperationalWarning(
        'fallback_emit_failed',
        'Stdout fallback emit failed.',
        {
          reason,
          error: this.resolveErrorMessage(error),
        },
        OPERATIONAL_WARNING_THROTTLE_MS,
      );
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}

class NonRetryableSeqHttpError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'NonRetryableSeqHttpError';
    this.status = status;
  }
}

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

const SEQ_RESERVED_ATTRIBUTE_KEYS = new Set(['timestamp', 'time', 'traceId', 'spanId', 'level']);

interface ActiveSeqBatchState {
  readonly records: readonly string[];
  readonly abortController: AbortController;
  didRouteToFallback: boolean;
}

export class SeqLogSink implements LogSink {
  private readonly config: SeqSinkConfig;

  private readonly dependencies: SeqSinkDependencies;

  private readonly fallbackSink: LogSink;

  private readonly queue: string[] = [];

  private readonly drainWaiters: Array<(didDrain: boolean) => void> = [];

  private readonly warningLastEmittedAtMsByKey = new Map<string, number>();

  private readonly drainTimeoutFallbackBatches = new WeakSet<readonly string[]>();

  private dispatchLoopPromise: Promise<void> | null = null;

  private isShutdownRequested = false;

  private inFlightRecordCount = 0;

  private activeBatchState: ActiveSeqBatchState | null = null;

  private readonly requestHeaders: Record<string, string>;

  public constructor(
    config: SeqSinkConfig,
    dependencies: Partial<SeqSinkDependencies> = {},
    fallbackSink: LogSink = new StdoutLogSink(),
  ) {
    this.config = config;
    this.dependencies = {
      fetchFn: async (endpoint: string, init: HttpRequestInit): Promise<HttpResponseLike> => {
        const response = await fetch(endpoint, init);

        return {
          ok: response.ok,
          status: response.status,
        };
      },
      sleep: (ms: number): Promise<void> =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        }),
      now: () => Date.now(),
      random: () => Math.random(),
      ...dependencies,
    };
    this.fallbackSink = fallbackSink;

    const headers: Record<string, string> = {
      'content-type': 'application/vnd.serilog.clef',
    };

    if (typeof config.apiKey === 'string' && config.apiKey.trim().length > 0) {
      headers['x-seq-apikey'] = config.apiKey.trim();
    }

    this.requestHeaders = headers;
  }

  public emit(serializedRecord: string): void {
    if (serializedRecord.length === 0) {
      return;
    }

    if (this.isShutdownRequested) {
      this.writeRecordToFallback(serializedRecord, 'sink_unavailable');
      return;
    }

    if (this.queue.length >= this.config.queueSize) {
      this.writeOperationalWarning(
        'queue_full',
        'Seq sink queue is full; evicting oldest entry.',
        {
          queueSize: this.config.queueSize,
        },
        OPERATIONAL_WARNING_THROTTLE_MS,
      );
      this.queue.shift();
    }

    this.queue.push(serializedRecord);
    this.ensureDispatchLoop();
  }

  public async flush(): Promise<void> {
    this.ensureDispatchLoop();

    const didDrain = await this.waitForDrain(this.config.shutdownDrainTimeoutMs);

    if (didDrain) {
      return;
    }

    this.writeOperationalWarning(
      'drain_timeout',
      'Seq sink drain timed out; flushing queued records to stdout fallback.',
      {
        timeoutMs: this.config.shutdownDrainTimeoutMs,
        queuedRecords: this.queue.length,
        inFlightRecords: this.inFlightRecordCount,
      },
    );

    const activeBatchForDrainTimeout = this.abortActiveBatchForDrainTimeout();

    if (activeBatchForDrainTimeout) {
      await this.writeBatchToFallback(activeBatchForDrainTimeout, 'drain_timeout');
    }

    await this.flushQueueToFallback('drain_timeout');
  }

  public async shutdown(): Promise<void> {
    this.isShutdownRequested = true;
    await this.fallbackSink.shutdown();
  }

  private ensureDispatchLoop(): void {
    if (this.dispatchLoopPromise) {
      return;
    }

    this.dispatchLoopPromise = this.runDispatchLoop().finally(() => {
      this.dispatchLoopPromise = null;
      this.resolveDrainWaitersIfIdle();

      if (this.queue.length > 0 && !this.isShutdownRequested) {
        this.ensureDispatchLoop();
      }
    });
  }

  private async runDispatchLoop(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    try {
      while (this.queue.length > 0 && !this.isShutdownRequested) {
        const batch = this.queue.splice(0, this.config.batchSize);

        if (batch.length === 0) {
          break;
        }

        const didDeliverBatch = await this.deliverBatchWithRetry(batch);

        if (!didDeliverBatch) {
          await this.writeBatchToFallback(batch, 'delivery_exhausted');
        }

        if (this.config.flushIntervalMs > 0 && this.queue.length > 0 && !this.isShutdownRequested) {
          await this.dependencies.sleep(this.config.flushIntervalMs);
        }
      }
    } finally {
      this.resolveDrainWaitersIfIdle();
    }
  }

  private async deliverBatchWithRetry(batch: readonly string[]): Promise<boolean> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      if (this.consumeDrainTimeoutFallbackBatch(batch)) {
        return true;
      }

      const attemptNumber = attempt + 1;

      try {
        this.inFlightRecordCount = batch.length;
        await this.sendBatch(batch);

        if (this.consumeDrainTimeoutFallbackBatch(batch)) {
          this.inFlightRecordCount = 0;
          return true;
        }

        this.inFlightRecordCount = 0;

        return true;
      } catch (error) {
        if (this.consumeDrainTimeoutFallbackBatch(batch)) {
          this.inFlightRecordCount = 0;
          return true;
        }

        this.inFlightRecordCount = 0;

        if (error instanceof NonRetryableSeqHttpError) {
          this.writeOperationalWarning(
            'delivery_non_retryable',
            'Seq sink batch delivery failed with a non-retryable response; switching this batch to stdout fallback.',
            {
              attempt: attemptNumber,
              statusCode: error.status,
              batchSize: batch.length,
            },
          );

          return false;
        }

        if (attempt >= this.config.maxRetries) {
          this.writeOperationalWarning(
            'delivery_failed',
            'Seq sink batch delivery failed after retries; switching this batch to stdout fallback.',
            {
              attempt: attemptNumber,
              maxRetries: this.config.maxRetries,
              error: this.resolveErrorMessage(error),
              batchSize: batch.length,
            },
          );

          return false;
        }

        const retryDelayMs = this.resolveRetryDelayMs(attempt);

        this.writeOperationalWarning(
          'delivery_retry',
          'Seq sink batch delivery failed; retrying with backoff.',
          {
            attempt: attemptNumber,
            nextDelayMs: retryDelayMs,
            error: this.resolveErrorMessage(error),
            batchSize: batch.length,
          },
        );

        if (this.isShutdownRequested) {
          return false;
        }

        await this.dependencies.sleep(retryDelayMs);
      }
    }

    return false;
  }

  private resolveRetryDelayMs(retryAttemptIndex: number): number {
    const exponentialDelayMs = Math.min(
      this.config.backoffMaxMs,
      this.config.backoffBaseMs * 2 ** retryAttemptIndex,
    );

    if (this.config.backoffJitterFactor <= 0) {
      return exponentialDelayMs;
    }

    const jitterRangeMs = Math.floor(exponentialDelayMs * this.config.backoffJitterFactor);

    if (jitterRangeMs === 0) {
      return exponentialDelayMs;
    }

    const randomOffset = Math.floor(this.dependencies.random() * (jitterRangeMs * 2 + 1));
    const jitterOffsetMs = randomOffset - jitterRangeMs;

    return Math.max(0, exponentialDelayMs + jitterOffsetMs);
  }

  private async sendBatch(batch: readonly string[]): Promise<void> {
    const payload = this.buildClefPayload(batch);

    if (payload.length === 0) {
      return;
    }

    const abortController = new AbortController();
    const activeBatchState: ActiveSeqBatchState = {
      records: batch,
      abortController,
      didRouteToFallback: false,
    };
    this.activeBatchState = activeBatchState;
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.timeoutMs);

    try {
      const response = await this.dependencies.fetchFn(this.config.endpoint, {
        method: 'POST',
        headers: this.requestHeaders,
        body: payload,
        signal: abortController.signal,
      });

      if (response.ok) {
        return;
      }

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      throw new NonRetryableSeqHttpError(response.status);
    } finally {
      clearTimeout(timeoutId);

      if (this.activeBatchState === activeBatchState) {
        this.activeBatchState = null;
      }
    }
  }

  private buildClefPayload(batch: readonly string[]): string {
    const clefEntries = batch
      .map((serializedRecord) => this.toClefRecord(serializedRecord))
      .filter((entry): entry is string => entry.length > 0);

    return clefEntries.join('\n');
  }

  private toClefRecord(serializedRecord: string): string {
    const parsedRecord = this.parseRecord(serializedRecord);

    if (!parsedRecord) {
      return '';
    }

    const clefRecord: Record<string, unknown> = {
      '@t': this.resolveIsoTimestamp(parsedRecord),
      '@l': this.resolveClefLevel(parsedRecord.level),
      '@mt': this.resolveMessageTemplate(parsedRecord),
    };

    const traceId = this.resolveStringField(parsedRecord.traceId);

    if (traceId) {
      // Seq requires @tr to be a 32-char lowercase hex string (W3C trace ID).
      // Backend trace IDs arrive as UUIDs (dashes included); strip them so the
      // format is accepted rather than triggering a non-retryable 400.
      const normalized = traceId.replace(/-/g, '');
      clefRecord['@tr'] = /^[0-9a-f]{32}$/i.test(normalized) ? normalized : traceId;
    }

    const spanId = this.resolveStringField(parsedRecord.spanId);

    if (spanId) {
      clefRecord['@sp'] = spanId;
    }

    const exceptionStack = this.resolveExceptionStack(parsedRecord);

    if (exceptionStack) {
      clefRecord['@x'] = exceptionStack;
    }

    for (const [key, value] of Object.entries(parsedRecord)) {
      if (SEQ_RESERVED_ATTRIBUTE_KEYS.has(key) || key.startsWith('@')) {
        continue;
      }

      clefRecord[key] = value;
    }

    return JSON.stringify(clefRecord);
  }

  private parseRecord(serializedRecord: string): Record<string, unknown> | null {
    const trimmedRecord = serializedRecord.trim();

    if (trimmedRecord.length === 0) {
      return null;
    }

    try {
      const parsedRecord = JSON.parse(trimmedRecord) as unknown;

      if (
        typeof parsedRecord === 'object' &&
        parsedRecord !== null &&
        !Array.isArray(parsedRecord)
      ) {
        return parsedRecord as Record<string, unknown>;
      }
    } catch {
      // Fall through to the plain message payload fallback below.
    }

    return {
      message: trimmedRecord,
    };
  }

  private resolveIsoTimestamp(record: Record<string, unknown>): string {
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

    return new Date(this.dependencies.now()).toISOString();
  }

  private resolveClefLevel(level: unknown): string {
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

  private resolveMessageTemplate(record: Record<string, unknown>): string {
    const eventCandidate = this.resolveStringField(record.event);

    if (eventCandidate) {
      return eventCandidate;
    }

    const msgCandidate = this.resolveStringField(record.msg);

    if (msgCandidate) {
      return msgCandidate;
    }

    const messageCandidate = this.resolveStringField(record.message);

    if (messageCandidate) {
      return messageCandidate;
    }

    return 'log event';
  }

  private resolveStringField(value: unknown): string | null {
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

  private resolveExceptionStack(record: Record<string, unknown>): string | null {
    const directStack = this.resolveStringField(record.stack);

    if (directStack) {
      return directStack;
    }

    const errorCandidate = record.error;
    const errorStack = this.resolveStackFromErrorCandidate(errorCandidate);

    if (errorStack) {
      return errorStack;
    }

    return this.resolveStackFromErrorCandidate(record.err);
  }

  private resolveStackFromErrorCandidate(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();

      return trimmedValue.length > 0 ? trimmedValue : null;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }

    const stackCandidate = (value as { stack?: unknown }).stack;

    return this.resolveStringField(stackCandidate);
  }

  private writeOperationalWarning(
    key: string,
    message: string,
    details: Record<string, unknown> = {},
    throttleMs = 0,
  ): void {
    const now = this.dependencies.now();
    const previousEmissionMs = this.warningLastEmittedAtMsByKey.get(key);

    if (
      throttleMs > 0 &&
      previousEmissionMs !== undefined &&
      now - previousEmissionMs < throttleMs
    ) {
      return;
    }

    this.warningLastEmittedAtMsByKey.set(key, now);

    const detailsSuffix =
      Object.keys(details).length === 0 ? '' : ` ${this.safeJsonStringify(details)}`;

    process.stderr.write(`${LOG_SINK_DISPATCH_CONTEXT} ${message}${detailsSuffix}\n`);
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable]';
    }
  }

  private resolveDrainWaitersIfIdle(): void {
    if (!this.isIdle()) {
      return;
    }

    while (this.drainWaiters.length > 0) {
      const resolveWaiter = this.drainWaiters.shift();

      resolveWaiter?.(true);
    }
  }

  private isIdle(): boolean {
    return (
      this.queue.length === 0 && this.dispatchLoopPromise === null && this.inFlightRecordCount === 0
    );
  }

  private async waitForDrain(timeoutMs: number): Promise<boolean> {
    if (this.isIdle()) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let didSettle = false;

      const timeoutId = setTimeout(() => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        this.removeDrainWaiter(resolveDrainWaiter);
        resolve(false);
      }, timeoutMs);

      const resolveDrainWaiter = (didDrain: boolean): void => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timeoutId);
        resolve(didDrain);
      };

      this.drainWaiters.push(resolveDrainWaiter);
    });
  }

  private removeDrainWaiter(targetWaiter: (didDrain: boolean) => void): void {
    const waiterIndex = this.drainWaiters.indexOf(targetWaiter);

    if (waiterIndex === -1) {
      return;
    }

    this.drainWaiters.splice(waiterIndex, 1);
  }

  private abortActiveBatchForDrainTimeout(): readonly string[] | null {
    const activeBatchState = this.activeBatchState;

    if (!activeBatchState || activeBatchState.didRouteToFallback) {
      return null;
    }

    activeBatchState.didRouteToFallback = true;
    this.drainTimeoutFallbackBatches.add(activeBatchState.records);
    activeBatchState.abortController.abort();

    return activeBatchState.records;
  }

  private consumeDrainTimeoutFallbackBatch(batch: readonly string[]): boolean {
    if (!this.drainTimeoutFallbackBatches.has(batch)) {
      return false;
    }

    this.drainTimeoutFallbackBatches.delete(batch);

    return true;
  }

  private async flushQueueToFallback(reason: string): Promise<void> {
    const queuedRecords = this.queue.splice(0, this.queue.length);
    await this.writeBatchToFallback(queuedRecords, reason);
  }

  private async writeBatchToFallback(batch: readonly string[], reason: string): Promise<void> {
    for (const record of batch) {
      await this.writeRecordToFallbackAsync(record, reason);
    }
  }

  private writeRecordToFallback(serializedRecord: string, reason: string): void {
    void this.writeRecordToFallbackAsync(serializedRecord, reason);
  }

  private async writeRecordToFallbackAsync(
    serializedRecord: string,
    reason: string,
  ): Promise<void> {
    try {
      await Promise.resolve(this.fallbackSink.emit(serializedRecord));
    } catch (error) {
      this.writeOperationalWarning(
        'fallback_emit_failed',
        'Stdout fallback emit failed.',
        {
          reason,
          error: this.resolveErrorMessage(error),
        },
        OPERATIONAL_WARNING_THROTTLE_MS,
      );
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}

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

let activeLogSinkState: ActiveLogSinkState | null = null;

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
            `[logging] Log sink emit failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
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

export const __testExports = {
  HttpOtlpLogSink,
  SeqLogSink,
};
