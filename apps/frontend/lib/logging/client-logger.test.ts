// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORRELATION_ID_HEADER, SESSION_ID_COOKIE } from './correlation';
import type * as ClientLoggerModule from './client-logger';

// The browser half of client logging, and the half whose failures are invisible
// on both sides: the records it drops are dropped in someone else's browser, and
// the route it posts to answers with a bare status the logger fires and forgets.
// Nothing here surfaces in an app, a terminal, or a dashboard when it breaks —
// which is exactly why the switch that decides whether a record has anywhere to
// go, the transport fallback, and the flush triggers are pinned rather than
// assumed.
//
// NODE_ENV is `test` under vitest, so `isDev()` is FALSE for every case below.
// That is deliberate: dev is the environment where the console path was never in
// doubt, and the case that matters is a non-dev build with remote posting off —
// the shipped default of both flags.

/** Buffer, flush timer, and session id are module scope; every case gets its own. */
const loadLogger = async (): Promise<typeof ClientLoggerModule> => {
  vi.resetModules();
  return import('./client-logger');
};

const beacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>();
const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<unknown>>();

/** The console is a sink here, not noise — read the record back off it. */
const consoleSpy = {
  debug: vi.spyOn(console, 'debug'),
  info: vi.spyOn(console, 'info'),
  warn: vi.spyOn(console, 'warn'),
  error: vi.spyOn(console, 'error'),
};

/** The records the browser posts, read back out of whichever transport took them. */
const sentRecords = async (body: BodyInit | string | null | undefined): Promise<unknown[]> => {
  const raw = typeof body === 'string' ? body : await (body as Blob).text();
  return (JSON.parse(raw) as { records: unknown[] }).records;
};

/** A registered client event — the only kind the ingest route accepts. */
const EVENT = 'client.error.boundary';

