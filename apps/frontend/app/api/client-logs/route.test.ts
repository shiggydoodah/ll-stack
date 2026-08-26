import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { mockWrite, mockWarn } = vi.hoisted(() => ({ mockWrite: vi.fn(), mockWarn: vi.fn() }));
vi.mock('@/lib/logging/log-emitter', () => ({ writeServerLogRecord: mockWrite }));
vi.mock('@/lib/logging/server-logger', () => ({ serverLogger: { warn: mockWarn } }));
// The rate limit reads its allowances and its proxy trust from the env; pin
// them so the throttle cases below are small and deterministic. TRUST_PROXY=1
// makes the last X-Forwarded-For entry the bucket key, which is what a
// deployment with one proxy in front gets — a request with no such header is
// metered on the shared bucket alone. EVERY request also charges the shared
// bucket — it is the whole-app ceiling — so the shared figures sit above the
// per-client ones (as the schema requires) but close enough that the cases
// about the global ceiling can actually reach it. All four figures differ so a
// case that spends the wrong allowance fails loudly.
const RATE_LIMIT = 5;
const SHARED_RATE_LIMIT = 8;
// The record allowances are the ingest ceiling proper — a request is worth up to
// MAX_RECORDS (100) of them, so a request cap alone metered the wrong thing. Set
// well clear of the request figures so a case that spends the wrong dimension
// fails loudly, and above the 100 a full batch costs so the cases that are not
// about ingest are never decided by it.
const RECORD_LIMIT = 200;
const SHARED_RECORD_LIMIT = 320;
// Ingest is ON for the suite's baseline — the kill switch defaults off, and
// with it off every case below would see nothing but 404s. The env object is
// mutable so the kill-switch cases can flip it per test (the limiter memoises
// its config read, so each flip is followed by resetClientLogRateLimit()).
const baseEnv = {
  CLIENT_LOG_INGEST_ENABLED: true,
  CLIENT_LOG_RATE_LIMIT_PER_MINUTE: RATE_LIMIT,
  CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: SHARED_RATE_LIMIT,
  CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: RECORD_LIMIT,
  CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: SHARED_RECORD_LIMIT,
  TRUST_PROXY: 1,
};
let mockEnv: Record<string, unknown> = { ...baseEnv };
vi.mock('@/config/env', () => ({ getServerEnv: () => mockEnv }));
// Resolve the `@/` alias the route uses to the real (pure) correlation module so
// the id-precedence logic stays under test.
vi.mock('@/lib/logging/correlation', async () => import('../../../lib/logging/correlation'));

import { sanitizeLogRecord } from '@repo/logging/shared';
import {
  checkClientLogRateLimit,
  resetClientLogRateLimit,
  resolveClientLogRateMaxKeys,
} from '@/lib/logging/client-log-rate-limit';
import {
  CLIENT_INGESTIBLE_EVENTS,
  FRONTEND_LOG_EVENTS,
  FRONTEND_LOG_EVENT_LEVELS,
} from '@/lib/logging/log-events';
// The REAL schema, not the mocked `getServerEnv` above — one case below feeds
// the route what a parse actually produces. See it for why that seam needs a
// case of its own.
import { serverEnvSchema } from '@/config/env.schema';
import { POST } from './route';

const ENDPOINT = 'https://example.com/api/client-logs';

/**
 * The minimum `serverEnvSchema` accepts — every required variable and nothing
 * else, so a round-trip case can put a real parse between the operator's value
 * and this route without re-declaring the app's whole env. It is a second copy
 * of what `config/env.schema.test.ts` calls `validEnv`, and deliberately not
 * shared: a new required variable makes this parse THROW and the case fail by
 * name, so the drift is loud rather than silent — which is the only kind of
 * duplication worth having here.
 */
const SCHEMA_REQUIRED_ENV = {
  NODE_ENV: 'development',
  PORT: '4100',
  BACKEND_INTERNAL_URL: 'http://localhost:3100',
  BACKEND_API_SECRET: 'test-backend-secret',
  SESSION_SECRET: 'test-session-secret-must-be-32-chars',
  BINDING_SECRET: 'test-binding-secret-must-be-32-chars',
  NEXT_PUBLIC_APP_NAME: 'app',
};

/** The trusted client address every request carries unless it opts out. */
const CLIENT = '198.51.100.7';

/**
 * Header set that makes a request address-less, so it falls to the shared bucket.
 * An empty `X-Forwarded-For` is a chain with no entries, which is the same thing
 * to the limiter as omitting the header.
 */
const ANONYMOUS = { 'x-forwarded-for': '' };

