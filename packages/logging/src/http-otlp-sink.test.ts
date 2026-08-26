import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogSink, RuntimeEnvironment } from './index';
import { HttpOtlpLogSink } from './index';

// The sink's failure handling is time-driven (backoff, circuit half-open,
// warning throttles), so every test drives a manual clock and an instant
// `sleep` through the constructor's dependency seams — no fake timers, no
// real waiting. The one real timer is the drain timeout in `flush`, which the
// drain test keeps at tens of milliseconds.
const BASE_CONFIG = {
  endpoint: 'http://collector.test/v1/logs',
  serviceName: 'backend-test',
  environment: 'test' as RuntimeEnvironment,
  timeoutMs: 5_000,
  batchSize: 10,
  queueSize: 100,
  flushIntervalMs: 0,
  maxRetries: 0,
  backoffBaseMs: 100,
  backoffMaxMs: 10_000,
  backoffJitterFactor: 0,
  failureFallbackThreshold: 100,
  initFailureFallbackThreshold: 100,
  circuitOpenMs: 30_000,
  shutdownDrainTimeoutMs: 5_000,
};

interface FetchCall {
  readonly endpoint: string;
  readonly body: string;
  readonly headers: Record<string, string>;
}

type PlannedResponse = { ok: boolean; status: number } | Error | 'hang';

interface TestSinkOptions {
  config?: Partial<typeof BASE_CONFIG>;
  responses?: PlannedResponse[];
  random?: () => number;
  initialize?: () => Promise<void>;
}

function createTestSink(options: TestSinkOptions = {}) {
  const calls: FetchCall[] = [];
  const sleeps: number[] = [];
  const fallbackRecords: string[] = [];
  const pendingReleases: Array<() => void> = [];
  const responses = [...(options.responses ?? [])];
  let clockMs = 0;

  const fallbackSink: LogSink = {
    emit: (serializedRecord: string): void => {
      fallbackRecords.push(serializedRecord);
    },
    flush: (): Promise<void> => Promise.resolve(),
    shutdown: (): Promise<void> => Promise.resolve(),
  };

  const sink = new HttpOtlpLogSink(
    { ...BASE_CONFIG, ...options.config },
    {
      fetchFn: (endpoint, init): Promise<{ ok: boolean; status: number }> => {
        calls.push({ endpoint, body: init.body, headers: init.headers });
        const planned = responses.shift() ?? { ok: true, status: 200 };

        if (planned === 'hang') {
          return new Promise((resolve) => {
            pendingReleases.push(() => {
              resolve({ ok: true, status: 200 });
            });
          });
        }

        if (planned instanceof Error) {
          return Promise.reject(planned);
        }

        return Promise.resolve(planned);
      },
      sleep: (ms): Promise<void> => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: (): number => clockMs,
      random: options.random ?? ((): number => 0),
      ...(options.initialize ? { initialize: options.initialize } : {}),
    },
    fallbackSink,
  );

  return {
    sink,
    calls,
    sleeps,
    fallbackRecords,
    setClock: (ms: number): void => {
      clockMs = ms;
    },
    releasePendingRequests: (): void => {
      for (const release of pendingReleases.splice(0)) {
        release();
      }
    },
  };
}

interface OtlpAnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string;
  doubleValue?: number;
  arrayValue?: { values: OtlpAnyValue[] };
}

interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: OtlpAnyValue;
  attributes: Array<{ key: string; value: OtlpAnyValue }>;
}

interface OtlpPayload {
  resourceLogs: Array<{
    resource: { attributes: Array<{ key: string; value: OtlpAnyValue }> };
    scopeLogs: Array<{ scope: { name: string }; logRecords: OtlpLogRecord[] }>;
  }>;
}

function parsePayload(call: FetchCall): OtlpPayload {
  return JSON.parse(call.body) as OtlpPayload;
}

function logRecordsOf(call: FetchCall): OtlpLogRecord[] {
  return parsePayload(call).resourceLogs[0]!.scopeLogs[0]!.logRecords;
}

/** Emits the given lines through a fresh sink and returns the single delivered batch. */
async function captureLogRecords(
  lines: string[],
  options: TestSinkOptions = {},
  clockMs?: number,
): Promise<OtlpLogRecord[]> {
  const harness = createTestSink(options);

  if (clockMs !== undefined) {
    harness.setClock(clockMs);
  }

  for (const line of lines) {
    harness.sink.emit(line);
  }

  await harness.sink.flush();
  expect(harness.calls).toHaveLength(1);

  return logRecordsOf(harness.calls[0]!);
}

