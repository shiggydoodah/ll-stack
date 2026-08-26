import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogSink } from './index';
import { SeqLogSink } from './index';

// Same testing approach as the OTLP suite: a manual clock and instant sleep
// injected through the constructor, with the drain-timeout test as the only
// case that touches a real (tens-of-ms) timer.
const BASE_CONFIG = {
  endpoint: 'http://seq.test:5341/ingest/clef',
  timeoutMs: 5_000,
  batchSize: 10,
  queueSize: 100,
  flushIntervalMs: 0,
  maxRetries: 0,
  backoffBaseMs: 100,
  backoffMaxMs: 10_000,
  backoffJitterFactor: 0,
  shutdownDrainTimeoutMs: 5_000,
};

interface FetchCall {
  readonly endpoint: string;
  readonly body: string;
  readonly headers: Record<string, string>;
}

type PlannedResponse = { ok: boolean; status: number } | Error | 'hang-until-abort';

interface TestSinkOptions {
  config?: Partial<typeof BASE_CONFIG> & { apiKey?: string };
  responses?: PlannedResponse[];
}

function createTestSink(options: TestSinkOptions = {}) {
  const calls: FetchCall[] = [];
  const sleeps: number[] = [];
  const fallbackRecords: string[] = [];
  const responses = [...(options.responses ?? [])];
  let clockMs = 0;

  const fallbackSink: LogSink = {
    emit: (serializedRecord: string): void => {
      fallbackRecords.push(serializedRecord);
    },
    flush: (): Promise<void> => Promise.resolve(),
    shutdown: (): Promise<void> => Promise.resolve(),
  };

  const sink = new SeqLogSink(
    { ...BASE_CONFIG, ...options.config },
    {
      fetchFn: (endpoint, init): Promise<{ ok: boolean; status: number }> => {
        calls.push({ endpoint, body: init.body, headers: init.headers });
        const planned = responses.shift() ?? { ok: true, status: 200 };

        if (planned === 'hang-until-abort') {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new Error('request aborted'));
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
      random: (): number => 0,
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
  };
}

function parseClefLines(call: FetchCall): Array<Record<string, unknown>> {
  return call.body.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Emits the given lines through a fresh sink and returns the delivered CLEF entries. */
async function captureClefEntries(
  lines: string[],
  options: TestSinkOptions = {},
  clockMs?: number,
): Promise<Array<Record<string, unknown>>> {
  const harness = createTestSink(options);

  if (clockMs !== undefined) {
    harness.setClock(clockMs);
  }

  for (const line of lines) {
    harness.sink.emit(line);
  }

  await harness.sink.flush();

  // Unlike the OTLP sink, the dispatch loop starts synchronously on the first
  // emit, so records emitted in one tick may arrive split across requests;
  // mapping assertions only care about the entries, so flatten them.
  return harness.calls.flatMap((call) => parseClefLines(call));
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

describe('SeqLogSink delivery', () => {
  it('delivers newline-delimited CLEF batches with the Serilog content type', async () => {
    const harness = createTestSink();

    // The first emit starts the dispatch loop synchronously, so it ships alone;
    // the records queued behind it prove multi-record newline batching.
    harness.sink.emit(record({ level: 30, msg: 'first' }));
    harness.sink.emit(record({ level: 30, msg: 'second' }));
    harness.sink.emit(record({ level: 30, msg: 'third' }));
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]!.endpoint).toBe('http://seq.test:5341/ingest/clef');
    expect(harness.calls[0]!.headers['content-type']).toBe('application/vnd.serilog.clef');
    expect(parseClefLines(harness.calls[0]!).map((entry) => entry['@mt'])).toEqual(['first']);
    expect(parseClefLines(harness.calls[1]!).map((entry) => entry['@mt'])).toEqual([
      'second',
      'third',
    ]);
  });

  it('sends the API key header only when one is configured', async () => {
    const withKey = createTestSink({ config: { apiKey: '  seq-key  ' } });

    withKey.sink.emit(record({ level: 30, msg: 'm' }));
    await withKey.sink.flush();

    expect(withKey.calls[0]!.headers['x-seq-apikey']).toBe('seq-key');

    const withoutKey = createTestSink();

    withoutKey.sink.emit(record({ level: 30, msg: 'm' }));
    await withoutKey.sink.flush();

    expect('x-seq-apikey' in withoutKey.calls[0]!.headers).toBe(false);
  });

  it('skips whitespace-only records without issuing a request', async () => {
    const harness = createTestSink();

    harness.sink.emit('   \n');
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(0);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('evicts the oldest record and warns once the queue is full', async () => {
    const harness = createTestSink({ config: { queueSize: 2 } });

    // The first record goes straight in-flight, so three more are needed to
    // overflow the two-slot queue behind it.
    harness.sink.emit(record({ level: 30, msg: 'sent-immediately' }));
    harness.sink.emit(record({ level: 30, msg: 'evicted' }));
    harness.sink.emit(record({ level: 30, msg: 'kept-1' }));
    harness.sink.emit(record({ level: 30, msg: 'kept-2' }));
    await harness.sink.flush();

    expect(stderrText()).toContain('queue is full');
    expect(
      harness.calls.flatMap((call) => parseClefLines(call).map((entry) => entry['@mt'])),
    ).toEqual(['sent-immediately', 'kept-1', 'kept-2']);
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

describe('SeqLogSink retry policy', () => {
  it('does not retry non-retryable HTTP statuses', async () => {
    const harness = createTestSink({
      config: { maxRetries: 3 },
      responses: [{ ok: false, status: 400 }],
    });

    const line = record({ level: 30, msg: 'rejected' });

    harness.sink.emit(line);
    await harness.sink.flush();

    // A 4xx (other than 429) means the payload itself was refused — retrying
    // the same bytes would just re-earn the refusal.
    expect(harness.calls).toHaveLength(1);
    expect(harness.sleeps).toEqual([]);
    expect(harness.fallbackRecords).toEqual([line]);
    expect(stderrText()).toContain('non-retryable');
  });

  it('retries 429 and 5xx with exponential backoff', async () => {
    const harness = createTestSink({
      config: { maxRetries: 3 },
      responses: [
        { ok: false, status: 429 },
        { ok: false, status: 503 },
        { ok: true, status: 200 },
      ],
    });

    harness.sink.emit(record({ level: 30, msg: 'persistent' }));
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(3);
    expect(harness.sleeps).toEqual([100, 200]);
    expect(harness.fallbackRecords).toEqual([]);
  });

  it('routes the batch to the fallback after retries are exhausted', async () => {
    const harness = createTestSink({
      config: { maxRetries: 1 },
      responses: [new Error('down'), new Error('still down')],
    });

    const line = record({ level: 50, msg: 'undeliverable' });

    harness.sink.emit(line);
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(2);
    expect(harness.fallbackRecords).toEqual([line]);
    expect(stderrText()).toContain('delivery failed after retries');
  });
});

describe('SeqLogSink flush', () => {
  it('aborts the in-flight batch on drain timeout without retrying it', async () => {
    const harness = createTestSink({
      config: { batchSize: 1, shutdownDrainTimeoutMs: 25 },
      responses: ['hang-until-abort'],
    });

    const line = record({ level: 30, msg: 'in-flight' });

    harness.sink.emit(line);
    await harness.sink.flush();

    expect(stderrText()).toContain('drain timed out');
    expect(harness.fallbackRecords).toEqual([line]);

    // The abort settles the request; the batch must not be delivered again on
    // top of the fallback copy.
    await harness.sink.flush();

    expect(harness.calls).toHaveLength(1);
    expect(harness.fallbackRecords).toEqual([line]);
  });
});

describe('SeqLogSink CLEF mapping', () => {
  it('derives @t from the record timestamp and falls back to the injected clock', async () => {
    const entries = await captureClefEntries(
      [
        record({ level: 30, msg: 'm', timestamp: 1_700_000_000_000 }),
        record({ level: 30, msg: 'm', time: '2024-01-01T00:00:00.000Z' }),
        record({ level: 30, msg: 'm' }),
      ],
      {},
      1_700_000_000_500,
    );

    expect(entries.map((entry) => entry['@t'])).toEqual([
      '2023-11-14T22:13:20.000Z',
      '2024-01-01T00:00:00.000Z',
      '2023-11-14T22:13:20.500Z',
    ]);
  });

  it('maps pino numeric levels and label levels onto Seq levels', async () => {
    const entries = await captureClefEntries([
      record({ level: 10, msg: 'm' }),
      record({ level: 30, msg: 'm' }),
      record({ level: 60, msg: 'm' }),
      record({ level: 'warn', msg: 'm' }),
      record({ level: 'wat', msg: 'm' }),
    ]);

    expect(entries.map((entry) => entry['@l'])).toEqual([
      'Verbose',
      'Information',
      'Fatal',
      'Warning',
      'Information',
    ]);
  });

  it('prefers event, then msg, then message for the template', async () => {
    // Inverse of the OTLP body preference on purpose: Seq signal queries group
    // by @mt, and `event` is the stable, low-cardinality name call sites emit.
    const entries = await captureClefEntries([
      record({ level: 30, message: 'from-message', msg: 'from-msg', event: 'from-event' }),
      record({ level: 30, message: 'from-message', msg: 'from-msg' }),
      record({ level: 30, message: 'from-message' }),
      record({ level: 30 }),
    ]);

    expect(entries.map((entry) => entry['@mt'])).toEqual([
      'from-event',
      'from-msg',
      'from-message',
      'log event',
    ]);
  });

  it('normalizes UUID trace ids to 32-char hex and passes other shapes through', async () => {
    const entries = await captureClefEntries([
      record({
        level: 30,
        msg: 'm',
        traceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        spanId: 's1',
      }),
      record({ level: 30, msg: 'm', traceId: '0af7651916cd43dd8448eb211c80319c' }),
      record({ level: 30, msg: 'm', traceId: 'not-a-trace' }),
    ]);

    expect(entries.map((entry) => entry['@tr'])).toEqual([
      'a1b2c3d4e5f67890abcdef1234567890',
      '0af7651916cd43dd8448eb211c80319c',
      'not-a-trace',
    ]);
    expect(entries[0]!['@sp']).toBe('s1');
  });

  it('surfaces exception stacks from stack, error, and err fields as @x', async () => {
    const entries = await captureClefEntries([
      record({ level: 50, msg: 'm', stack: 'direct stack' }),
      record({ level: 50, msg: 'm', error: { stack: 'error object stack' } }),
      record({ level: 50, msg: 'm', err: { stack: 'err object stack' } }),
      record({ level: 50, msg: 'm', error: 'string error' }),
      record({ level: 50, msg: 'm' }),
    ]);

    expect(entries.map((entry) => entry['@x'])).toEqual([
      'direct stack',
      'error object stack',
      'err object stack',
      'string error',
      undefined,
    ]);
  });

  it('drops reserved and @-prefixed keys but passes other fields through', async () => {
    const entries = await captureClefEntries([
      record({
        level: 30,
        msg: 'm',
        time: 1,
        timestamp: 2,
        traceId: 'abc',
        spanId: 'def',
        '@evil': 'spoofed',
        userId: 'user-1',
      }),
    ]);
    const entry = entries[0]!;

    expect(entry.userId).toBe('user-1');
    // Reserved keys land only in their CLEF form, and record keys can never
    // collide with (or spoof) the @-prefixed built-ins.
    expect('level' in entry).toBe(false);
    expect('time' in entry).toBe(false);
    expect('timestamp' in entry).toBe(false);
    expect('traceId' in entry).toBe(false);
    expect('spanId' in entry).toBe(false);
    expect('@evil' in entry).toBe(false);
  });

  it('wraps a non-JSON line as a message-only event', async () => {
    const entries = await captureClefEntries(['plain text line\n']);

    expect(entries[0]!['@mt']).toBe('plain text line');
    expect(entries[0]!['@l']).toBe('Information');
  });
});