const postJson = (body: string, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(ENDPOINT, {
    method: 'POST',
    body,
    // A trusted client address BY DEFAULT. Every case here draws on a real
    // allowance, so without it the cases that have nothing to do with rate
    // limiting quietly shared the (deliberately small) whole-app bucket with each
    // other — passing only because none of them happened to make a third request,
    // and failing with a 429 for an unrelated reason the moment one grew. Cases
    // that are about the shared bucket opt out with ANONYMOUS.
    headers: { 'content-type': 'application/json', 'x-forwarded-for': CLIENT, ...headers },
  });

const emptyBatch = (headers: Record<string, string> = {}): NextRequest =>
  postJson(JSON.stringify({ records: [] }), headers);

/** A registered catalog event — records without one are skipped at the sink. */
const EVENT = 'client.session.start';

/** A batch of `count` distinct records — the unit the ingest ceiling counts. */
const batchOf = (count: number, headers: Record<string, string> = {}): NextRequest =>
  postJson(
    JSON.stringify({
      records: Array.from({ length: count }, (_, index) => ({
        message: `r${index}`,
        event: EVENT,
      })),
    }),
    headers,
  );

/**
 * A request whose body arrives as a stream with NO content-length — what a
 * chunked sender looks like. The declared-length guard never sees it, so only
 * byte counting during the read can enforce the cap.
 */
const postStream = (chunks: string[]): NextRequest =>
  new NextRequest(ENDPOINT, {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    // Node's fetch requires half-duplex to be declared for stream bodies; no
    // RequestInit type carries `duplex` yet, hence the widening — anchored to
    // the constructor's own init type so it cannot drift from what
    // `NextRequest` actually accepts.
    duplex: 'half',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': CLIENT },
  } as ConstructorParameters<typeof NextRequest>[1] & { duplex: 'half' });

/** Spends the whole allowance for one bucket, asserting it was actually spent. */
const exhaustAllowance = async (
  allowance: number,
  headers: Record<string, string> = {},
): Promise<void> => {
  for (let index = 0; index < allowance; index += 1) {
    const res = await POST(emptyBatch(headers));
    expect(res.status).toBe(204);
  }
};

describe('POST /api/client-logs', () => {
  beforeEach(() => {
    mockWrite.mockReset();
    mockWarn.mockReset();
    mockEnv = { ...baseEnv };
    // Counting state outlives a test otherwise, so one case would spend
    // another's allowance.
    resetClientLogRateLimit();
  });

  describe('kill switch (CLIENT_LOG_INGEST_ENABLED)', () => {
    beforeEach(() => {
      // The schema default: ingest off. The suite baseline flips it on, so the
      // cases here flip it back — and drop the limiter's memoised config so the
      // flip actually takes.
      mockEnv = { ...baseEnv, CLIENT_LOG_INGEST_ENABLED: false };
      resetClientLogRateLimit();
    });

    it('404s and writes nothing while ingest is disabled, whatever the payload', async () => {
      // 404, not 403: a disabled route must not confirm it exists.
      const res = await POST(
        postJson(JSON.stringify({ records: [{ message: 'a' }, { message: 'b' }] })),
      );

      expect(res.status).toBe(404);
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('404s before the rate limit, spending nothing', async () => {
      // Twice the allowance in 404s, and no 429 ever appears — the switch sits
      // in front of the limiter, so a disabled route does not even meter.
      for (let index = 0; index < RATE_LIMIT * 2; index += 1) {
        expect((await POST(emptyBatch())).status).toBe(404);
      }

      // The caller's whole request allowance is untouched: this direct check is
      // the charge the first admitted request would make.
      expect(checkClientLogRateLimit(`ip:${CLIENT}`).allowed).toBe(true);
    });

    it('falls closed when the env cannot be read at all', async () => {
      // An unreadable env must read as "ingest off", never as "on with default
      // allowances" — the fallback mirrors the schema default.
      mockEnv = null as unknown as Record<string, unknown>;
      resetClientLogRateLimit();

      expect((await POST(emptyBatch())).status).toBe(404);
      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  describe('cross-site and non-JSON refusals', () => {
    it('403s cross-site fetch metadata before the rate limit', async () => {
      // Sec-Fetch-Site is browser-controlled — another website's page cannot
      // forge it — so this blocks other sites weaponising real visitors'
      // browsers. It does not stop curl, and twice the allowance in refusals
      // proves the limiter was never consulted, let alone charged.
      for (let index = 0; index < RATE_LIMIT * 2; index += 1) {
        const res = await POST(emptyBatch({ 'sec-fetch-site': 'cross-site' }));
        expect(res.status).toBe(403);
      }

      expect((await POST(emptyBatch({ 'sec-fetch-site': 'same-origin' }))).status).toBe(204);
    });

    it('403s an Origin that does not name this host, and accepts one that does', async () => {
      expect(
        (await POST(emptyBatch({ host: 'example.com', origin: 'https://attacker.example' })))
          .status,
      ).toBe(403);
      // 'null' — sandboxed frames and some redirect chains — is present and
      // does not match, so it is refused rather than waved through.
      expect((await POST(emptyBatch({ host: 'example.com', origin: 'null' }))).status).toBe(403);

      expect(
        (await POST(emptyBatch({ host: 'example.com', origin: 'https://example.com' }))).status,
      ).toBe(204);
    });

    it('compares Origin against CLIENT_LOG_ALLOWED_ORIGIN once one is configured', async () => {
      // Host is exact only while every proxy in front of Next preserves it. One
      // that rewrites it to its upstream (an nginx `proxy_pass` without
      // `proxy_set_header Host $host`) fails EVERY real browser request —
      // 100% of browser telemetry, permanently. This is the repair for a proxy
      // that is not the operator's to change, and it is operator-set, so it
      // does not reopen what honouring the caller-written X-Forwarded-Host
      // would.
      mockEnv = { ...baseEnv, CLIENT_LOG_ALLOWED_ORIGIN: 'https://app.example.com' };
      resetClientLogRateLimit();

      // Host is the upstream name the proxy rewrote to; the browser's Origin is
      // the real one, and the configured value is what it is measured against.
      const rewritten = { host: 'frontend.internal:4100' };
      expect(
        (await POST(emptyBatch({ ...rewritten, origin: 'https://app.example.com' }))).status,
      ).toBe(204);

      // It REPLACES the Host comparison rather than widening it: an Origin
      // naming the rewritten host is refused too. No browser sends that one.
      expect(
        (await POST(emptyBatch({ ...rewritten, origin: 'https://frontend.internal:4100' }))).status,
      ).toBe(403);

      // An ORIGIN carries scheme and port; a Host comparison can see neither.
      expect(
        (await POST(emptyBatch({ host: 'app.example.com', origin: 'http://app.example.com' })))
          .status,
      ).toBe(403);

      // And a mismatch against the CONFIGURED value is reported like any other
      // refusal. This is the record SECURITY.md's checklist tells an operator to
      // watch on the day they enable ingest, and it has to fire in the mode they
      // reached for when the Host comparison was the thing that broke — a
      // misconfigured value here fails every browser request exactly as a
      // rewritten Host did.
      expect(mockWarn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
        reason: 'origin_mismatch',
        refusedSinceLastReport: 1,
        // AND WHICH MODE IT WAS REFUSING IN, which is the difference between the
        // two states an operator has to tell apart here: the override is not
        // being read, or it is being read and is wrong. Both drop 100% of
        // browser telemetry and both used to write the same bytes — and since
        // this variable is itself the repair for the first fault, its own typo
        // reproduces the fault it was reached for. The configured value rides
        // along because it is operator-set and schema-normalised, so it is ours
        // to record, and the normalised form is the one thing reading the env
        // back does not show.
        originCheck: 'allowed_origin',
        allowedOrigin: 'https://app.example.com',
      });
    });

    it('compares against the origin the SCHEMA produced, not a raw string', async () => {
      // The seam every other case here mocks past: `getServerEnv` is a plain
      // object in this file, so `isAllowedOrigin` normally compares against a
      // string no parse has touched. In a real process the comparand is
      // `URL.origin` — lowercased, default port dropped, trailing slash gone —
      // and the two suites agreeing in prose is not the same as the seam being
      // exercised. A trailing slash surviving into the comparison would fail
      // every browser request, which is the same total telemetry loss this
      // variable exists to repair.
      const parsed = serverEnvSchema.parse({
        ...SCHEMA_REQUIRED_ENV,
        CLIENT_LOG_ALLOWED_ORIGIN: ' HTTPS://App.Example.COM:443/ ',
      });
      mockEnv = { ...baseEnv, CLIENT_LOG_ALLOWED_ORIGIN: parsed.CLIENT_LOG_ALLOWED_ORIGIN };
      resetClientLogRateLimit();

      // What a browser actually sends, against what an operator actually typed.
      expect(
        (await POST(emptyBatch({ host: 'frontend.internal', origin: 'https://app.example.com' })))
          .status,
      ).toBe(204);
      expect(
        (await POST(emptyBatch({ host: 'frontend.internal', origin: 'https://app.example.org' })))
          .status,
      ).toBe(403);
    });

    it('does not make Origin mandatory — setting it repairs the comparison, nothing more', async () => {
      // Worth pinning because the variable reads like a tightening and is not
      // one: a caller that sends NO Origin header is admitted here exactly as it
      // is under the Host comparison. The header checks are strict only about
      // what is PRESENT — a browser always sends it, and an absent one means an
      // older browser or a non-browser caller, which `curl` can be at will. What
      // bounds that caller is the rate limit and the caps behind it, never this.
      mockEnv = { ...baseEnv, CLIENT_LOG_ALLOWED_ORIGIN: 'https://app.example.com' };
      resetClientLogRateLimit();

      expect((await POST(emptyBatch({ host: 'frontend.internal' }))).status).toBe(204);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('415s a non-JSON content-type before the rate limit', async () => {
      for (let index = 0; index < RATE_LIMIT * 2; index += 1) {
        const res = await POST(emptyBatch({ 'content-type': 'text/plain' }));
        expect(res.status).toBe(415);
      }

      expect((await POST(emptyBatch())).status).toBe(204);
    });

    it('reports each refusal, so a proxy eating every request is not invisible', async () => {
      // These answer with a bare status, and the browser logger fires and
      // forgets — so without a record the condition is invisible on BOTH sides
      // at once. The reason an operator actually meets is origin_mismatch:
      // originMatchesHost compares against the Host header THIS PROCESS
      // received, so a proxy that rewrites Host rather than preserving it fails
      // every real browser request and drops 100% of browser telemetry.
      //
      // Budgeted like every other report here — once per window PER REASON, so
      // a flood of cross-site probes cannot bury the broken proxy, and a flood
      // of refusals cannot amplify into a flood of records.
      for (let index = 0; index < 3; index += 1) {
        expect((await POST(emptyBatch({ 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
      }
      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
        reason: 'cross_site',
        refusedSinceLastReport: 1,
      });

      await POST(emptyBatch({ host: 'example.com', origin: 'https://attacker.example' }));
      expect(mockWarn).toHaveBeenLastCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
        reason: 'origin_mismatch',
        refusedSinceLastReport: 1,
        // Which comparand was in force. Nothing is configured here, so the check
        // was against the Host header — and that value is caller-written, so the
        // mode is named and the value is not.
        originCheck: 'host',
      });

      await POST(emptyBatch({ 'content-type': 'text/plain' }));
      expect(mockWarn).toHaveBeenLastCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
        reason: 'content_type',
        refusedSinceLastReport: 1,
      });

      expect(mockWarn).toHaveBeenCalledTimes(3);

      // The mode rides on `origin_mismatch` alone — it says nothing about a
      // cross-site or content-type refusal, and a field that means nothing on a
      // record is a field an operator has to learn to ignore.
      expect(mockWarn.mock.calls[0]![1]).toEqual({
        reason: 'cross_site',
        refusedSinceLastReport: 1,
      });
      expect(mockWarn.mock.calls[2]![1]).toEqual({
        reason: 'content_type',
        refusedSinceLastReport: 1,
      });
    });

    it('says nothing about a request it accepts', async () => {
      expect(
        (await POST(emptyBatch({ host: 'example.com', origin: 'https://example.com' }))).status,
      ).toBe(204);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('passes requests with no fetch metadata at all — absent is not cross-site', async () => {
      // Older browsers and non-browser callers send neither header; the checks
      // are strict only about what is present. (The rate limit is what actually
      // binds those callers.)
      expect((await POST(emptyBatch())).status).toBe(204);
    });
  });

  describe('record shape bounds', () => {
    it('truncates oversized strings, deep nesting, and long arrays with explicit markers', async () => {
      await POST(
        postJson(
          JSON.stringify({
            records: [
              {
                message: 'x'.repeat(5_000),
                event: EVENT,
                deep: { a: { b: { c: { d: 'too deep' } } } },
                wide: Array.from({ length: 100 }, (_, index) => index),
              },
            ],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      // `message` is envelope, so it is bounded in place at the top level.
      expect(record.message.endsWith('…[truncated]')).toBe(true);
      expect(record.message.length).toBeLessThanOrEqual(4_096 + '…[truncated]'.length);
      // Everything else is nested, and the depth budget is measured from inside
      // `context` — nesting must not cost a level, or the caps would quietly
      // mean something different after the reshape than before it. Depth 4 is
      // where recursion stops: the subtree is replaced, not dropped, so the
      // record still says something was there.
      expect(record.context.deep.a.b.c).toBe('[Truncated]');
      // The array cap removes rather than truncating in place, so — like the
      // field cap — it COUNTS what it took. Without that count a 100-entry
      // array read exactly like a 32-entry one on the dashboard.
      expect(record.context.wide).toHaveLength(32);
      expect(record.context.wide[31]).toBe(31);
      // AT THE TOP LEVEL, not in the array's last slot, because `context` is one
      // JSON-stringified attribute cut at 4 KiB on the OTLP sink — a mark in the
      // tail is the first thing lost on exactly the wide records it describes.
      expect(record.arrayEntriesDropped).toBe(68);
    });

    it('leaves an array at the cap alone', async () => {
      // The count must only appear when something was actually dropped — an
      // array of exactly MAX_ARRAY_LENGTH keeps all 32 entries and reports
      // nothing, so a clean record carries neither of the two fields.
      await POST(
        postJson(
          JSON.stringify({
            records: [
              {
                message: 'at cap',
                event: EVENT,
                wide: Array.from({ length: 32 }, (_, index) => index),
              },
            ],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(record.context.wide).toHaveLength(32);
      expect(record.context.wide[31]).toBe(31);
      expect(record.arrayEntriesDropped).toBeUndefined();
      expect(record.fieldsDropped).toBeUndefined();
    });

    it('caps context fields but never strips the envelope', async () => {
      // 100 filler fields arrive BEFORE the envelope keys, so a cap that kept
      // arrival order blindly would push message/sessionId off the record.
      const flood: Record<string, unknown> = {};
      for (let index = 0; index < 100; index += 1) flood[`filler${index}`] = index;
      await POST(
        postJson(
          JSON.stringify({
            records: [{ ...flood, message: 'kept', event: EVENT, sessionId: 'sess-abc123' }],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(record.message).toBe('kept');
      expect(record.sessionId).toBe('sess-abc123');
      expect(record.context.filler0).toBe(0);
      expect(record.context.filler31).toBe(31);
      // Everything past the 32-field cap is stripped.
      expect(record.context.filler32).toBeUndefined();
      expect(record.context.filler99).toBeUndefined();
      // Stripped, but NEVER silently. The other caps truncate in place and say
      // so; this one can only remove, so it reports the count — the difference
      // between "the browser never sent `digest`" and "`digest` was field 34"
      // on a real client.error.* record. One fixed top-level name, so reporting
      // an overflow costs the index a single property name however hostile the
      // record was, and no sink can truncate it away.
      expect(record.fieldsDropped).toBe(68);
    });

    it('counts an overflow inside a nested object too, at any depth', async () => {
      // The cap applies at every level, and one total covers them all: the
      // count says the record is not what the browser sent, which is the
      // question an operator is asking. Where it happened is legible from the
      // record — the object sitting at exactly 32 keys is the one that lost
      // something.
      const nested: Record<string, unknown> = {};
      for (let index = 0; index < 40; index += 1) nested[`n${index}`] = index;
      await POST(
        postJson(JSON.stringify({ records: [{ message: 'x', event: EVENT, payload: nested }] })),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(record.context.payload.n31).toBe(31);
      expect(record.context.payload.n32).toBeUndefined();
      // The record's own width never came near the cap — one context field — so
      // all 8 of these came from the nested object.
      expect(record.fieldsDropped).toBe(8);
    });

    it('counts the losses itself, and never lets a caller write either count', async () => {
      // Fields an operator reads as the route's own account of what it dropped
      // have to be the route's alone — the same rule `event`, `source`, and the
      // timestamps are held to. Here that costs no reserved-key handling: the
      // reshape nests every caller-supplied field under `context`, so a caller
      // cannot reach a top-level name at all, and both counts are written after
      // the spread besides.
      await POST(
        postJson(
          JSON.stringify({
            records: [{ message: 'x', event: EVENT, fieldsDropped: 999, arrayEntriesDropped: 999 }],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      // The caller's claims are ordinary context, under their own names.
      expect(record.context).toEqual({ fieldsDropped: 999, arrayEntriesDropped: 999 });
      // Nothing overflowed, so the route's own counts say nothing — a caller
      // cannot make a clean record look truncated.
      expect(record.fieldsDropped).toBeUndefined();
      expect(record.arrayEntriesDropped).toBeUndefined();

      // ...and alongside a real overflow the top-level count is the real one,
      // never the caller's number.
      const flood: Record<string, unknown> = { fieldsDropped: 999 };
      for (let index = 0; index < 40; index += 1) flood[`filler${index}`] = index;
      await POST(postJson(JSON.stringify({ records: [{ ...flood, message: 'x', event: EVENT }] })));

      const overflowed = mockWrite.mock.calls[1]![0];
      expect(overflowed.context.filler30).toBe(30);
      // 41 caller fields, 32 kept (the caller's own `fieldsDropped` among them,
      // as ordinary context), 9 dropped.
      expect(overflowed.context.fieldsDropped).toBe(999);
      expect(overflowed.fieldsDropped).toBe(9);
    });

    it('nests every caller-chosen key under one fixed top-level name', async () => {
      // The cap bounds a record's WIDTH; it does not bound how many distinct
      // property names the sink is asked to index, because every caller-chosen
      // key used to arrive as a top-level name of its own. Nesting is what
      // bounds that, so the top-level key set has to stay fixed no matter what
      // the caller sends — a caller's own `context` key included.
      await POST(
        postJson(
          JSON.stringify({
            records: [
              {
                message: 'x',
                event: EVENT,
                sessionId: 'sess-abc123',
                attackerChosen: 1,
                context: { nested: true },
              },
            ],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      // THE WHOLE SET, so a new top-level name cannot be added without this
      // case saying so — the cardinality bound is the count of names this route
      // can ever put in front of the sink, and every one of them is fixed here.
      expect(Object.keys(record).sort()).toEqual([
        'arrayEntriesDropped',
        'clientTimestamp',
        'context',
        'correlationId',
        'event',
        'fieldsDropped',
        'ingestedAt',
        'level',
        'message',
        'requestId',
        'sessionId',
        'source',
        'timestamp',
      ]);
      // The two cap counts are undefined on a record that lost nothing, and
      // `writeServerLogRecord` JSON-stringifies, so they are dropped before the
      // sink rather than written as nulls on every ordinary record.
      expect(record.fieldsDropped).toBeUndefined();
      expect(record.arrayEntriesDropped).toBeUndefined();
      expect(JSON.parse(JSON.stringify(record))).not.toHaveProperty('fieldsDropped');
      expect(record.attackerChosen).toBeUndefined();
      expect(record.context.attackerChosen).toBe(1);
      // A caller's `context` is not privileged — it nests like anything else.
      expect(record.context.context).toEqual({ nested: true });
    });

    it('carries a literal __proto__ key through as data, without polluting anything', async () => {
      // `JSON.parse` hands `__proto__` back as an ordinary own property, so a
      // body can carry one. Plain assignment on either accumulator it passes
      // through — the sanitizer's or this route's — would set that object's
      // prototype and silently drop the field instead.
      await POST(
        postJson(
          '{"records":[{"message":"x","event":"' + EVENT + '","__proto__":{"polluted":1}}]}',
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(Object.prototype.hasOwnProperty.call(record.context, '__proto__')).toBe(true);
      expect(Object.getPrototypeOf(record.context)).toBe(Object.prototype);
      expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    });

    it('omits context entirely when the record carries none', async () => {
      await POST(postJson(JSON.stringify({ records: [{ message: 'x', event: EVENT }] })));

      const record = mockWrite.mock.calls[0]![0];
      expect('context' in record).toBe(false);
    });
  });

  describe('caller-supplied identity fields', () => {
    it('drops traceId and spanId, which the Seq sink reifies into trace built-ins', async () => {
      // These are not ordinary context: clef-payload.ts lifts them into @tr/@sp
      // and excludes them from the property copy, so a caller-supplied value is
      // used ONLY as trace identity — forging a join into a real trace, and
      // (for a non-hex value) drawing a 400 that drops the whole sink batch to
      // stdout fallback. A browser record has no server trace context, so there
      // is nothing to preserve: they go nowhere, not even into `context`.
      await POST(
        postJson(
          JSON.stringify({
            records: [
              {
                message: 'x',
                event: EVENT,
                traceId: 'a'.repeat(32),
                spanId: 'not-a-span-id',
              },
            ],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(record.traceId).toBeUndefined();
      expect(record.spanId).toBeUndefined();
      expect(record.context?.traceId).toBeUndefined();
      expect(record.context?.spanId).toBeUndefined();
    });

    it('keeps a sessionId only when it is id-shaped, exactly like the correlation ids', async () => {
      await POST(
        postJson(
          JSON.stringify({
            records: [
              { message: 'a', event: EVENT, sessionId: 'sess-abc123' },
              { message: 'b', event: EVENT, sessionId: `not a session id ${'x'.repeat(200)}` },
              { message: 'c', event: EVENT, sessionId: { nested: 'object' } },
            ],
          }),
        ),
      );

      const [first, second, third] = mockWrite.mock.calls.map((call) => call[0]);
      expect(first.sessionId).toBe('sess-abc123');
      // Omitted, not truncated and not nested: an id that is not id-shaped is
      // not a join key, and 4 KiB of arbitrary text under a name dashboards
      // group by is worse than nothing.
      expect(second.sessionId).toBeUndefined();
      expect(second.context?.sessionId).toBeUndefined();
      expect(third.sessionId).toBeUndefined();
    });
  });

  describe('client clock separation', () => {
    it("keeps the caller's timestamp only as clientTimestamp; ours is authoritative", async () => {
      const skewed = new Date(Date.now() - 60_000).toISOString();
      await POST(
        postJson(JSON.stringify({ records: [{ message: 'x', event: EVENT, timestamp: skewed }] })),
      );

      const record = mockWrite.mock.calls[0]![0];
      expect(record.clientTimestamp).toBe(skewed);
      // The field sinks index and order by is server-set, same instant as
      // ingestedAt — a caller cannot place a record into someone else's
      // incident timeline.
      expect(record.timestamp).not.toBe(skewed);
      expect(record.timestamp).toBe(record.ingestedAt);
      expect(Math.abs(Date.parse(record.timestamp) - Date.now())).toBeLessThan(5_000);
    });

    it('drops a timestamp outside the skew bound, and a forged clientTimestamp with it', async () => {
      const ancient = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
      await POST(
        postJson(
          JSON.stringify({
            records: [
              { message: 'x', event: EVENT, timestamp: ancient, clientTimestamp: 'forged' },
            ],
          }),
        ),
      );

      const record = mockWrite.mock.calls[0]![0];
      // Absent is honest — a clamped value would still be a lie with our name
      // on it. The caller-written clientTimestamp field is flattened too.
      expect(record.clientTimestamp).toBeUndefined();
      expect(record.timestamp).toBe(record.ingestedAt);
    });
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await POST(postJson('not json'));
    expect(res.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 when records is not an array', async () => {
    const res = await POST(postJson(JSON.stringify({ records: 'nope' })));
    expect(res.status).toBe(400);
  });

  it('returns 413 when the declared content-length is too large', async () => {
    const res = await POST(postJson('{}', { 'content-length': String(1024 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('returns 413 when the actual body exceeds the byte cap despite a spoofed content-length', async () => {
    // A small/spoofed content-length passes the up-front guard, so only the
    // byte count taken while the body streams in can reject it.
    const oversized = JSON.stringify({ records: [{ message: 'x'.repeat(64 * 1024 + 1) }] });
    const res = await POST(postJson(oversized, { 'content-length': '10' }));
    expect(res.status).toBe(413);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('cuts off a chunked body with no content-length at the byte cap', async () => {
    // No declared length at all, so the up-front guard never fires — the
    // earlier request.text() implementation buffered bodies like this whole,
    // which let one anonymous request stream gigabytes into memory.
    const res = await POST(postStream(Array.from({ length: 5 }, () => 'x'.repeat(20 * 1024))));

    expect(res.status).toBe(413);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('accepts a chunked body under the cap', async () => {
    const res = await POST(
      postStream(['{"records":[{"message":"a","event":"client.session.start"}', ']}']),
    );

    expect(res.status).toBe(204);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it('charges records by their bytes, so one huge record cannot walk past the ingest ceiling', async () => {
    // A record's size is unbounded below the 64 KiB body cap, so counting
    // records alone priced one maximal record at 1 of the record allowance
    // while it carried ~100 records' worth of bytes. Charged in
    // byte-equivalents, two near-full bodies spend ~198 of the 200-unit
    // per-client allowance, and the third is refused on the record dimension —
    // by record count these three requests total three records.
    const fatBatch = (): NextRequest =>
      postJson(JSON.stringify({ records: [{ message: 'x'.repeat(63 * 1024), event: EVENT }] }));

    expect((await POST(fatBatch())).status).toBe(204);
    expect((await POST(fatBatch())).status).toBe(204);

    const res = await POST(fatBatch());

    expect(res.status).toBe(429);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({ reason: 'record_budget_exhausted' }),
    );
  });

  it('holds the record ceiling under concurrent in-flight requests', async () => {
    // Five bodies in flight at once, 50 records each, against a 200-unit
    // allowance: whatever order the reads land in, exactly four batches fit and
    // the fifth pays for a refused batch — the ticket design the two-part
    // charge exists for.
    const responses = await Promise.all(Array.from({ length: 5 }, () => POST(batchOf(50))));

    const statuses = responses.map((res) => res.status).sort((a, b) => a - b);
    expect(statuses).toEqual([204, 204, 204, 204, 429]);
    expect(mockWrite).toHaveBeenCalledTimes(200);
  });

  it('emits each record and responds 204', async () => {
    const res = await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'a', event: EVENT },
            { message: 'b', event: EVENT },
          ],
        }),
      ),
    );
    expect(res.status).toBe(204);
    expect(mockWrite).toHaveBeenCalledTimes(2);
  });

  it('forces server-authoritative fields and derives the level from the event', async () => {
    await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'x', event: EVENT, level: 999, source: 'spoofed', ingestedAt: 'fake' },
          ],
        }),
      ),
    );
    const record = mockWrite.mock.calls[0]![0];
    expect(record.source).toBe('frontend-client');
    // client.session.start is an info event. The caller's 999 is DISCARDED, not
    // clamped — clamping was the earlier design and it still let the caller
    // pick any severity inside the legal range.
    expect(record.level).toBe(30);
    expect(typeof record.ingestedAt).toBe('string');
    expect(record.ingestedAt).not.toBe('fake');
  });

  it('never writes an attacker-chosen fatal — severity is server-owned per event', async () => {
    // Level is what alerting and paging key on, and this route is anonymous.
    // The catalog assigns no client event the 60 that pages: even
    // client.error.boundary, which the global boundary emits locally at fatal,
    // lands at 50 here.
    await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'boom', event: 'client.error.boundary', level: 60 },
            { message: 'storm', event: 'client.error.unhandled', level: 60 },
          ],
        }),
      ),
    );

    const levels = mockWrite.mock.calls.map((call) => call[0].level);
    expect(levels).toEqual([50, 50]);
  });

  it('skips records with an unknown event, or none — the catalog binds server-side', async () => {
    // The browser enforces the catalog too (isEventName, client-logger.ts), but
    // the browser check binds nobody. Unknown, prototype-key, and event-less
    // records are dropped here — and were still charged with the batch, so
    // probing with garbage is not free.
    await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'kept', event: EVENT },
            { message: 'unknown', event: 'made.up.event' },
            { message: 'prototype key', event: 'constructor' },
            { message: 'no event at all' },
          ],
        }),
      ),
    );

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0]![0].message).toBe('kept');
  });

  it('refuses server-named catalog events — only client.* records are ingestible', async () => {
    // Catalog membership alone was the earlier gate, and the catalog also holds
    // every event only SERVER code emits. That let an anonymous caller
    // fabricate — during an attack — the exact lines an operator reads to
    // diagnose one, including this limiter's own alarms.
    await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'kept', event: EVENT },
            { message: 'forged throttle alarm', event: 'server.client_logs.throttled' },
            { message: 'forged saturation alarm', event: 'server.client_logs.store_saturated' },
            { message: 'forged degraded proxy', event: 'server.trust_proxy.degraded' },
            { message: 'forged server error', event: 'server.error.unhandled' },
            { message: 'forged gateway failure', event: 'gateway.request.failed' },
            { message: 'forged auth failure', event: 'auth.login.session_missing' },
          ],
        }),
      ),
    );

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite.mock.calls[0]![0].message).toBe('kept');
  });

  it('accepts every client event the catalog registers', async () => {
    // The other side of the gate: narrowing it must not quietly drop a real
    // browser event. Driven off CLIENT_INGESTIBLE_EVENTS itself, so a new
    // client.* event is covered the moment it is registered.
    const ingestible = Object.keys(CLIENT_INGESTIBLE_EVENTS);
    expect(ingestible.length).toBeGreaterThan(0);

    await POST(
      postJson(
        JSON.stringify({
          records: ingestible.map((event) => ({ message: event, event })),
        }),
      ),
    );

    expect(mockWrite.mock.calls.map((call) => call[0].event)).toEqual(ingestible);
  });

  it('writes the catalog event name even when redaction would have eaten it', async () => {
    // `sanitizeLogRecord` replaces any three-segment dot-joined value whose
    // segments are each 8+ characters with [REDACTED], and an event name is
    // three dot-separated segments by construction — so a long enough name is
    // redacted out of the very record whose `level` was derived from it,
    // leaving an error line that names no event. Nothing in today's catalog is
    // long enough, so the case is fabricated: the catalog is widened for one
    // request and restored immediately.
    const LONG_EVENT = 'clientside.telemetry.completed';
    // The premise, asserted rather than assumed — if the sanitizer stops
    // eating names of this shape, this case must stop claiming to cover it.
    expect(sanitizeLogRecord({ event: LONG_EVENT }).event).toBe('[REDACTED]');

    const ingestible = CLIENT_INGESTIBLE_EVENTS as Record<string, true>;
    const levels = FRONTEND_LOG_EVENT_LEVELS as Record<string, number>;
    ingestible[LONG_EVENT] = true;
    levels[LONG_EVENT] = 50;

    try {
      await POST(postJson(JSON.stringify({ records: [{ message: 'x', event: LONG_EVENT }] })));
    } finally {
      delete ingestible[LONG_EVENT];
      delete levels[LONG_EVENT];
    }

    const record = mockWrite.mock.calls[0]![0];
    expect(record.event).toBe(LONG_EVENT);
    expect(record.level).toBe(50);
  });

  it('re-runs redaction server-side on untrusted records', async () => {
    await POST(
      postJson(JSON.stringify({ records: [{ message: 'x', event: EVENT, password: 'hunter2' }] })),
    );
    const record = mockWrite.mock.calls[0]![0];
    expect(record.context.password).toBe('[REDACTED]');
  });

  it('prefers a valid per-record correlationId, else the request header', async () => {
    await POST(
      postJson(
        JSON.stringify({
          records: [
            { message: 'a', event: EVENT, correlationId: 'rec-corr_1' },
            { message: 'b', event: EVENT },
          ],
        }),
        { 'x-correlation-id': 'hdr-corr_2' },
      ),
    );
    const [first, second] = mockWrite.mock.calls.map((call) => call[0]);
    expect(first.correlationId).toBe('rec-corr_1');
    expect(first.requestId).toBe('rec-corr_1');
    expect(second.correlationId).toBe('hdr-corr_2');
  });

  it('429s with Retry-After once the allowance is spent', async () => {
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });

    const res = await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('rejects on the rate limit before reading the body at all', async () => {
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });

    // Oversized AND unparseable: either would be rejected on its own, so a 429
    // here is only possible if the limit is checked before both.
    const res = await POST(
      postJson('not json', {
        'content-length': String(1024 * 1024),
        'x-forwarded-for': '1.1.1.1',
      }),
    );

    expect(res.status).toBe(429);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('counts each client address separately when a proxy hop is trusted', async () => {
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });

    expect((await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }))).status).toBe(429);
    expect((await POST(emptyBatch({ 'x-forwarded-for': '2.2.2.2' }))).status).toBe(204);
  });

  it('ignores an appended source port, so one client cannot mint a bucket per connection', async () => {
    // Azure App Service (and ALB with port appending) writes the port into the
    // chain. Keeping it would make each of these a fresh bucket, and the limit
    // would never fire for a real client.
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1:40001' });

    expect((await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1:59999' }))).status).toBe(429);
    expect((await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }))).status).toBe(429);
  });

  it('holds a caller with no trusted address to the whole-app allowance, not the per-client one', async () => {
    // No X-Forwarded-For, so the shared bucket is this caller's only meter: it
    // has to be a separate, larger figure, or an untrusted-topology deployment
    // would drop real logs at the per-client rate.
    await exhaustAllowance(SHARED_RATE_LIMIT, ANONYMOUS);

    expect((await POST(emptyBatch(ANONYMOUS))).status).toBe(429);
    // The shared window is the WHOLE-APP ceiling and every caller spends it, so
    // once it is gone a trusted address is refused too — fresh addresses do not
    // buy a way around the global cap.
    expect((await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }))).status).toBe(429);
  });

  it('caps a distributed caller at the global ceiling — fresh addresses do not multiply it', async () => {
    // The gap this closes: per-client XOR shared bucketing had no global
    // ceiling at all once TRUST_PROXY was set — ~2 800 buckets times the
    // per-client allowance, with nothing above them. Every request now spends
    // the shared window alongside its own bucket, so eight requests from eight
    // addresses exhaust it even though each address has spent 1 of its 5.
    for (let index = 0; index < SHARED_RATE_LIMIT; index += 1) {
      const res = await POST(emptyBatch({ 'x-forwarded-for': `10.0.0.${index + 1}` }));
      expect(res.status).toBe(204);
    }

    const res = await POST(emptyBatch({ 'x-forwarded-for': '10.0.1.99' }));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Loud, and attributed to the whole-app ceiling: a silent global cap is an
    // observability outage, not a security win.
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({
        reason: 'window_exhausted',
        sharedBucket: true,
        limitPerMinute: SHARED_RATE_LIMIT,
        degraded: false,
      }),
    );
  });

  it('reports the throttle once, with enough detail to act on', async () => {
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });
    await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }));
    await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }));

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.throttled'], {
      reason: 'window_exhausted',
      limitPerMinute: RATE_LIMIT,
      // The one line stands for itself; the silent rejection after it is carried
      // into the next window's report rather than lost.
      rejectedSinceLastReport: 1,
      bucketCount: 1,
      sharedBucket: false,
      degraded: false,
    });
  });

  it('reports the shared bucket as such, so app-wide starvation is distinguishable', async () => {
    await exhaustAllowance(SHARED_RATE_LIMIT, ANONYMOUS);
    await POST(emptyBatch(ANONYMOUS));

    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({
        sharedBucket: true,
        limitPerMinute: SHARED_RATE_LIMIT,
        // An ordinary untrusted-topology rejection: the map never touched it.
        degraded: false,
      }),
    );
  });

  it('serves a newcomer from the shared bucket once the key map is saturated, and reports it', async () => {
    // Reached through the module rather than the handler: the point is the
    // route's behaviour AT the ceiling, and driving ten thousand HTTP requests
    // to get there would test the loop, not the route. Refusing the newcomer
    // was the earlier design and it turned a spray into app-wide telemetry
    // denial; the newcomer now shares the whole-app allowance instead.
    // The spray itself spends the shared window too — every request does — so
    // the whole-app allowance is raised to hold the spray plus three newcomers:
    // a spray big enough to pin the map now has to FIT UNDER the global ceiling
    // to get there at all.
    const maxKeys = resolveClientLogRateMaxKeys(RATE_LIMIT);
    mockEnv = { ...baseEnv, CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: maxKeys + 3 };
    resetClientLogRateLimit();
    const now = Date.now();
    for (let index = 0; index < maxKeys; index += 1) {
      checkClientLogRateLimit(
        `ip:10.${(index >> 16) % 256}.${(index >> 8) % 256}.${index % 256}`,
        now,
      );
    }

    expect((await POST(emptyBatch({ 'x-forwarded-for': '203.0.113.7' }))).status).toBe(204);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.store_saturated'],
      expect.objectContaining({ maxKeys }),
    );

    // Degradation is not a bypass: newcomers burn the shared window, and the
    // one after it is exhausted gets the shared bucket's 429.
    await POST(emptyBatch({ 'x-forwarded-for': '203.0.113.8' }));
    await POST(emptyBatch({ 'x-forwarded-for': '203.0.113.9' }));
    const res = await POST(emptyBatch({ 'x-forwarded-for': '203.0.113.10' }));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // `degraded: true` is what tells this 429 apart from the ordinary
    // untrusted-topology shared-bucket one: the lever is the per-client
    // allowance (the map grows back as it shrinks), not the shared allowance.
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({ reason: 'window_exhausted', sharedBucket: true, degraded: true }),
    );
  });

  it('still admits an address-less caller once the key map is saturated', async () => {
    // The shared bucket is one fixed key and adds no cardinality, so the ceiling
    // must not close it. Refusing it was the earlier design and it dropped every
    // caller whose address could not be vouched for — app-wide — because of
    // other clients' cardinality.
    const maxKeys = resolveClientLogRateMaxKeys(RATE_LIMIT);
    mockEnv = { ...baseEnv, CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: maxKeys + 8 };
    resetClientLogRateLimit();
    const now = Date.now();
    for (let index = 0; index < maxKeys; index += 1) {
      checkClientLogRateLimit(
        `ip:10.${(index >> 16) % 256}.${(index >> 8) % 256}.${index % 256}`,
        now,
      );
    }

    // No trusted address lands in the shared bucket directly; a per-client
    // newcomer is degraded into the same bucket beside it.
    expect((await POST(emptyBatch(ANONYMOUS))).status).toBe(204);
    expect((await POST(emptyBatch({ 'x-forwarded-for': '203.0.113.7' }))).status).toBe(204);
  });

  it('still answers 429 when the throttle report cannot be written', async () => {
    // The sink is what a throttle record is about, so it is the thing most
    // likely to be down when one is written. An unguarded report turned the
    // rejection into a 500 from the log-ingest route.
    mockWarn.mockImplementation(() => {
      throw new Error('sink unavailable');
    });
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });

    const res = await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('does not let a junk X-Forwarded-For mint a bucket per request', async () => {
    // Anything that is not an IP literal falls to the shared bucket instead of
    // becoming a key, so a caller writing the selected entry cannot spray the
    // map into saturation and push every genuine newcomer into degradation.
    for (let index = 0; index < SHARED_RATE_LIMIT; index += 1) {
      const res = await POST(emptyBatch({ 'x-forwarded-for': `junk-${index}` }));
      expect(res.status).toBe(204);
    }

    // All of them spent the ONE shared allowance rather than opening buckets.
    expect((await POST(emptyBatch({ 'x-forwarded-for': 'junk-final' }))).status).toBe(429);
    // And because that allowance is the whole-app ceiling every caller spends,
    // a real address is refused on it too until the window slides — junk cannot
    // mint buckets, but it spends the global window like anyone else.
    expect((await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }))).status).toBe(429);
  });

  it('does not report both a per-client and a shared throttle on one slot', async () => {
    // One abuser tripping the per-client limit must not silence the record that
    // says every address-less caller is being dropped app-wide.
    await exhaustAllowance(RATE_LIMIT, { 'x-forwarded-for': '1.1.1.1' });
    await POST(emptyBatch({ 'x-forwarded-for': '1.1.1.1' }));

    // The five admitted requests above spent the shared window too, so only
    // the remainder is left before the whole-app ceiling fires.
    await exhaustAllowance(SHARED_RATE_LIMIT - RATE_LIMIT, ANONYMOUS);
    await POST(emptyBatch(ANONYMOUS));

    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenNthCalledWith(
      1,
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({ sharedBucket: false }),
    );
    expect(mockWarn).toHaveBeenNthCalledWith(
      2,
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({ sharedBucket: true }),
    );
  });

  it('429s once a caller crosses the ingest ceiling, with requests still to spare', async () => {
    // The gap a request-only cap left open: MAX_RECORDS is 100, so two batches
    // spend the whole record allowance while spending two of five requests. A
    // caller who packs every batch was buying ~100x the ingest of one who does
    // not, against a limit whose job is bounding what the sink swallows.
    expect((await POST(batchOf(100))).status).toBe(204);
    expect((await POST(batchOf(100))).status).toBe(204);

    const res = await POST(batchOf(1));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Nothing from the refused batch reached the sink, and nothing beyond the
    // allowance did either.
    expect(mockWrite).toHaveBeenCalledTimes(RECORD_LIMIT);
  });

  it('reports the ingest ceiling with the record allowance, not the request one', async () => {
    await POST(batchOf(100));
    await POST(batchOf(100));
    await POST(batchOf(1));

    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({
        reason: 'record_budget_exhausted',
        // The dimension that actually ran out. Sending the request figure here
        // would point the operator at the knob that is not binding.
        limitPerMinute: RECORD_LIMIT,
        sharedBucket: false,
      }),
    );
  });

  it('charges only the records it will actually write', async () => {
    // The route truncates to MAX_RECORDS (100), so a 250-record batch costs 100.
    // Charging what was SENT rather than what was written would bill a caller
    // for records that never reached the sink — and this first batch alone would
    // then blow the 200 allowance.
    expect((await POST(batchOf(250))).status).toBe(204);
    expect(mockWrite).toHaveBeenCalledTimes(100);

    expect((await POST(batchOf(100))).status).toBe(204);
    // 200 charged, so the ceiling binds exactly here and not before.
    expect((await POST(batchOf(1))).status).toBe(429);
  });

  it('holds every caller to the whole-app ingest ceiling once it is spent', async () => {
    // Three anonymous full batches leave 20 units of the 320-unit shared
    // record window; the fourth crosses it — and pays anyway, charges stand.
    expect((await POST(batchOf(100, ANONYMOUS))).status).toBe(204);
    expect((await POST(batchOf(100, ANONYMOUS))).status).toBe(204);
    expect((await POST(batchOf(100, ANONYMOUS))).status).toBe(204);

    const res = await POST(batchOf(21, ANONYMOUS));

    expect(res.status).toBe(429);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.throttled'],
      expect.objectContaining({
        reason: 'record_budget_exhausted',
        limitPerMinute: SHARED_RECORD_LIMIT,
        sharedBucket: true,
      }),
    );

    // The shared record window is the whole-app ingest ceiling and every batch
    // spends it, so a trusted address with per-client headroom to spare is
    // refused on it too — the distributed caller's batches cannot multiply the
    // ingest the way per-client-only metering allowed.
    expect((await POST(batchOf(100))).status).toBe(429);
  });

  it('makes a refused batch pay for itself, so headroom cannot be probed for free', async () => {
    // Refunding an over-budget batch would let a caller send 100, get refused,
    // and send 100 again forever.
    expect((await POST(batchOf(100))).status).toBe(204);
    expect((await POST(batchOf(100))).status).toBe(204);
    expect((await POST(batchOf(100))).status).toBe(429);
    expect((await POST(batchOf(1))).status).toBe(429);
  });

  it('spends the request allowance on a malformed body, so garbage is not free', async () => {
    // The request charge lands before the body is read, so a caller looping on
    // unparseable payloads is stopped by the same limit as one sending valid
    // ones — it never gets us to parse, sanitise, or write anything.
    for (let index = 0; index < RATE_LIMIT; index += 1) {
      expect((await POST(postJson('not json'))).status).toBe(400);
    }

    expect((await POST(emptyBatch())).status).toBe(429);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('caps the number of records processed per request', async () => {
    const records = Array.from({ length: 250 }, (_, index) => ({
      message: String(index),
      event: EVENT,
    }));
    await POST(postJson(JSON.stringify({ records })));
    expect(mockWrite).toHaveBeenCalledTimes(100);
  });
});
