import type { RuntimeEnvironment } from './log-level.defaults';
import type { LogSink } from './log-sink';
import { buildOtlpPayload } from './otlp-payload';
import type { HttpDeliveryDependencies, HttpRequestInit } from './sink-delivery';
import {
  DrainWaiters,
  FallbackRouter,
  OPERATIONAL_WARNING_THROTTLE_MS,
  ThrottledStderrWarnings,
  computeRetryDelayMs,
  createDefaultDeliveryDependencies,
  resolveErrorMessage,
} from './sink-delivery';
import { StdoutLogSink } from './stdout-sink';

export interface HttpOtlpSinkConfig {
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
  readonly initFailureFallbackThreshold: number;
  readonly circuitOpenMs: number;
  readonly shutdownDrainTimeoutMs: number;
}

export interface HttpOtlpSinkDependencies extends HttpDeliveryDependencies {
  // Seam for transports that need setup before the first send (opening a
  // client, resolving credentials). Failures here are retried with backoff
  // and count toward their own fallback threshold.
  readonly initialize: () => Promise<void>;
}

/**
 * Ships records to an OTLP/HTTP logs endpoint. `emit` only enqueues; a single
 * background dispatch loop drains the queue in batches, retrying each batch
 * with jittered exponential backoff. Sustained failure trips a circuit
 * breaker: while open, records bypass the queue and go straight to the
 * stdout fallback, and the endpoint gets a fresh chance after `circuitOpenMs`.
 * The queue is bounded; when it overflows the oldest record is dropped —
 * log production must never grow memory without limit.
 */
export class HttpOtlpLogSink implements LogSink {
  private readonly config: HttpOtlpSinkConfig;

  private readonly dependencies: HttpOtlpSinkDependencies;

  private readonly fallbackSink: LogSink;

  private readonly fallback: FallbackRouter;

  private readonly warnings: ThrottledStderrWarnings;

  private readonly drainWaiters: DrainWaiters;

  private readonly queue: string[] = [];

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
      ...createDefaultDeliveryDependencies(),
      initialize: () => Promise.resolve(),
      ...dependencies,
    };
    this.fallbackSink = fallbackSink;
    this.warnings = new ThrottledStderrWarnings(() => this.dependencies.now());
    this.fallback = new FallbackRouter(fallbackSink, this.warnings);
    this.drainWaiters = new DrainWaiters(() => this.isIdle());
  }

  public emit(serializedRecord: string): void {
    if (serializedRecord.length === 0) {
      return;
    }

    this.refreshCircuitState();

    if (this.isShutdownRequested || this.isCircuitOpen()) {
      this.fallback.writeRecord(serializedRecord, 'sink_unavailable');
      return;
    }

    if (this.queue.length >= this.config.queueSize) {
      this.warnings.write(
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

    const didDrain = await this.drainWaiters.wait(this.config.shutdownDrainTimeoutMs);

    if (didDrain) {
      return;
    }

    // Records still queued after the timeout are salvaged to the fallback;
    // the in-flight batch is left to whatever its request resolves to.
    this.warnings.write(
      'drain_timeout',
      'HTTP sink drain timed out; flushing queued records to stdout fallback.',
      {
        timeoutMs: this.config.shutdownDrainTimeoutMs,
        queuedRecords: this.queue.length,
        inFlightRecords: this.inFlightRecordCount,
      },
    );

    await this.fallback.drainQueue(this.queue, 'drain_timeout');
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
      this.drainWaiters.settleIfIdle();

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
        await this.handleInitializationFailure(error);
        return;
      }

      while (this.queue.length > 0 && !this.isShutdownRequested) {
        this.refreshCircuitState();

        if (this.isCircuitOpen()) {
          await this.fallback.drainQueue(this.queue, 'circuit_open');
          return;
        }

        const batch = this.queue.splice(0, this.config.batchSize);

        if (batch.length === 0) {
          break;
        }

        const didDeliverBatch = await this.deliverBatchWithRetry(batch);

        if (!didDeliverBatch) {
          this.consecutiveFailedBatches += 1;

          await this.fallback.writeBatch(batch, 'delivery_exhausted');

          if (this.consecutiveFailedBatches >= this.config.failureFallbackThreshold) {
            this.openCircuit();
            await this.fallback.drainQueue(this.queue, 'failure_threshold');
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
      this.drainWaiters.settleIfIdle();
    }
  }

  private async handleInitializationFailure(error: unknown): Promise<void> {
    this.initializationFailureCount += 1;
    const initFailureFallbackThreshold = this.resolveInitFailureFallbackThreshold();

    if (
      this.initializationFailureCount >= initFailureFallbackThreshold &&
      !this.isShutdownRequested
    ) {
      this.warnings.write(
        'init_failure_threshold',
        'HTTP sink initialization failure threshold reached; opening circuit and routing queued records to stdout fallback.',
        {
          attempt: this.initializationFailureCount,
          initFailureFallbackThreshold,
        },
      );
      this.openCircuit();
      await this.fallback.drainQueue(this.queue, 'init_failure_threshold');
      return;
    }

    const retryDelayMs = computeRetryDelayMs(
      this.config,
      this.dependencies.random,
      this.initializationFailureCount - 1,
    );

    this.warnings.write(
      'init_failed',
      'HTTP sink initialization failed; retrying after backoff.',
      {
        attempt: this.initializationFailureCount,
        nextDelayMs: retryDelayMs,
        error: resolveErrorMessage(error),
      },
      OPERATIONAL_WARNING_THROTTLE_MS,
    );

    // Awaited so the dispatch loop does not restart (and re-attempt
    // initialization) until the backoff delay has actually elapsed.
    if (!this.isShutdownRequested) {
      await this.dependencies.sleep(retryDelayMs);
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
          this.warnings.write(
            'delivery_failed',
            'HTTP sink batch delivery failed after retries; switching this batch to stdout fallback.',
            {
              attempt: attemptNumber,
              maxRetries: this.config.maxRetries,
              error: resolveErrorMessage(error),
              batchSize: batch.length,
            },
          );

          return false;
        }

        const retryDelayMs = computeRetryDelayMs(this.config, this.dependencies.random, attempt);

        this.warnings.write(
          'delivery_retry',
          'HTTP sink batch delivery failed; retrying with backoff.',
          {
            attempt: attemptNumber,
            nextDelayMs: retryDelayMs,
            error: resolveErrorMessage(error),
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
    const payload = buildOtlpPayload(batch, {
      serviceName: this.config.serviceName,
      environment: this.config.environment,
      now: this.dependencies.now,
    });
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.timeoutMs);

    try {
      const requestInit: HttpRequestInit = {
        method: 'POST',
        headers: this.requestHeaders,
        body: payload,
        signal: abortController.signal,
      };
      const response = await this.dependencies.fetchFn(this.config.endpoint, requestInit);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeoutId);
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
    this.warnings.write(
      'circuit_closed',
      'HTTP sink circuit has closed; retrying remote delivery.',
    );
  }

  private openCircuit(): void {
    this.circuitOpenUntilMs = this.dependencies.now() + this.config.circuitOpenMs;
    this.warnings.write(
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

  private isIdle(): boolean {
    return (
      this.queue.length === 0 && this.dispatchLoopPromise === null && this.inFlightRecordCount === 0
    );
  }
}
