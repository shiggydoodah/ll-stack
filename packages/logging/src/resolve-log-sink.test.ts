import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogSink, LogSinkConfig, LogSinkType } from './index';
import {
  HttpOtlpLogSink,
  SeqLogSink,
  __resetActiveLogSinkForTests,
  createPinoSinkStream,
  resolveActiveLogSink,
  shutdownActiveLogSink,
} from './index';

function makeConfig(overrides: Partial<LogSinkConfig> = {}): LogSinkConfig {
  return {
    sinkType: 'stdout',
    serviceName: 'backend-test',
    environment: 'test',
    timeoutMs: 5_000,
    batchSize: 100,
    queueSize: 1_000,
    flushIntervalMs: 0,
    maxRetries: 0,
    backoffBaseMs: 10,
    backoffMaxMs: 100,
    backoffJitterFactor: 0,
    failureFallbackThreshold: 5,
    initFailureFallbackThreshold: 3,
    circuitOpenMs: 30_000,
    shutdownDrainTimeoutMs: 1_000,
    ...overrides,
  };
}

// Sinks built through the factory use the real global `fetch`; stubbing it is
// the only observation point for the endpoint and headers the factory wired.
function stubFetch() {
  const fetchMock = vi.fn(
    (_endpoint: string, _init: { body: string; headers: Record<string, string> }) =>
      Promise.resolve({ ok: true, status: 200 }),
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function spyOnStderr() {
  return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
}

let stderrSpy: ReturnType<typeof spyOnStderr>;

const stderrText = (): string => stderrSpy.mock.calls.map((call) => String(call[0])).join('');

beforeEach(() => {
  __resetActiveLogSinkForTests();
  stderrSpy = spyOnStderr();
});

afterEach(() => {
  stderrSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe('resolveActiveLogSink', () => {
  it('builds a stdout sink by default and writes records to process.stdout', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const sink = resolveActiveLogSink(makeConfig());

      sink.emit('{"level":30,"msg":"hello"}\n');
      sink.emit('');
      await sink.flush();
      await sink.shutdown();

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).toHaveBeenCalledWith('{"level":30,"msg":"hello"}\n');
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('normalizes the configured sink type before matching it', () => {
    const sink = resolveActiveLogSink(
      makeConfig({ sinkType: '  SEQ  ' as LogSinkType, seqServerUrl: 'http://seq.test:5341' }),
    );

    expect(sink).toBeInstanceOf(SeqLogSink);
  });

  it('rejects unsupported sink types, naming the supported set', () => {
    expect(() => resolveActiveLogSink(makeConfig({ sinkType: 'graylog' as LogSinkType }))).toThrow(
      /Invalid LOG_SINK value "graylog".*stdout, http_otlp, seq/,
    );
  });

  it('keeps a single active sink and refuses to change type after initialization', () => {
    const first = resolveActiveLogSink(makeConfig());

    expect(resolveActiveLogSink(makeConfig())).toBe(first);
    expect(() =>
      resolveActiveLogSink(makeConfig({ sinkType: 'seq', seqServerUrl: 'http://seq.test:5341' })),
    ).toThrow(/LOG_SINK cannot change after initialization/);

    __resetActiveLogSinkForTests();

    const next = resolveActiveLogSink(
      makeConfig({ sinkType: 'seq', seqServerUrl: 'http://seq.test:5341' }),
    );

    expect(next).toBeInstanceOf(SeqLogSink);
  });

  it('requires an OTLP endpoint for http_otlp', () => {
    expect(() => resolveActiveLogSink(makeConfig({ sinkType: 'http_otlp' }))).toThrow(
      /LOG_HTTP_OTLP_ENDPOINT is required/,
    );
    expect(() =>
      resolveActiveLogSink(makeConfig({ sinkType: 'http_otlp', otlpEndpoint: '   ' })),
    ).toThrow(/LOG_HTTP_OTLP_ENDPOINT is required/);
  });

  it('requires a valid base URL for seq', () => {
    expect(() => resolveActiveLogSink(makeConfig({ sinkType: 'seq' }))).toThrow(
      /SEQ_SERVER_URL is required/,
    );

    __resetActiveLogSinkForTests();
    expect(() =>
      resolveActiveLogSink(makeConfig({ sinkType: 'seq', seqServerUrl: 'not-a-url' })),
    ).toThrow(/SEQ_SERVER_URL must be a valid URL/);

    for (const seqServerUrl of [
      'http://seq.test:5341/logs',
      'http://seq.test:5341/?a=1',
      'http://seq.test:5341/#frag',
    ]) {
      __resetActiveLogSinkForTests();
      expect(() => resolveActiveLogSink(makeConfig({ sinkType: 'seq', seqServerUrl }))).toThrow(
        /base URL without a path, query, or fragment/,
      );
    }
  });

  it('derives the Seq ingestion endpoint and API key header from the config', async () => {
    const fetchMock = stubFetch();
    const sink = resolveActiveLogSink(
      makeConfig({
        sinkType: 'seq',
        seqServerUrl: 'http://seq.test:5341',
        seqApiKey: 'ingest-key',
      }),
    );

    sink.emit('{"level":30,"msg":"m"}\n');
    await sink.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://seq.test:5341/ingest/clef');
    expect(fetchMock.mock.calls[0]![1].headers['x-seq-apikey']).toBe('ingest-key');

    // A blank key must not produce an empty auth header.
    __resetActiveLogSinkForTests();

    const keyless = resolveActiveLogSink(
      makeConfig({ sinkType: 'seq', seqServerUrl: 'http://seq.test:5341', seqApiKey: '   ' }),
    );

    keyless.emit('{"level":30,"msg":"m"}\n');
    await keyless.flush();

    expect('x-seq-apikey' in fetchMock.mock.calls[1]![1].headers).toBe(false);
  });

  it('builds an OTLP sink that posts to the configured endpoint', async () => {
    const fetchMock = stubFetch();
    const sink = resolveActiveLogSink(
      makeConfig({ sinkType: 'http_otlp', otlpEndpoint: 'http://collector.test/v1/logs' }),
    );

    expect(sink).toBeInstanceOf(HttpOtlpLogSink);
    sink.emit('{"level":30,"msg":"m"}\n');
    await sink.flush();

    expect(fetchMock.mock.calls[0]![0]).toBe('http://collector.test/v1/logs');
    expect(fetchMock.mock.calls[0]![1].headers['content-type']).toBe('application/json');
  });

  it('clamps batch and queue sizes to workable minimums', async () => {
    const fetchMock = stubFetch();
    const sink = resolveActiveLogSink(
      makeConfig({
        sinkType: 'http_otlp',
        otlpEndpoint: 'http://collector.test/v1/logs',
        batchSize: 0,
        queueSize: 0,
      }),
    );

    // With both knobs clamped to 1, the second record evicts the first
    // instead of the sink dividing by zero or queueing unboundedly.
    sink.emit('{"level":30,"msg":"first"}\n');
    sink.emit('{"level":30,"msg":"second"}\n');
    await sink.flush();

    expect(stderrText()).toContain('queue is full');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].body).toContain('second');
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('first');
  });
});

describe('createPinoSinkStream', () => {
  const writeAsync = (stream: NodeJS.WritableStream, chunk: string | Buffer): Promise<void> =>
    new Promise((resolve, reject) => {
      stream.write(chunk, (error) => (error ? reject(error) : resolve()));
    });

  it('forwards chunks to the sink and skips empty ones', async () => {
    const emitted: string[] = [];
    const sink: LogSink = {
      emit: (serializedRecord: string): void => {
        emitted.push(serializedRecord);
      },
      flush: (): Promise<void> => Promise.resolve(),
      shutdown: (): Promise<void> => Promise.resolve(),
    };
    const stream = createPinoSinkStream(sink);

    await writeAsync(stream, Buffer.from('{"msg":"from-buffer"}\n'));
    await writeAsync(stream, '{"msg":"from-string"}\n');
    await writeAsync(stream, '');

    expect(emitted).toEqual(['{"msg":"from-buffer"}\n', '{"msg":"from-string"}\n']);
  });

  it('keeps the stream alive when the sink emit throws', async () => {
    const emitted: string[] = [];
    let shouldThrow = true;
    const sink: LogSink = {
      emit: (serializedRecord: string): void => {
        if (shouldThrow) {
          shouldThrow = false;
          throw new Error('sink offline');
        }

        emitted.push(serializedRecord);
      },
      flush: (): Promise<void> => Promise.resolve(),
      shutdown: (): Promise<void> => Promise.resolve(),
    };
    const stream = createPinoSinkStream(sink);
    const streamErrors: unknown[] = [];

    stream.on('error', (error) => {
      streamErrors.push(error);
    });

    // A throwing sink must never error the pino stream: that would tear down
    // the logger and lose everything after the first bad record.
    await writeAsync(stream, 'dropped\n');
    await writeAsync(stream, 'delivered\n');

    expect(streamErrors).toEqual([]);
    expect(emitted).toEqual(['delivered\n']);
    expect(stderrText()).toContain('Log sink emit failed: sink offline');
  });
});

describe('shutdownActiveLogSink', () => {
  it('flushes then shuts down the active sink exactly once', async () => {
    const sink = resolveActiveLogSink(makeConfig());
    const callOrder: string[] = [];

    vi.spyOn(sink, 'flush').mockImplementation(() => {
      callOrder.push('flush');
      return Promise.resolve();
    });
    vi.spyOn(sink, 'shutdown').mockImplementation(() => {
      callOrder.push('shutdown');
      return Promise.resolve();
    });

    await shutdownActiveLogSink();
    await shutdownActiveLogSink();

    expect(callOrder).toEqual(['flush', 'shutdown']);

    // Shutdown released the singleton: the next resolve builds a fresh sink.
    expect(resolveActiveLogSink(makeConfig())).not.toBe(sink);
  });
});