beforeEach(() => {
  // Both halves at their shipped default: remote posting OFF. Cases that are
  // about the other setting say so.
  vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', undefined);
  // The test environment's default threshold is `warn`; pin it low so a case
  // about batching is never quietly about level filtering instead.
  vi.stubEnv('NEXT_PUBLIC_LOG_LEVEL', 'trace');

  beacon.mockReset();
  beacon.mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(undefined);
  // jsdom ships no `sendBeacon`, so the logger would always take the fetch path
  // here — install one and let each case decide what it answers.
  Object.defineProperty(navigator, 'sendBeacon', {
    value: beacon,
    configurable: true,
    writable: true,
  });
  vi.stubGlobal('fetch', fetchMock);

  for (const spy of Object.values(consoleSpy)) {
    spy.mockReset();
    spy.mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  document.cookie = `${SESSION_ID_COOKIE}=; max-age=0`;
  // Here rather than at the end of the case that forces it: a case that fails
  // its first assertion never reaches its own cleanup, and a document left
  // `hidden` would flush the buffer of every case after it — one real failure
  // cascading into unrelated ones that bury it.
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('clientLogger', () => {
  // NEXT_PUBLIC_LOG_REMOTE is the browser half of the ingest kill switch, and
  // it is off by default in EVERY environment — so "off" is the configuration
  // almost every deployment of this template runs, and a record with nowhere to
  // go in that state is a record nobody ever sees.
  describe('remote posting switch (NEXT_PUBLIC_LOG_REMOTE)', () => {
    it('writes to the console and posts nothing while remote is off', async () => {
      const { clientLogger } = await loadLogger();

      clientLogger.error(EVENT, { digest: 'abc123' });

      expect(consoleSpy.error).toHaveBeenCalledOnce();
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does the same for an explicit false', async () => {
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'false');
      const { clientLogger } = await loadLogger();

      clientLogger.warn(EVENT);

      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('floors the console fallback at warn outside dev', async () => {
      // The threshold is `trace` for this file, so nothing here is filtered by
      // it — this is the fallback's OWN floor. It needs one: the production
      // default threshold is `info` and NEXT_PUBLIC_LOG_LEVEL ships unset, so
      // an unfloored fallback wrote `client.session.start` (captureUserEnv()
      // attached) into every visitor's console on every page load. The floor is
      // the level bound and only that; the duplicate-print problem sits above it
      // and is the next case's.
      const { clientLogger } = await loadLogger();

      clientLogger.info('client.session.start');
      clientLogger.debug(EVENT);

      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.debug).not.toHaveBeenCalled();

      // `warn` and above is the evidence the fallback exists for — a boundary
      // render in a default production build still lands somewhere.
      clientLogger.warn(EVENT);
      clientLogger.error(EVENT);

      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      expect(consoleSpy.error).toHaveBeenCalledOnce();
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('leaves the two events the browser prints itself out of the fallback', async () => {
      // A floor cannot reach these: `window.onerror` and `unhandledrejection`
      // (LoggingProvider.tsx) emit at `error`, well above a floor that has to
      // keep `client.error.expected` at `warn`. The browser has already printed
      // both, with a source-mapped stack, so a structured duplicate is the same
      // news twice in every production visitor's console.
      const { clientLogger } = await loadLogger();

      clientLogger.error('client.error.unhandled');
      clientLogger.error('client.error.rejection');

      expect(consoleSpy.error).not.toHaveBeenCalled();

      // The evidence the browser does NOT print is exactly what the fallback is
      // for, and it is untouched: React swallows the throw a boundary catches.
      clientLogger.error(EVENT);
      clientLogger.warn('client.error.expected');

      expect(consoleSpy.error).toHaveBeenCalledOnce();
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
    });

    it('writes nothing during SSR, where stdout is read as JSON', async () => {
      // This module is importable from any client component, and a client
      // component renders on the SERVER too. `console.error(message, record)`
      // under Node is a multi-line `util.inspect` blob, and the Next server's
      // stdout is read one JSON line at a time (log-emitter.ts writes one
      // `JSON.stringify` per line) — so an unguarded fallback does not just add
      // noise there, it puts a malformed record in front of the collector.
      // Nothing reaches it today (both call sites emit from `useEffect`), which
      // is exactly why it needs pinning: the guard is for the code not yet
      // written, and nothing else would catch its removal.
      vi.stubGlobal('window', undefined);
      const { clientLogger } = await loadLogger();

      clientLogger.error(EVENT);
      clientLogger.warn(EVENT);

      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('still posts the browser-reported events once remote is on', async () => {
      // The exclusion narrows the CONSOLE fallback and nothing else — an
      // uncaught error is still telemetry, and a deployment with a sink gets it.
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');
      const { clientLogger, flushClientLogs } = await loadLogger();

      clientLogger.error('client.error.unhandled');
      flushClientLogs();

      expect(await sentRecords(beacon.mock.calls[0]![1])).toHaveLength(1);
    });

    it('posts to /api/client-logs once remote is on, and leaves the console to dev', async () => {
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');
      const { clientLogger, flushClientLogs } = await loadLogger();

      clientLogger.error(EVENT);
      flushClientLogs();

      expect(beacon).toHaveBeenCalledOnce();
      expect(beacon.mock.calls[0]![0]).toBe('/api/client-logs');
      // The record has a sink of its own now, so the console stays a dev
      // affordance rather than a duplicate of it.
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('transport', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');
    });

    it('falls through to fetch when the beacon refuses the payload', async () => {
      // `sendBeacon` returns false when the browser will not queue the payload
      // (its own size cap, mostly). Silently returning here would drop the
      // batch — including the pagehide flush, the one the beacon exists for.
      beacon.mockReturnValue(false);
      const { clientLogger, flushClientLogs, getClientSessionId } = await loadLogger();

      clientLogger.error(EVENT);
      flushClientLogs();

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/api/client-logs');
      expect(init?.method).toBe('POST');
      // keepalive, or an unload-time fetch is cancelled with the document.
      expect(init?.keepalive).toBe(true);
      // The beacon cannot set headers, so the fetch path is the only one that
      // carries the correlation id — the route falls back to it for records
      // whose own id is missing.
      expect((init?.headers as Record<string, string>)[CORRELATION_ID_HEADER]).toBe(
        getClientSessionId(),
      );
      expect(await sentRecords(init?.body)).toHaveLength(1);
    });

    it('does not send twice when the beacon accepts it', async () => {
      const { clientLogger, flushClientLogs } = await loadLogger();

      clientLogger.error(EVENT);
      flushClientLogs();

      expect(beacon).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never throws into the caller when a sink does', async () => {
      // The module's one hard contract: logging must not become the reason an
      // app breaks. Both sinks fail here — the transport under a flush, and the
      // console under the remote-off path that now depends on it.
      const { clientLogger, flushClientLogs } = await loadLogger();
      beacon.mockImplementation(() => {
        throw new Error('beacon unavailable');
      });
      fetchMock.mockImplementation(() => {
        throw new Error('fetch unavailable');
      });

      clientLogger.error(EVENT);
      expect(() => flushClientLogs()).not.toThrow();

      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'false');
      consoleSpy.error.mockImplementation(() => {
        throw new Error('console unavailable');
      });
      expect(() => clientLogger.error(EVENT)).not.toThrow();
    });
  });

  describe('batching', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');
    });

    it('flushes the moment 20 records are buffered', async () => {
      // The threshold is what gets an error storm off the page while the tab is
      // still alive, and it is also why the per-client rate limit is sized the
      // way it is (client-log-rate-limit.ts): one tab can spend its allowance in
      // seconds. Both figures depend on this firing where it says it does.
      const { clientLogger } = await loadLogger();

      for (let index = 0; index < 19; index += 1) clientLogger.error(EVENT, { index });
      expect(beacon).not.toHaveBeenCalled();

      clientLogger.error(EVENT, { index: 19 });

      expect(beacon).toHaveBeenCalledOnce();
      expect(await sentRecords(beacon.mock.calls[0]![1])).toHaveLength(20);
    });

    it('flushes a partial buffer on the interval', async () => {
      const { clientLogger } = await loadLogger();
      vi.useFakeTimers();

      clientLogger.error(EVENT);
      expect(beacon).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5_000);

      expect(beacon).toHaveBeenCalledOnce();
      expect(await sentRecords(beacon.mock.calls[0]![1])).toHaveLength(1);
    });

    it('flushes on tab hide and pagehide, and stops once uninstalled', async () => {
      // A record buffered when the tab goes away is a record lost — and the
      // last records before a navigation are disproportionately the interesting
      // ones.
      const { clientLogger, installClientLoggerLifecycle } = await loadLogger();
      const uninstall = installClientLoggerLifecycle();

      clientLogger.error(EVENT);
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(beacon).toHaveBeenCalledOnce();

      clientLogger.error(EVENT);
      window.dispatchEvent(new Event('pagehide'));
      expect(beacon).toHaveBeenCalledTimes(2);

      // Uninstalled means uninstalled: a record buffered after it stays
      // buffered for the interval rather than riding an old listener.
      //
      // Fake timers BEFORE that record is buffered, because `enqueue` arms the
      // interval flush the moment it is — and this case ends with the buffer
      // deliberately undrained. On real timers that leaves a live 5s timeout
      // holding this module instance's `flush`, which `vi.resetModules()` does
      // not cancel and `vi.useRealTimers()` does not either: it would fire mid
      // way through a LATER case and call the shared `beacon` mock there.
      // Fake ones are discarded with the timer mock in `afterEach`, and letting
      // this one run is also the positive half of the assertion.
      uninstall();
      vi.useFakeTimers();
      clientLogger.error(EVENT);
      window.dispatchEvent(new Event('pagehide'));
      expect(beacon).toHaveBeenCalledTimes(2);

      // Buffered, not lost — the interval still owns it.
      vi.advanceTimersByTime(5_000);
      expect(beacon).toHaveBeenCalledTimes(3);
      expect(await sentRecords(beacon.mock.calls[2]![1])).toHaveLength(1);
    });
  });

  describe('records', () => {
    it('drops anything below the threshold before either sink', async () => {
      // NEXT_PUBLIC_LOG_LEVEL gates both sinks at once, above the branch that
      // chooses between them — so raising it silences the console fallback too.
      // It can only narrow that fallback further; the floor below is what
      // bounds it by default.
      vi.stubEnv('NEXT_PUBLIC_LOG_LEVEL', 'error');
      const { clientLogger } = await loadLogger();

      clientLogger.info('client.session.start');

      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(beacon).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('joins every record to the llstack_sid cookie', async () => {
      // The cross-tier join key: proxy.ts sets the cookie, the browser echoes it
      // into the record, and the ingest route keeps it only if it still looks
      // like an id. A console-only deployment gets the same record shape as a
      // posting one, which is the point of writing it there rather than a
      // formatted line.
      document.cookie = `${SESSION_ID_COOKIE}=session-abc123`;
      const { clientLogger, getClientSessionId } = await loadLogger();

      expect(getClientSessionId()).toBe('session-abc123');

      clientLogger.error(EVENT, { digest: 'abc123' });

      expect(consoleSpy.error.mock.calls[0]![1]).toMatchObject({
        event: EVENT,
        level: 50,
        source: 'frontend-client',
        sessionId: 'session-abc123',
        correlationId: 'session-abc123',
        requestId: 'session-abc123',
        digest: 'abc123',
      });
    });
  });
});