const record = (fields: Record<string, unknown>): string => JSON.stringify(fields);

function spyOnStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

let stderrSpy: ReturnType<typeof spyOnStderr>;

const stderrText = (): string => stderrSpy.mock.calls.map((call) => String(call[0])).join('');

beforeEach(() => {
  stderrSpy = spyOnStderr();
});

afterEach(() => {
  stderrSpy.mockRestore();
});

describe('HttpOtlpLogSink delivery', () => {
  it('delivers queued records to the endpoint as one JSON batch', async () => {
    const harness = createTestSink();

    harness.sink.emit(record({ level: 30, msg: 'first' }));
    harness.sink.emit(record({ level: 30, msg: 'second' }));
    harness.sink.emit(record({ level: 30, msg: 'third' }));
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]!.endpoint).toBe('http://collector.test/v1/logs');
    expect(harness.calls[0]!.headers['content-type']).toBe('application/json');
    expect(logRecordsOf(harness.calls[0]!)).toHaveLength(3);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('splits deliveries by batch size', async () => {
    const harness = createTestSink({ config: { batchSize: 2 } });

    for (let index = 0; index < 5; index += 1) {
      harness.sink.emit(record({ level: 30, msg: `r${index}` }));
    }

    await harness.sink.flush();

    expect(harness.calls.map((call) => logRecordsOf(call).length)).toEqual([2, 2, 1]);
  });

  it('ignores empty records', async () => {
    const harness = createTestSink();

    harness.sink.emit('');
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(0);
  });

  it('evicts the oldest record and warns once the queue is full', async () => {
    const harness = createTestSink({ config: { queueSize: 2 } });

    harness.sink.emit(record({ level: 30, msg: 'evicted' }));
    harness.sink.emit(record({ level: 30, msg: 'kept-1' }));
    harness.sink.emit(record({ level: 30, msg: 'kept-2' }));
    await harness.sink.flush();

    expect(stderrText()).toContain('queue is full');

    const messages = logRecordsOf(harness.calls[0]!).map((entry) => entry.body.stringValue);

    // The evicted record is dropped outright, not routed to the fallback: a
    // full queue means log production is outrunning delivery, and buffering
    // more elsewhere would just move the memory problem.
    expect(messages).toEqual(['kept-1', 'kept-2']);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('emit after shutdown routes straight to the fallback', async () => {
    const harness = createTestSink();

    await harness.sink.shutdown();
    harness.sink.emit(record({ level: 30, msg: 'late' }));
    await Promise.resolve();

    expect(harness.calls).toHaveLength(0);
    expect(harness.fallbackRecords).toEqual([record({ level: 30, msg: 'late' })]);
  });
});

describe('HttpOtlpLogSink retry and backoff', () => {
  it('retries failures with exponential backoff capped at backoffMaxMs', async () => {
    const harness = createTestSink({
      config: { maxRetries: 3, backoffBaseMs: 100, backoffMaxMs: 250 },
      responses: [
        { ok: false, status: 500 },
        new Error('socket hang up'),
        { ok: false, status: 503 },
        { ok: true, status: 200 },
      ],
    });

    harness.sink.emit(record({ level: 30, msg: 'persistent' }));
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(4);
    // 100 → 200 → capped at 250 instead of 400.
    expect(harness.sleeps).toEqual([100, 200, 250]);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('spreads retries with jitter derived from the injected random source', async () => {
    const harness = createTestSink({
      config: { maxRetries: 1, backoffBaseMs: 100, backoffJitterFactor: 0.5 },
      responses: [{ ok: false, status: 500 }],
      // random → 0.999… lands on the top of the ±50ms jitter window.
      random: () => 0.999999,
    });

    harness.sink.emit(record({ level: 30, msg: 'jittered' }));
    await harness.sink.flush();

    expect(harness.sleeps).toEqual([150]);
  });

  it('routes the batch to the fallback after retries are exhausted', async () => {
    const harness = createTestSink({
      config: { maxRetries: 1 },
      responses: [
        { ok: false, status: 500 },
        { ok: false, status: 500 },
      ],
    });

    const line = record({ level: 50, msg: 'undeliverable' });

    harness.sink.emit(line);
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(2);
    expect(harness.fallbackRecords).toEqual([line]);
    expect(stderrText()).toContain('delivery failed after retries');
  });
});

describe('HttpOtlpLogSink circuit breaker', () => {
  it('opens after consecutive failed batches, then closes after circuitOpenMs', async () => {
    const harness = createTestSink({
      config: { batchSize: 1, failureFallbackThreshold: 2, circuitOpenMs: 1_000 },
      responses: [new Error('down'), new Error('down')],
    });

    const first = record({ level: 30, msg: 'first' });
    const second = record({ level: 30, msg: 'second' });

    harness.sink.emit(first);
    harness.sink.emit(second);
    await harness.sink.flush();

    // Two consecutive exhausted batches reach the threshold and trip the circuit.
    expect(harness.calls).toHaveLength(2);
    expect(harness.fallbackRecords).toEqual([first, second]);
    expect(stderrText()).toContain('circuit opened');

    // While open, records skip the queue entirely — no remote attempts.
    const third = record({ level: 30, msg: 'third' });

    harness.sink.emit(third);
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(2);
    expect(harness.fallbackRecords).toEqual([first, second, third]);

    // Once the open window has elapsed, delivery resumes remotely.
    harness.setClock(1_500);

    const fourth = record({ level: 30, msg: 'fourth' });

    harness.sink.emit(fourth);
    await harness.sink.flush();

    expect(stderrText()).toContain('circuit has closed');
    expect(harness.calls).toHaveLength(3);
    expect(harness.fallbackRecords).toEqual([first, second, third]);
  });
});

describe('HttpOtlpLogSink initialization', () => {
  it('retries a failed initialization with backoff before delivering', async () => {
    const initialize = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('collector warming up'))
      .mockResolvedValue(undefined);
    const harness = createTestSink({ initialize });

    harness.sink.emit(record({ level: 30, msg: 'patient' }));
    await harness.sink.flush();

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(harness.sleeps).toEqual([100]);
    expect(harness.calls).toHaveLength(1);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('opens the circuit once initialization failures reach the threshold', async () => {
    const initialize = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('no collector'));
    const harness = createTestSink({
      config: { initFailureFallbackThreshold: 2 },
      initialize,
    });

    const line = record({ level: 30, msg: 'stranded' });

    harness.sink.emit(line);
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(0);
    expect(harness.fallbackRecords).toEqual([line]);
    expect(stderrText()).toContain('initialization failure threshold reached');

    // The circuit is now open: later records bypass the queue.
    const late = record({ level: 30, msg: 'late' });

    harness.sink.emit(late);
    await harness.sink.flush();

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(harness.fallbackRecords).toEqual([line, late]);
  });
});

describe('HttpOtlpLogSink flush', () => {
  it('routes queued records to the fallback when the drain times out', async () => {
    const harness = createTestSink({
      config: { batchSize: 1, shutdownDrainTimeoutMs: 25 },
      responses: ['hang'],
    });

    const inFlight = record({ level: 30, msg: 'in-flight' });
    const queued = record({ level: 30, msg: 'queued' });

    harness.sink.emit(inFlight);
    harness.sink.emit(queued);
    await harness.sink.flush();

    // Only the still-queued record is salvaged; the in-flight one is the
    // remote's to lose.
    expect(harness.fallbackRecords).toEqual([queued]);
    expect(stderrText()).toContain('drain timed out');

    // Once the hung request completes, the in-flight batch counts as
    // delivered — nothing is retried or duplicated.
    harness.releasePendingRequests();
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(1);
    expect(harness.fallbackRecords).toEqual([queued]);
  });
});

describe('HttpOtlpLogSink payload mapping', () => {
  it('stamps resource attributes for service and environment', async () => {
    const harness = createTestSink();

    harness.sink.emit(record({ level: 30, msg: 'hello' }));
    await harness.sink.flush();

    const payload = parsePayload(harness.calls[0]!);

    expect(payload.resourceLogs[0]!.resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'backend-test' } },
      { key: 'deployment.environment.name', value: { stringValue: 'test' } },
    ]);
    expect(payload.resourceLogs[0]!.scopeLogs[0]!.scope.name).toBe('app.logsink');
  });

  it('maps pino numeric levels onto OTLP severity', async () => {
    const levels = [10, 20, 30, 40, 50, 60];
    const entries = await captureLogRecords(levels.map((level) => record({ level, msg: 'm' })));

    expect(entries.map((entry) => entry.severityText)).toEqual([
      'TRACE',
      'DEBUG',
      'INFO',
      'WARN',
      'ERROR',
      'FATAL',
    ]);
    expect(entries.map((entry) => entry.severityNumber)).toEqual([1, 5, 9, 13, 17, 21]);
  });

  it('maps string levels and defaults unknown levels to INFO', async () => {
    const entries = await captureLogRecords([
      record({ level: 'warn', msg: 'm' }),
      record({ level: 'wat', msg: 'm' }),
      record({ msg: 'm' }),
    ]);

    expect(entries.map((entry) => entry.severityText)).toEqual(['WARN', 'INFO', 'INFO']);
  });

  it('prefers message, then msg, then event for the body', async () => {
    const entries = await captureLogRecords([
      record({ level: 30, message: 'from-message', msg: 'from-msg', event: 'from-event' }),
      record({ level: 30, msg: 'from-msg', event: 'from-event' }),
      record({ level: 30, event: 'from-event' }),
      record({ level: 30 }),
    ]);

    expect(entries.map((entry) => entry.body.stringValue)).toEqual([
      'from-message',
      'from-msg',
      'from-event',
      'log event',
    ]);
  });

  it('derives timeUnixNano from the record and falls back to the injected clock', async () => {
    const entries = await captureLogRecords(
      [
        record({ level: 30, msg: 'm', timestamp: 1_700_000_000_000 }),
        record({ level: 30, msg: 'm', timestamp: '2023-11-14T22:13:20.000Z' }),
        record({ level: 30, msg: 'm', time: 1_700_000_000_123 }),
        record({ level: 30, msg: 'm' }),
      ],
      {},
      42,
    );

    expect(entries.map((entry) => entry.timeUnixNano)).toEqual([
      '1700000000000000000',
      '1700000000000000000',
      '1700000000123000000',
      '42000000',
    ]);
  });

  it('excludes reserved keys from attributes and caps the attribute count', async () => {
    const wide: Record<string, unknown> = { level: 30, msg: 'm', time: 1, timestamp: 2 };

    for (let index = 0; index < 70; index += 1) {
      wide[`a${index}`] = index;
    }

    const entries = await captureLogRecords([record(wide)]);
    const keys = entries[0]!.attributes.map((attribute) => attribute.key);

    expect(keys).toHaveLength(64);
    expect(keys).not.toContain('level');
    expect(keys).not.toContain('msg');
    expect(keys).not.toContain('time');
    expect(keys).not.toContain('timestamp');
    expect(keys[0]).toBe('a0');
  });

  it('converts attribute values to OTLP AnyValue shapes', async () => {
    const entries = await captureLogRecords([
      record({
        level: 30,
        msg: 'm',
        str: 'text',
        flag: true,
        whole: 42,
        fractional: 1.5,
        missing: null,
        list: [1, 'two', true],
        nested: { a: 1 },
      }),
    ]);

    const byKey = new Map(
      entries[0]!.attributes.map((attribute) => [attribute.key, attribute.value]),
    );

    expect(byKey.get('str')).toEqual({ stringValue: 'text' });
    expect(byKey.get('flag')).toEqual({ boolValue: true });
    expect(byKey.get('whole')).toEqual({ intValue: '42' });
    expect(byKey.get('fractional')).toEqual({ doubleValue: 1.5 });
    expect(byKey.get('missing')).toEqual({ stringValue: 'null' });
    expect(byKey.get('list')).toEqual({
      arrayValue: { values: [{ intValue: '1' }, { stringValue: 'two' }, { boolValue: true }] },
    });
    expect(byKey.get('nested')).toEqual({ stringValue: '{"a":1}' });
  });

  it('caps array attributes at 20 values', async () => {
    const entries = await captureLogRecords([
      record({ level: 30, msg: 'm', list: Array.from({ length: 25 }, (_, index) => index) }),
    ]);
    const list = entries[0]!.attributes.find((attribute) => attribute.key === 'list');

    expect(list!.value.arrayValue!.values).toHaveLength(20);
  });

  it('truncates oversized string values', async () => {
    const entries = await captureLogRecords([record({ level: 30, msg: 'x'.repeat(5_000) })]);

    expect(entries[0]!.body.stringValue).toHaveLength(4_099);
    expect(entries[0]!.body.stringValue!.endsWith('...')).toBe(true);
  });

  it('wraps a non-JSON line as a message-only record', async () => {
    const entries = await captureLogRecords(['plain text line\n']);

    expect(entries[0]!.body.stringValue).toBe('plain text line');
    expect(entries[0]!.severityText).toBe('INFO');
    expect(entries[0]!.attributes).toEqual([]);
  });
});
