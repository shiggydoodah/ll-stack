import { buildClefPayload } from './clef-payload';
import type { LogSink } from './log-sink';
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

export interface SeqSinkConfig {
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

export type SeqSinkDependencies = HttpDeliveryDependencies;

class NonRetryableSeqHttpError extends Error {
  public readonly status: number;

  public constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'NonRetryableSeqHttpError';
    this.status = status;
  }
}

interface ActiveSeqBatchState {
  readonly records: readonly string[];
  readonly abortController: AbortController;
  didRouteToFallback: boolean;
}

/**
 * Ships records to a Seq server's CLEF ingestion endpoint. `emit` only
 * enqueues; a single background dispatch loop drains the queue in batches,
 * retrying with jittered exponential backoff. Two deliberate differences from
 * the OTLP sink: a 4xx response (other than 429) is treated as non-retryable
 * — Seq refused the payload itself, so the same bytes would fail again — and
 * there is no circuit breaker, because Seq is the local/dev sink and a dead
 * endpoint simply routes each batch to the stdout fallback. The queue is
 * bounded; when it overflows the oldest record is dropped.
 */
export class SeqLogSink implements LogSink {
  private readonly config: SeqSinkConfig;

  private readonly dependencies: SeqSinkDependencies;

  private readonly fallbackSink: LogSink;

  private readonly fallback: FallbackRouter;

  private readonly warnings: ThrottledStderrWarnings;

  private readonly drainWaiters: DrainWaiters;

  private readonly queue: string[] = [];

  // Batches `flush` already routed to the fallback while their request was
  // still in flight; the retry loop consumes membership to avoid delivering
  // the same records twice.
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
      ...createDefaultDeliveryDependencies(),
      ...dependencies,
    };
    this.fallbackSink = fallbackSink;
    this.warnings = new ThrottledStderrWarnings(() => this.dependencies.now());
    this.fallback = new FallbackRouter(fallbackSink, this.warnings);
    this.drainWaiters = new DrainWaiters(() => this.isIdle());

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
      this.fallback.writeRecord(serializedRecord, 'sink_unavailable');
      return;
    }

    if (this.queue.length >= this.config.queueSize) {
      this.warnings.write(
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

    const didDrain = await this.drainWaiters.wait(this.config.shutdownDrainTimeoutMs);

    if (didDrain) {
      return;
    }

    this.warnings.write(
      'drain_timeout',
      'Seq sink drain timed out; flushing queued records to stdout fallback.',
      {
        timeoutMs: this.config.shutdownDrainTimeoutMs,
        queuedRecords: this.queue.length,
        inFlightRecords: this.inFlightRecordCount,
      },
    );

    // Unlike the OTLP sink, the in-flight batch is salvaged too: its request
    // is aborted and the records go to the fallback now, because this drain
    // path runs during shutdown and a hung request would otherwise take the
    // batch down with the process.
    const activeBatchForDrainTimeout = this.abortActiveBatchForDrainTimeout();

    if (activeBatchForDrainTimeout) {
      await this.fallback.writeBatch(activeBatchForDrainTimeout, 'drain_timeout');
    }

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
      while (this.queue.length > 0 && !this.isShutdownRequested) {
        const batch = this.queue.splice(0, this.config.batchSize);

        if (batch.length === 0) {
          break;
        }

        const didDeliverBatch = await this.deliverBatchWithRetry(batch);

        if (!didDeliverBatch) {
          await this.fallback.writeBatch(batch, 'delivery_exhausted');
        }

        if (this.config.flushIntervalMs > 0 && this.queue.length > 0 && !this.isShutdownRequested) {
          await this.dependencies.sleep(this.config.flushIntervalMs);
        }
      }
    } finally {
      this.drainWaiters.settleIfIdle();
    }
  }

  private async deliverBatchWithRetry(batch: readonly string[]): Promise<boolean> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      // A drain timeout may have routed this batch to the fallback at any
      // point (before the attempt, during the request, or while the failure
      // was propagating) — every checkpoint reports "delivered" so the batch
      // is neither retried nor double-written.
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
          this.warnings.write(
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
          this.warnings.write(
            'delivery_failed',
            'Seq sink batch delivery failed after retries; switching this batch to stdout fallback.',
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
          'Seq sink batch delivery failed; retrying with backoff.',
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

  private async sendBatch(batch: readonly string[]): Promise<void> {
    const payload = buildClefPayload(batch, this.dependencies.now);

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
      const requestInit: HttpRequestInit = {
        method: 'POST',
        headers: this.requestHeaders,
        body: payload,
        signal: abortController.signal,
      };
      const response = await this.dependencies.fetchFn(this.config.endpoint, requestInit);

      if (response.ok) {
        return;
      }

      // 429 and 5xx are the server's problem (throttling, transient failure)
      // and worth retrying; any other status means this payload was refused.
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

  private isIdle(): boolean {
    return (
      this.queue.length === 0 && this.dispatchLoopPromise === null && this.inFlightRecordCount === 0
    );
  }
}
