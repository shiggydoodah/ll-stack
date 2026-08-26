import type { LogSink } from './log-sink';

// Machinery shared by the HTTP-based sinks (OTLP and Seq). Everything here is
// built around one constraint: a log sink must never make the application
// wait and never throw into it. Delivery is asynchronous and best-effort;
// when it fails, records degrade to the stdout fallback (where the container
// runtime still captures them) rather than being retried forever or lost
// silently. Operational problems are reported on stderr — not through the
// logger — because the logger is the thing that is broken.

export const LOG_SINK_DISPATCH_CONTEXT = '[logging]';
export const OPERATIONAL_WARNING_THROTTLE_MS = 5_000;

export interface HttpRequestInit {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
}

// Injection seams for everything nondeterministic (network, timers, clock,
// jitter), so the retry/backoff/circuit behaviour is unit-testable without
// fake timers or a live collector.
export interface HttpDeliveryDependencies {
  readonly fetchFn: (endpoint: string, init: HttpRequestInit) => Promise<HttpResponseLike>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly random: () => number;
}

export function createDefaultDeliveryDependencies(): HttpDeliveryDependencies {
  return {
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
  };
}

export interface RetryBackoffConfig {
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly backoffJitterFactor: number;
}

// Exponential backoff with symmetric jitter: the delay is drawn uniformly
// from [delay - range, delay + range] so multiple instances that failed at
// the same moment don't retry in lockstep against a recovering endpoint.
export function computeRetryDelayMs(
  config: RetryBackoffConfig,
  random: () => number,
  retryAttemptIndex: number,
): number {
  const exponentialDelayMs = Math.min(
    config.backoffMaxMs,
    config.backoffBaseMs * 2 ** retryAttemptIndex,
  );

  if (config.backoffJitterFactor <= 0) {
    return exponentialDelayMs;
  }

  const jitterRangeMs = Math.floor(exponentialDelayMs * config.backoffJitterFactor);

  if (jitterRangeMs === 0) {
    return exponentialDelayMs;
  }

  const randomOffset = Math.floor(random() * (jitterRangeMs * 2 + 1));
  const jitterOffsetMs = randomOffset - jitterRangeMs;

  return Math.max(0, exponentialDelayMs + jitterOffsetMs);
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[Unserializable]';
  }
}

export function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

/**
 * A serialized record is normally one pino JSON line, but the sink contract
 * accepts any string; anything that does not parse to a plain object is
 * wrapped as `{ message }` so it still reaches the backend as a log event
 * instead of being dropped.
 */
export function parseSerializedLogRecord(serializedRecord: string): Record<string, unknown> | null {
  const trimmedRecord = serializedRecord.trim();

  if (trimmedRecord.length === 0) {
    return null;
  }

  try {
    const parsedRecord = JSON.parse(trimmedRecord) as unknown;

    if (typeof parsedRecord === 'object' && parsedRecord !== null && !Array.isArray(parsedRecord)) {
      return parsedRecord as Record<string, unknown>;
    }
  } catch {
    // Fall through to the plain message payload fallback below.
  }

  return {
    message: trimmedRecord,
  };
}

/**
 * Writes operational warnings about the sink itself to stderr, optionally
 * throttled per key so a sustained failure (every batch timing out, say)
 * reports once per window instead of once per record.
 */
export class ThrottledStderrWarnings {
  private readonly now: () => number;

  private readonly lastEmittedAtMsByKey = new Map<string, number>();

  public constructor(now: () => number) {
    this.now = now;
  }

  public write(
    key: string,
    message: string,
    details: Record<string, unknown> = {},
    throttleMs = 0,
  ): void {
    const now = this.now();
    const previousEmissionMs = this.lastEmittedAtMsByKey.get(key);

    if (
      throttleMs > 0 &&
      previousEmissionMs !== undefined &&
      now - previousEmissionMs < throttleMs
    ) {
      return;
    }

    this.lastEmittedAtMsByKey.set(key, now);

    const detailsSuffix = Object.keys(details).length === 0 ? '' : ` ${safeJsonStringify(details)}`;

    process.stderr.write(`${LOG_SINK_DISPATCH_CONTEXT} ${message}${detailsSuffix}\n`);
  }
}

/**
 * Tracks callers waiting for the sink to drain (flush during shutdown). Each
 * waiter resolves `true` as soon as the sink reports idle, or `false` when
 * its own timeout elapses first — a drain must never block shutdown forever.
 */
export class DrainWaiters {
  private readonly waiters: Array<(didDrain: boolean) => void> = [];

  private readonly isIdle: () => boolean;

  public constructor(isIdle: () => boolean) {
    this.isIdle = isIdle;
  }

  public settleIfIdle(): void {
    if (!this.isIdle()) {
      return;
    }

    while (this.waiters.length > 0) {
      const resolveWaiter = this.waiters.shift();

      resolveWaiter?.(true);
    }
  }

  public async wait(timeoutMs: number): Promise<boolean> {
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
        this.remove(resolveDrainWaiter);
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

      this.waiters.push(resolveDrainWaiter);
    });
  }

  private remove(targetWaiter: (didDrain: boolean) => void): void {
    const waiterIndex = this.waiters.indexOf(targetWaiter);

    if (waiterIndex === -1) {
      return;
    }

    this.waiters.splice(waiterIndex, 1);
  }
}

/**
 * Routes records that could not be delivered remotely to the fallback sink
 * (stdout). Emit failures here are reported and swallowed — the fallback is
 * the last resort, and there is nowhere further to escalate a log record.
 */
export class FallbackRouter {
  private readonly fallbackSink: LogSink;

  private readonly warnings: ThrottledStderrWarnings;

  public constructor(fallbackSink: LogSink, warnings: ThrottledStderrWarnings) {
    this.fallbackSink = fallbackSink;
    this.warnings = warnings;
  }

  public writeRecord(serializedRecord: string, reason: string): void {
    void this.writeRecordAsync(serializedRecord, reason);
  }

  public async writeBatch(batch: readonly string[], reason: string): Promise<void> {
    for (const record of batch) {
      await this.writeRecordAsync(record, reason);
    }
  }

  public async drainQueue(queue: string[], reason: string): Promise<void> {
    const queuedRecords = queue.splice(0, queue.length);

    await this.writeBatch(queuedRecords, reason);
  }

  private async writeRecordAsync(serializedRecord: string, reason: string): Promise<void> {
    try {
      await Promise.resolve(this.fallbackSink.emit(serializedRecord));
    } catch (error) {
      this.warnings.write(
        'fallback_emit_failed',
        'Stdout fallback emit failed.',
        {
          reason,
          error: resolveErrorMessage(error),
        },
        OPERATIONAL_WARNING_THROTTLE_MS,
      );
    }
  }
}
