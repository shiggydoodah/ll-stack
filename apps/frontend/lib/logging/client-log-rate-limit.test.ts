import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetServerEnv, mockWarn } = vi.hoisted(() => ({
  mockGetServerEnv: vi.fn(),
  mockWarn: vi.fn(),
}));
vi.mock('../../config/env', () => ({ getServerEnv: mockGetServerEnv }));
// The limiter reports its own degraded mode, and the logger resolves its level
// from the very env that failed — so it has to be mocked, not exercised.
vi.mock('./server-logger', () => ({ serverLogger: { warn: mockWarn } }));

import { CLIENT_LOG_RATE_LIMIT_MAX } from '../../config/env.schema';
import { FRONTEND_LOG_EVENTS } from './log-events';
import {
  CLIENT_LOG_RATE_CONFIG_RETRY_MS,
  CLIENT_LOG_RATE_FALLBACK_LIMIT,
  CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT,
  CLIENT_LOG_RATE_FALLBACK_SHARED_LIMIT,
  CLIENT_LOG_RATE_FALLBACK_SHARED_RECORD_LIMIT,
  CLIENT_LOG_RATE_MAX_KEYS,
  CLIENT_LOG_RATE_MAX_TRACKED_HITS,
  CLIENT_LOG_RATE_MIN_KEYS,
  CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE,
  CLIENT_LOG_RATE_WINDOW_MS,
  SHARED_BUCKET_KEY,
  chargeClientLogRecords,
  checkClientLogRateLimit,
  reportClientLogRefusal,
  resolveClientLogRateLimitKey,
  resolveClientLogRateMaxKeys,
  resetClientLogRateLimit,
  type ClientLogRateTicket,
} from './client-log-rate-limit';

const configure = (env: {
  limit?: number;
  sharedLimit?: number;
  recordLimit?: number;
  sharedRecordLimit?: number;
  trustProxy?: number;
  allowedOrigin?: string;
}): void => {
  mockGetServerEnv.mockReturnValue({
    CLIENT_LOG_RATE_LIMIT_PER_MINUTE: env.limit ?? 3,
    CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: env.sharedLimit ?? 10,
    // Deliberately generous by default so the request-dimension cases above are
    // never quietly decided by the record ceiling; the record cases below set it.
    CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: env.recordLimit ?? 1_000,
    CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: env.sharedRecordLimit ?? 1_000,
    TRUST_PROXY: env.trustProxy ?? 0,
    // Unset by default, which is the shipped default and the mode the refusal
    // cases below report as `host`.
    CLIENT_LOG_ALLOWED_ORIGIN: env.allowedOrigin,
  });
  // The module memoises the config on first read; drop it so this call wins.
  resetClientLogRateLimit();
};

/** Admits one request and hands back the ticket its record charge needs. */
const admit = (key: string, nowMs: number): ClientLogRateTicket => {
  const decision = checkClientLogRateLimit(key, nowMs);
  expect(decision.allowed).toBe(true);
  expect(decision.ticket).toBeDefined();
  return decision.ticket!;
};

// A fixed clock. Every check takes `nowMs` explicitly, so the window is driven
// by arithmetic rather than by fake timers.
const T0 = 1_700_000_000_000;

const headers = (value?: string): Headers =>
  new Headers(value === undefined ? {} : { 'x-forwarded-for': value });

/** Distinct, valid client keys — the only shape `resolveClientLogRateLimitKey` emits. */
const clientKey = (index: number): string =>
  `ip:10.${Math.floor(index / 65_536) % 256}.${Math.floor(index / 256) % 256}.${index % 256}`;

describe('checkClientLogRateLimit', () => {
  beforeEach(() => {
    mockGetServerEnv.mockReset();
    mockWarn.mockReset();
    configure({ limit: 3 });
  });

  it('admits up to the configured allowance and rejects the next request', () => {
    for (let index = 0; index < 3; index += 1) {
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + index).allowed).toBe(true);
    }

    const denied = checkClientLogRateLimit('ip:1.2.3.4', T0 + 3);

    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('window_exhausted');
    expect(denied.limit).toBe(3);
    // The whole window still has to elapse before the oldest hit retires.
    expect(denied.retryAfterSeconds).toBe(60);
  });

  it('counts each bucket independently', () => {
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);

    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).allowed).toBe(false);
    expect(checkClientLogRateLimit('ip:5.6.7.8', T0).allowed).toBe(true);
  });

  it('charges every per-client request against the whole-app window as well', () => {
    configure({ limit: 3, sharedLimit: 5 });

    // Five distinct addresses, each far inside its own allowance...
    for (let index = 0; index < 5; index += 1) {
      expect(checkClientLogRateLimit(clientKey(index), T0).allowed).toBe(true);
    }

    // ...and the sixth is refused on the WHOLE-APP window. Per-client XOR
    // shared was the earlier design, and it left no global ceiling at all once
    // TRUST_PROXY was set — fresh addresses multiplied the allowance freely.
    const denied = checkClientLogRateLimit(clientKey(5), T0);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('window_exhausted');
    expect(denied.sharedBucket).toBe(true);
    expect(denied.limit).toBe(5);
    // Topology was fine and the map has room — this is the global ceiling, not
    // degradation.
    expect(denied.degraded).toBe(false);
  });

  it('slides: a hit retires one window after it was made, not on a boundary', () => {
    checkClientLogRateLimit('ip:1.2.3.4', T0);
    checkClientLogRateLimit('ip:1.2.3.4', T0 + 10_000);
    checkClientLogRateLimit('ip:1.2.3.4', T0 + 20_000);
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + 30_000).allowed).toBe(false);

    // The first hit is still live one millisecond short of a full window.
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS - 1).allowed).toBe(
      false,
    );
    // And retires exactly on it, freeing one allowance — but only one.
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS).allowed).toBe(
      true,
    );
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS).allowed).toBe(
      false,
    );
  });

  it('does not count a rejected request, so hammering cannot extend the lockout', () => {
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);

    // Keep hammering right up to the moment the first window's hits retire.
    for (let offset = 1; offset < CLIENT_LOG_RATE_WINDOW_MS; offset += 1_000) {
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + offset).allowed).toBe(false);
    }

    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS).allowed).toBe(
      true,
    );
  });

  it('advertises the seconds until the next allowance frees up', () => {
    checkClientLogRateLimit('ip:1.2.3.4', T0);
    checkClientLogRateLimit('ip:1.2.3.4', T0 + 1_000);
    checkClientLogRateLimit('ip:1.2.3.4', T0 + 2_000);

    // 30s in, the oldest hit has 30s of its window left.
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + 30_000).retryAfterSeconds).toBe(30);
    // Never zero: a Retry-After of 0 invites an immediate retry.
    expect(
      checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS - 1).retryAfterSeconds,
    ).toBe(1);
  });

  it('reports at most once per window, so rejections cannot amplify into log volume', () => {
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);

    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).shouldReport).toBe(true);
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + 1).shouldReport).toBe(false);
    expect(
      checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_WINDOW_MS - 1).shouldReport,
    ).toBe(false);

    // A window on, the first three hits have retired: spend the allowance again
    // and the next rejection re-arms the report.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', rolled);

    expect(checkClientLogRateLimit('ip:1.2.3.4', rolled).shouldReport).toBe(true);
  });

  it('never flags an admitted request for reporting', () => {
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).shouldReport).toBe(false);
  });

  it('counts the rejections the once-per-window report stands for', () => {
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);

    // The first rejection reports, and stands for itself alone.
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).rejectedSinceLastReport).toBe(1);
    // The silent ones in between are still counted, just not reported.
    for (let index = 0; index < 4; index += 1) {
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0 + index).rejectedSinceLastReport).toBe(0);
    }

    // A window on, the next report carries the four it swallowed plus itself.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', rolled);

    expect(checkClientLogRateLimit('ip:1.2.3.4', rolled).rejectedSinceLastReport).toBe(5);
  });

  it('gives each (reason, bucket kind) its own report slot, so one abuser cannot mask the rest', () => {
    configure({ limit: 3, sharedLimit: 5 });

    // A per-client bucket fills and takes ITS slot for the window.
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).shouldReport).toBe(true);
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).shouldReport).toBe(false);

    // The whole-app ceiling filling is a different situation entirely — every
    // real user's telemetry is being dropped — so it reports NOW, not in sixty
    // seconds' time once the abuser's slot happens to free up. The three
    // admitted requests above already spent 3 of the shared window's 5.
    for (let index = 0; index < 2; index += 1) checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);
    const shared = checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);

    expect(shared.shouldReport).toBe(true);
    expect(shared.sharedBucket).toBe(true);
    // And it carries its own count, not the per-client bucket's.
    expect(shared.rejectedSinceLastReport).toBe(1);
  });

  it('keeps each report slot counting its own channel', () => {
    configure({ limit: 3, sharedLimit: 5 });

    // Three per-client admissions spend 3 of the shared 5; two shared-only
    // requests spend the rest.
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);
    for (let index = 0; index < 2; index += 1) checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);

    // Both channels report their first rejection, then fall silent.
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).rejectedSinceLastReport).toBe(1);
    expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).rejectedSinceLastReport).toBe(1);

    // Three more per-client rejections and one more shared one, all silent.
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', T0);
    checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);

    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    for (let index = 0; index < 3; index += 1) checkClientLogRateLimit('ip:1.2.3.4', rolled);
    for (let index = 0; index < 2; index += 1) checkClientLogRateLimit(SHARED_BUCKET_KEY, rolled);

    // Each carries only what its own channel swallowed: 3 + itself, and 1 + itself.
    expect(checkClientLogRateLimit('ip:1.2.3.4', rolled).rejectedSinceLastReport).toBe(4);
    expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, rolled).rejectedSinceLastReport).toBe(2);
  });

  it('reports the live bucket count and whether the shared bucket was the one that filled', () => {
    checkClientLogRateLimit('ip:1.2.3.4', T0);
    checkClientLogRateLimit('ip:5.6.7.8', T0);

    const perClient = checkClientLogRateLimit('ip:1.2.3.4', T0);
    // Two PER-CLIENT buckets: the always-live shared bucket is deliberately not
    // counted — it is budgeted by the reserve, not a key slot, and would only
    // add a constant 1 to every figure.
    expect(perClient.bucketCount).toBe(2);
    expect(perClient.sharedBucket).toBe(false);

    expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).sharedBucket).toBe(true);
  });

  it('sweeps before reporting, so bucketCount is live rather than a high-water mark', () => {
    // `bucketCount` is the operator's discriminator between one caller hammering
    // the endpoint and broad traffic. Buckets are otherwise only swept when the
    // map saturates, so without a sweep here this was the count of every address
    // seen since boot — never "low" on an app that has been up a while, which is
    // exactly the reading the throttle record invites.
    configure({ limit: 1 });
    for (let index = 1; index <= 5; index += 1) {
      checkClientLogRateLimit(`ip:10.0.0.${index}`, T0);
    }

    // A window on, all five are dead but nothing has swept them.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    expect(checkClientLogRateLimit('ip:9.9.9.9', rolled).bucketCount).toBe(6);

    // The rejection that reports sweeps first: only the live bucket is counted.
    const denied = checkClientLogRateLimit('ip:9.9.9.9', rolled);

    expect(denied.shouldReport).toBe(true);
    expect(denied.bucketCount).toBe(1);
  });

  it('reports a saturated map once per window, on its own channel', () => {
    // Degradation is silent per-request by design — the caller still gets a
    // 2xx — so this report is the only way an operator learns the map is
    // pinned. Once per window, or a spray would amplify itself into log volume.
    // The spray spends the shared window too (every request does), so it is
    // raised to hold the spray plus the degraded newcomers.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      checkClientLogRateLimit(clientKey(index), T0);
    }

    checkClientLogRateLimit('ip:203.0.113.1', T0);
    checkClientLogRateLimit('ip:203.0.113.2', T0 + 1);
    checkClientLogRateLimit('ip:203.0.113.3', T0 + 2);

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.store_saturated'],
      {
        bucketCount: CLIENT_LOG_RATE_MAX_KEYS,
        maxKeys: CLIENT_LOG_RATE_MAX_KEYS,
        degradedSinceLastReport: 1,
      },
    );
  });

  it('holds the shared bucket to the whole-app allowance, not the per-client one', () => {
    configure({ limit: 3, sharedLimit: 10 });

    // The per-client figure would have stopped this at three.
    for (let index = 0; index < 10; index += 1) {
      expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).allowed).toBe(true);
    }

    const denied = checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);

    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(10);
    expect(denied.sharedBucket).toBe(true);
  });

  it('degrades a newcomer to the shared bucket at the key ceiling, evicting and refusing nothing', () => {
    // Failing closed was the earlier design and it starved the wrong party:
    // only a source holding thousands of distinct networks can fill the map
    // (the /56 keying prices out a single delegation), and that source has no
    // use for the eviction escape hatch a refusal guards against — while every
    // legitimate newcomer was 429'd for as long as the spray ran. Cardinality
    // pressure now costs bucketing precision: the newcomer is served from the
    // shared allowance rather than refused for the map's fullness — an
    // allowance that is real and exhaustible, as the next test pins.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      expect(checkClientLogRateLimit(clientKey(index), T0).allowed).toBe(true);
    }

    const degraded = checkClientLogRateLimit('ip:203.0.113.1', T0);

    expect(degraded.allowed).toBe(true);
    expect(degraded.sharedBucket).toBe(true);
    expect(degraded.degraded).toBe(true);
    // Held to the whole-app allowance, not the per-client one.
    expect(degraded.limit).toBe(CLIENT_LOG_RATE_MAX_KEYS + 10);
    // No bucket was evicted to make room: the earliest key still holds its count.
    const survivor = checkClientLogRateLimit(clientKey(0), T0);
    expect(survivor.allowed).toBe(true);
    expect(survivor.sharedBucket).toBe(false);
    expect(survivor.degraded).toBe(false);
  });

  it('holds degraded newcomers to the shared window, so degradation is not a bypass', () => {
    // The spray spends CLIENT_LOG_RATE_MAX_KEYS of the shared window on its
    // way to pinning the map, leaving exactly two allowances for newcomers.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 2 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      checkClientLogRateLimit(clientKey(index), T0);
    }

    // Two distinct newcomers spend the two shared allowances...
    expect(checkClientLogRateLimit('ip:203.0.113.1', T0).allowed).toBe(true);
    expect(checkClientLogRateLimit('ip:203.0.113.2', T0).allowed).toBe(true);

    // ...and the third is refused on the shared WINDOW, not on the map. The
    // rejection says it was degraded there, so an operator can tell this 429
    // from the untrusted-topology kind that wears the same reason and bucket.
    const denied = checkClientLogRateLimit('ip:203.0.113.3', T0);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('window_exhausted');
    expect(denied.sharedBucket).toBe(true);
    expect(denied.degraded).toBe(true);
  });

  it('serves address-less callers even when the key map is saturated', () => {
    // A spray fills the map with per-client keys. Refusing the shared bucket a
    // slot was the earlier design and it dropped every address-less caller
    // app-wide for cardinality pressure that was never theirs — one fixed key
    // adds none, and the memory budget already reserves for it outside the
    // derived ceiling. The spray spends the shared window too, so ten
    // allowances are left on top of it for this test's callers.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      checkClientLogRateLimit(clientKey(index), T0);
    }

    // Address-less callers are still served, held to the whole-app allowance.
    for (let index = 0; index < 10; index += 1) {
      expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).allowed).toBe(true);
    }
    const denied = checkClientLogRateLimit(SHARED_BUCKET_KEY, T0);
    expect(denied.allowed).toBe(false);
    // Its OWN window, not the map's state — the ceiling never applied to it.
    expect(denied.reason).toBe('window_exhausted');
    expect(denied.limit).toBe(CLIENT_LOG_RATE_MAX_KEYS + 10);
    expect(denied.sharedBucket).toBe(true);
    // The map ceiling never touched this caller, so the flag stays off.
    expect(denied.degraded).toBe(false);

    // The ceiling still binds for keys that do add cardinality: a newcomer is
    // degraded into the shared bucket — which this test has just exhausted — so
    // it shares that window rather than minting a slot.
    const degraded = checkClientLogRateLimit('ip:203.0.113.1', T0);
    expect(degraded.allowed).toBe(false);
    expect(degraded.reason).toBe('window_exhausted');
    expect(degraded.sharedBucket).toBe(true);
    expect(degraded.degraded).toBe(true);
  });

  it('never lets the always-live shared bucket consume a per-client key slot', () => {
    // Every request charges the shared bucket, so it is open from the very
    // first one. Counting it against the key ceiling would permanently spend a
    // derived per-client slot on a bucket the reserve already budgets for —
    // the ceiling therefore counts per-client keys alone, and the full
    // CLIENT_LOG_RATE_MAX_KEYS go to actual clients.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      const admitted = checkClientLogRateLimit(clientKey(index), T0);
      expect(admitted.allowed).toBe(true);
      // A per-client slot, even though the shared bucket has been live since
      // the first iteration.
      expect(admitted.sharedBucket).toBe(false);
    }

    // The key AFTER them still finds the map full and degrades.
    const degraded = checkClientLogRateLimit('ip:203.0.113.1', T0);
    expect(degraded.allowed).toBe(true);
    expect(degraded.sharedBucket).toBe(true);
    expect(degraded.degraded).toBe(true);
  });

  it('will not re-sweep a full map within the floor, even when that costs an admission', () => {
    // At the ceiling, every request carrying a new key would otherwise buy the
    // caller an O(size) scan. The floor is what stops that — and the price is
    // visible here: for up to a second after a fruitless sweep, a newcomer is
    // degraded to the shared bucket even though the map has since gone stale
    // and a sweep would free a slot. Drop the floor and the middle assertion
    // below flips to a per-client admission.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      checkClientLogRateLimit(clientKey(index), T0);
    }

    // Just short of the window: the sweep runs and frees nothing, every hit is
    // still live. This is what arms the floor.
    expect(
      checkClientLogRateLimit('ip:203.0.113.1', T0 + CLIENT_LOG_RATE_WINDOW_MS - 200).sharedBucket,
    ).toBe(true);
    // 200ms later every one of those hits HAS expired, so a sweep would empty the
    // map — but the last one ran inside the floor, so this shares a bucket too.
    expect(
      checkClientLogRateLimit('ip:203.0.113.2', T0 + CLIENT_LOG_RATE_WINDOW_MS).sharedBucket,
    ).toBe(true);
    // And once the floor has passed, the next sweep reclaims all of them.
    const reclaimed = checkClientLogRateLimit(
      'ip:203.0.113.3',
      T0 + CLIENT_LOG_RATE_WINDOW_MS + 900,
    );
    expect(reclaimed.allowed).toBe(true);
    expect(reclaimed.sharedBucket).toBe(false);
  });

  it('reclaims dead buckets, so a quiet key does not hold a slot forever', () => {
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      checkClientLogRateLimit(clientKey(index), T0);
    }

    // One window on, every one of those buckets is dead and the sweep frees
    // them — a real slot, not a degraded shared admission.
    const readmitted = checkClientLogRateLimit('ip:203.0.113.1', T0 + CLIENT_LOG_RATE_WINDOW_MS);
    expect(readmitted.allowed).toBe(true);
    expect(readmitted.sharedBucket).toBe(false);
  });

  it('keeps serving an established client whose bucket retired while a spray pins the map', () => {
    // A bucket whose hits have all retired is deleted, so a client quiet for a
    // window re-enters through `admit` — and while a spray keeps every slot
    // live it cannot have one. Refusing it there was the earlier design, and it
    // turned a spray into app-wide telemetry denial; now it is served from the
    // shared bucket instead, and the only thing lost is per-client precision.
    configure({ limit: 3, sharedLimit: CLIENT_LOG_RATE_MAX_KEYS + 10 });
    expect(checkClientLogRateLimit('ip:198.51.100.7', T0).allowed).toBe(true);

    // One window on, the established client's bucket is dead. A spray now
    // fills the map: the sweep on the way in reclaims the dead bucket, so
    // every slot ends up held by a live attacker key.
    const sprayAt = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    for (let index = 0; index < CLIENT_LOG_RATE_MAX_KEYS; index += 1) {
      expect(checkClientLogRateLimit(clientKey(index), sprayAt).allowed).toBe(true);
    }

    const returning = checkClientLogRateLimit('ip:198.51.100.7', sprayAt + 2_000);
    expect(returning.allowed).toBe(true);
    expect(returning.sharedBucket).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.client_logs.store_saturated'],
      expect.objectContaining({ bucketCount: CLIENT_LOG_RATE_MAX_KEYS }),
    );
  });

  it('shrinks the key ceiling as the allowance rises, so memory stays bounded', () => {
    // The product is what has to be bounded, not either factor: a small allowance
    // gets the full map, and the schema's maximum shrinks it. The shared bucket
    // is held to its OWN, larger allowance, so the budget reserves headroom for
    // it rather than pretending `keys x limit` is the whole footprint.
    expect(resolveClientLogRateMaxKeys(60)).toBe(CLIENT_LOG_RATE_MAX_KEYS);
    // 2 800, not the 5 800 this shipped with: every entry now carries the records
    // charged to it alongside its timestamp, so the same byte budget buys half as
    // many. The figure is asserted rather than derived so that halving the budget
    // again has to come back through this test.
    expect(resolveClientLogRateMaxKeys(300)).toBe(2_800);
    // The top of the range is read from the schema, not copied: raising the cap
    // has to come back through this bound rather than leave it asserted at a
    // figure that is no longer the maximum.
    expect(resolveClientLogRateMaxKeys(CLIENT_LOG_RATE_LIMIT_MAX)).toBe(1_400);

    for (const limit of [1, 60, 120, 300, CLIENT_LOG_RATE_LIMIT_MAX]) {
      const worstCase =
        resolveClientLogRateMaxKeys(limit) * limit + CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE;
      expect(worstCase).toBeLessThanOrEqual(CLIENT_LOG_RATE_MAX_TRACKED_HITS);
    }

    // The floor only binds past the schema's cap; it exists so raising that cap
    // fails safe rather than collapsing the map to nothing.
    expect(resolveClientLogRateMaxKeys(CLIENT_LOG_RATE_LIMIT_MAX)).toBeGreaterThan(
      CLIENT_LOG_RATE_MIN_KEYS,
    );
  });

  it('applies the derived key ceiling to the live map', () => {
    configure({ limit: CLIENT_LOG_RATE_LIMIT_MAX, sharedLimit: 2_000 });
    const derived = resolveClientLogRateMaxKeys(CLIENT_LOG_RATE_LIMIT_MAX);

    for (let index = 0; index < derived; index += 1) {
      expect(checkClientLogRateLimit(clientKey(index), T0).allowed).toBe(true);
    }

    // Well short of CLIENT_LOG_RATE_MAX_KEYS, because the allowance shrank it.
    expect(derived).toBeLessThan(CLIENT_LOG_RATE_MAX_KEYS);
    const degraded = checkClientLogRateLimit('ip:203.0.113.1', T0);
    expect(degraded.allowed).toBe(true);
    expect(degraded.sharedBucket).toBe(true);
  });

  describe('when the env cannot be read', () => {
    const breakEnv = (): void => {
      mockGetServerEnv.mockImplementation(() => {
        throw new Error('env not parsed');
      });
      resetClientLogRateLimit();
    };

    it('falls back to the documented allowances', () => {
      breakEnv();

      for (let index = 0; index < CLIENT_LOG_RATE_FALLBACK_LIMIT; index += 1) {
        expect(checkClientLogRateLimit('ip:1.2.3.4', T0).allowed).toBe(true);
      }
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0).allowed).toBe(false);

      // The per-client admissions above spent the shared window too — every
      // request does — so exactly the remainder of the whole-app fallback is
      // left before it binds.
      const sharedRemainder =
        CLIENT_LOG_RATE_FALLBACK_SHARED_LIMIT - CLIENT_LOG_RATE_FALLBACK_LIMIT;
      for (let index = 0; index < sharedRemainder; index += 1) {
        expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).allowed).toBe(true);
      }
      expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).allowed).toBe(false);
    });

    it('falls back on the record allowances too, so the ingest ceiling never lapses', () => {
      // A degraded config that kept the request cap but dropped the record cap
      // would leave the dimension that actually bounds ingest uncapped, which is
      // the failure this whole fallback exists to prevent.
      breakEnv();

      const ticket = admit('ip:1.2.3.4', T0);

      expect(
        chargeClientLogRecords(ticket, CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT, T0).allowed,
      ).toBe(true);
      const denied = chargeClientLogRecords(admit('ip:1.2.3.4', T0), 1, T0);
      expect(denied.allowed).toBe(false);
      expect(denied.limit).toBe(CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT);

      const shared = admit(SHARED_BUCKET_KEY, T0);
      // The per-client charges above landed on the shared window too (both
      // halves are charged, and refused charges stand), so exactly the
      // remainder of the whole-app record fallback fits.
      expect(
        chargeClientLogRecords(
          shared,
          CLIENT_LOG_RATE_FALLBACK_SHARED_RECORD_LIMIT - CLIENT_LOG_RATE_FALLBACK_RECORD_LIMIT - 1,
          T0,
        ).allowed,
      ).toBe(true);
      expect(chargeClientLogRecords(admit(SHARED_BUCKET_KEY, T0), 1, T0).allowed).toBe(false);
    });

    it('trusts no proxy while degraded, whatever TRUST_PROXY said', () => {
      breakEnv();

      expect(resolveClientLogRateLimitKey(headers('1.2.3.4'))).toBe(SHARED_BUCKET_KEY);
    });

    it('reports the degraded mode once, not once per request', () => {
      breakEnv();

      checkClientLogRateLimit('ip:1.2.3.4', T0);
      checkClientLogRateLimit('ip:1.2.3.4', T0);
      resolveClientLogRateLimitKey(headers('1.2.3.4'));

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith(
        FRONTEND_LOG_EVENTS['server.client_logs.config_unreadable'],
        expect.objectContaining({
          limitPerMinute: CLIENT_LOG_RATE_FALLBACK_LIMIT,
          trustedProxyHops: 0,
        }),
      );
    });

    it('does not memoise the fallback, so a recoverable env is picked back up', () => {
      // Caching the fallback made one early failure discard TRUST_PROXY and the
      // configured allowances for the whole life of the process — a security
      // control silently and permanently degraded by a transient problem.
      breakEnv();
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0).limit).toBe(CLIENT_LOG_RATE_FALLBACK_LIMIT);

      mockGetServerEnv.mockReturnValue({
        CLIENT_LOG_RATE_LIMIT_PER_MINUTE: 7,
        CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: 11,
        CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: 70,
        CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: 110,
        TRUST_PROXY: 1,
      });

      // Past the hold-down, the next request re-attempts the parse and wins.
      const retryAt = T0 + CLIENT_LOG_RATE_CONFIG_RETRY_MS;
      expect(checkClientLogRateLimit('ip:5.6.7.8', retryAt).limit).toBe(7);
      expect(resolveClientLogRateLimitKey(headers('1.2.3.4'))).toBe('ip:1.2.3.4');
    });

    it('holds the fallback between attempts, so a degraded env is not re-parsed per request', () => {
      // `getServerEnv` memoises nothing on failure, so without the hold-down
      // the degraded mode ran a full zod parse of process.env for every call —
      // up to three per request, on the route built to shed floods cheaply.
      breakEnv();

      checkClientLogRateLimit('ip:1.2.3.4', T0);
      expect(mockGetServerEnv).toHaveBeenCalledTimes(1);

      checkClientLogRateLimit('ip:1.2.3.4', T0 + 1);
      checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_CONFIG_RETRY_MS - 1);
      expect(mockGetServerEnv).toHaveBeenCalledTimes(1);

      // The next attempt lands only once the hold-down has passed.
      checkClientLogRateLimit('ip:1.2.3.4', T0 + CLIENT_LOG_RATE_CONFIG_RETRY_MS);
      expect(mockGetServerEnv).toHaveBeenCalledTimes(2);
    });

    it('still applies the limit when the report itself cannot be written', () => {
      breakEnv();
      mockWarn.mockImplementation(() => {
        throw new Error('sink unavailable');
      });

      expect(() => checkClientLogRateLimit('ip:1.2.3.4', T0)).not.toThrow();
      expect(checkClientLogRateLimit('ip:1.2.3.4', T0).limit).toBe(CLIENT_LOG_RATE_FALLBACK_LIMIT);
    });
  });
});

describe('resolveClientLogRateLimitKey', () => {
  beforeEach(() => {
    mockGetServerEnv.mockReset();
    mockWarn.mockReset();
  });

  it('shares one bucket when no proxy is trusted, whatever the caller claims', () => {
    configure({ trustProxy: 0 });

    expect(resolveClientLogRateLimitKey(headers('1.2.3.4'))).toBe(SHARED_BUCKET_KEY);
    expect(resolveClientLogRateLimitKey(headers('9.9.9.9'))).toBe(SHARED_BUCKET_KEY);
  });

  it('takes the last chain entry with one trusted hop', () => {
    configure({ trustProxy: 1 });

    // A caller-supplied value sits to the LEFT of what the proxy appended.
    expect(resolveClientLogRateLimitKey(headers('5.5.5.5, 1.2.3.4'))).toBe('ip:1.2.3.4');
  });

  it('counts hops from the right', () => {
    configure({ trustProxy: 2 });

    expect(resolveClientLogRateLimitKey(headers('5.5.5.5, 1.2.3.4, 10.0.0.1'))).toBe('ip:1.2.3.4');
  });

  it('is unmoved by a caller padding the chain, while the chain is really traversed', () => {
    configure({ trustProxy: 1 });

    // Whatever the caller prepends, the proxy's entry is still the rightmost.
    expect(resolveClientLogRateLimitKey(headers('9.9.9.9, 8.8.8.8, 7.7.7.7, 1.2.3.4'))).toBe(
      'ip:1.2.3.4',
    );
  });

  it('shares a bucket when the chain is shorter than the declared hop count', () => {
    configure({ trustProxy: 2 });

    expect(resolveClientLogRateLimitKey(headers('1.2.3.4'), T0)).toBe(SHARED_BUCKET_KEY);
  });

  it('reports a chain shorter than declared, because that is what an over-declared TRUST_PROXY looks like', () => {
    // A caller has no reason to send FEWER entries than the declared depth, but
    // an operator who set TRUST_PROXY one hop too deep produces it on every
    // request — silently collapsing every caller into the shared bucket for the
    // life of the deployment while their own config reads "per-client buckets
    // are on". Silence here was the same trap server.trust_proxy.degraded exists
    // to close for `true`/`loopback`.
    configure({ trustProxy: 3 });

    expect(resolveClientLogRateLimitKey(headers('1.2.3.4, 5.6.7.8'), T0)).toBe(SHARED_BUCKET_KEY);

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.trust_proxy.chain_too_short'],
      // Lengths and counts only — the chain itself is caller-supplied.
      { declaredHops: 3, chainLength: 2, requestsSinceLastReport: 1 },
    );
  });

  it('reports the short chain once per window, carrying what it swallowed', () => {
    // The condition fires on EVERY request while it lasts, so an unbudgeted
    // record would turn a misconfiguration into a log flood of its own.
    configure({ trustProxy: 3 });

    for (let offset = 0; offset < 5; offset += 1) {
      resolveClientLogRateLimitKey(headers('1.2.3.4'), T0 + offset);
    }
    expect(mockWarn).toHaveBeenCalledTimes(1);

    resolveClientLogRateLimitKey(headers('1.2.3.4'), T0 + CLIENT_LOG_RATE_WINDOW_MS);

    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenLastCalledWith(
      FRONTEND_LOG_EVENTS['server.trust_proxy.chain_too_short'],
      // The four it swallowed, plus itself.
      expect.objectContaining({ requestsSinceLastReport: 5 }),
    );
  });

  it('reports an entry that is not an address — the other shape of the same misconfiguration', () => {
    // The chain is long enough, so TRUST_PROXY is not over-declared; the entry
    // it selected simply is not an IP literal. Proxies that write a hostname or
    // the RFC 7239 `unknown` token produce this on every request, collapsing
    // per-client bucketing for the life of the deployment exactly as a short
    // chain does — and this used to be the silent half of that pair.
    configure({ trustProxy: 1 });

    expect(resolveClientLogRateLimitKey(headers('unknown'), T0)).toBe(SHARED_BUCKET_KEY);

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      FRONTEND_LOG_EVENTS['server.trust_proxy.entry_not_an_address'],
      // Lengths and counts only — the entry itself is caller-supplied. The
      // length is what separates `unknown` (7) from a hostname from garbage.
      { declaredHops: 1, entryLength: 7, requestsSinceLastReport: 1 },
    );
  });

  it('reports the non-address entry once per window, on a slot of its own', () => {
    // Unbudgeted, a proxy misconfiguration would write one record per request —
    // the amplification every report in this module is shaped to avoid.
    configure({ trustProxy: 2 });

    for (let offset = 0; offset < 4; offset += 1) {
      resolveClientLogRateLimitKey(headers('proxy.internal, 5.6.7.8'), T0 + offset);
    }
    expect(mockWarn).toHaveBeenCalledTimes(1);

    // A short chain in the same window is a DIFFERENT misconfiguration with a
    // different lever, so it takes its own slot: neither can mask the other for
    // a whole window.
    resolveClientLogRateLimitKey(headers('1.2.3.4'), T0);
    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenLastCalledWith(
      FRONTEND_LOG_EVENTS['server.trust_proxy.chain_too_short'],
      expect.objectContaining({ declaredHops: 2, chainLength: 1 }),
    );

    resolveClientLogRateLimitKey(
      headers('proxy.internal, 5.6.7.8'),
      T0 + CLIENT_LOG_RATE_WINDOW_MS,
    );
    expect(mockWarn).toHaveBeenCalledTimes(3);
    expect(mockWarn).toHaveBeenLastCalledWith(
      FRONTEND_LOG_EVENTS['server.trust_proxy.entry_not_an_address'],
      // The three it swallowed, plus itself.
      expect.objectContaining({ entryLength: 14, requestsSinceLastReport: 4 }),
    );
  });

  it('stays quiet when the chain is long enough, or when no proxy is trusted at all', () => {
    configure({ trustProxy: 1 });
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4'), T0)).toBe('ip:1.2.3.4');
    // A missing header is an ordinary address-less caller, not a misconfiguration.
    expect(resolveClientLogRateLimitKey(headers(), T0)).toBe(SHARED_BUCKET_KEY);
    // Neither is a header that is present but holds no entries.
    expect(resolveClientLogRateLimitKey(headers('  ,  '), T0)).toBe(SHARED_BUCKET_KEY);

    configure({ trustProxy: 0 });
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4'), T0)).toBe(SHARED_BUCKET_KEY);
    // Trusting nobody is a posture, not a fault: the chain is never read at
    // all, so junk in it is not a condition to report. (A junk entry that IS
    // read gets its own record — see the entry_not_an_address cases above.)
    expect(resolveClientLogRateLimitKey(headers('nonsense'), T0)).toBe(SHARED_BUCKET_KEY);

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('shares a bucket when the header is missing or empty', () => {
    configure({ trustProxy: 1 });

    expect(resolveClientLogRateLimitKey(headers())).toBe(SHARED_BUCKET_KEY);
    expect(resolveClientLogRateLimitKey(headers('  ,  '))).toBe(SHARED_BUCKET_KEY);
  });

  it('drops an appended source port, so one client is one bucket', () => {
    configure({ trustProxy: 1 });

    // Azure App Service always appends it; a fresh port per connection would
    // otherwise buy the same client a fresh allowance every request.
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4:41237'))).toBe('ip:1.2.3.4');
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4:9'))).toBe('ip:1.2.3.4');
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4:41237'))).toBe(
      resolveClientLogRateLimitKey(headers('1.2.3.4:52999')),
    );
  });

  it('drops the port from the bracketed IPv6 form without touching a bare literal', () => {
    configure({ trustProxy: 1 });

    expect(resolveClientLogRateLimitKey(headers('[2001:db8::1]:41237'))).toBe(
      'ip:2001:db8:0:0::/56',
    );
    expect(resolveClientLogRateLimitKey(headers('[2001:db8::1]'))).toBe('ip:2001:db8:0:0::/56');
    // Unbracketed, the colons are the address — nothing may be stripped.
    expect(resolveClientLogRateLimitKey(headers('2001:db8::1'))).toBe('ip:2001:db8:0:0::/56');
    expect(resolveClientLogRateLimitKey(headers('::1'))).toBe('ip:0:0:0:0::/56');
  });

  it('normalises case and drops an IPv6 zone, so one address is one bucket', () => {
    configure({ trustProxy: 1 });

    expect(resolveClientLogRateLimitKey(headers('2001:DB8::1'))).toBe('ip:2001:db8:0:0::/56');
    // A zone is link scope, not identity — and an unbounded suffix a caller
    // could otherwise rotate to mint keys from a single address.
    expect(resolveClientLogRateLimitKey(headers('fe80::1%eth0'))).toBe('ip:fe80:0:0:0::/56');
    expect(resolveClientLogRateLimitKey(headers('fe80::1%eth0'))).toBe(
      resolveClientLogRateLimitKey(headers('fe80::1%eth9')),
    );
  });

  it('collapses an IPv4-mapped IPv6 literal onto the address it spells', () => {
    configure({ trustProxy: 1 });

    // `::ffff:1.2.3.4` is a spelling of `1.2.3.4`, not a second address — the
    // same "one client is one bucket" rule as the case, zone, and port handling.
    // A dual-stack listener that varies the form would otherwise hand one
    // caller two allowances.
    expect(resolveClientLogRateLimitKey(headers('::ffff:1.2.3.4'))).toBe('ip:1.2.3.4');
    expect(resolveClientLogRateLimitKey(headers('::FFFF:1.2.3.4'))).toBe('ip:1.2.3.4');
    expect(resolveClientLogRateLimitKey(headers('[::ffff:1.2.3.4]:41237'))).toBe('ip:1.2.3.4');
    expect(resolveClientLogRateLimitKey(headers('::ffff:1.2.3.4'))).toBe(
      resolveClientLogRateLimitKey(headers('1.2.3.4')),
    );
    // Including the all-hex spelling of the same mapped address, which a
    // text-prefix check would have passed through as a distinct IPv6 literal.
    expect(resolveClientLogRateLimitKey(headers('::ffff:0102:0304'))).toBe('ip:1.2.3.4');

    // Only when the tail really is an IPv4 literal; the prefix is not a licence
    // to key on whatever follows it.
    expect(resolveClientLogRateLimitKey(headers('::ffff:2001:db8::1'))).toBe(SHARED_BUCKET_KEY);
    expect(resolveClientLogRateLimitKey(headers('::ffff:0.0.0'))).toBe(SHARED_BUCKET_KEY);
  });

  it('canonicalises IPv6 spellings, so one address is one bucket however it is written', () => {
    configure({ trustProxy: 1 });

    // Keys are derived from the parsed groups, never the caller-shaped text —
    // a proxy that varies its emitted form must not split one caller across
    // buckets, and a caller choosing spellings must not multiply allowances.
    const spellings = [
      '2001:db8::1',
      '2001:0db8:0000:0000:0000:0000:0000:0001',
      '2001:db8:0:0:0:0:0:1',
    ];
    const keys = new Set(spellings.map((value) => resolveClientLogRateLimitKey(headers(value))));

    expect(keys.size).toBe(1);
  });

  it('buckets IPv6 by /56 network, so rotating through a delegation spends one allowance', () => {
    configure({ trustProxy: 1 });

    // An ordinary v6 subscriber holds a whole delegated /64 (often /56) and can
    // source every request from a fresh, genuine address. Keyed by full address,
    // one host minted a bucket per request until the map pinned at its
    // fail-closed ceiling — app-wide store_saturated from a single client. One
    // delegation must cost one bucket, exactly as one IPv4 address does.
    expect(resolveClientLogRateLimitKey(headers('2001:db8:0:42::1'))).toBe(
      resolveClientLogRateLimitKey(headers('2001:db8:0:37:dead:beef:1234:5678')),
    );
    // A different /56 is a different delegation, and a different bucket.
    expect(resolveClientLogRateLimitKey(headers('2001:db8:0:142::1'))).toBe(
      'ip:2001:db8:0:100::/56',
    );
    expect(resolveClientLogRateLimitKey(headers('2001:db8:1:42::1'))).not.toBe(
      resolveClientLogRateLimitKey(headers('2001:db8:0:42::1')),
    );
  });

  it('refuses anything that is not an IP literal rather than keying on it', () => {
    configure({ trustProxy: 1 });

    // The earlier version lowercased, truncated to 64 chars and used whatever
    // was left, so a caller able to write the selected entry could mint an
    // unbounded number of buckets out of arbitrary strings — and could collide
    // two distinct entries by sharing a 64-character prefix.
    for (const value of [
      'evil.example.com',
      'unknown',
      '1.2.3.4:',
      '999.999.999.999',
      'A'.repeat(500),
      `${'a'.repeat(60)}-one`,
      `${'a'.repeat(60)}-two`,
    ]) {
      expect(resolveClientLogRateLimitKey(headers(value))).toBe(SHARED_BUCKET_KEY);
    }
  });

  it('still accepts the longest legal spelling, now that length is checked first', () => {
    configure({ trustProxy: 1 });

    // `normalizeAddress` checks MAX_KEY_LENGTH before it scans or allocates
    // anything, which means it now measures the entry as RECEIVED rather than
    // after the port and zone are stripped. This is the worst case that still
    // has to survive: a bracketed IPv6 carrying an embedded IPv4 tail, a zone
    // id and a port — 63 characters, one under the cap. If the cap is ever
    // lowered, this is the case that says so.
    const longest = '[2001:0db8:0000:0000:0000:0000:255.255.255.255%enp0s31f6]:65535';
    expect(longest.length).toBe(63);
    expect(resolveClientLogRateLimitKey(headers(longest))).toBe(
      resolveClientLogRateLimitKey(headers('2001:db8::255.255.255.255')),
    );
    expect(resolveClientLogRateLimitKey(headers(longest))).not.toBe(SHARED_BUCKET_KEY);
  });

  it('keeps the shared sentinel out of the address namespace', () => {
    configure({ trustProxy: 1 });

    // Every address-derived key is prefixed, so no header value normalises onto
    // the sentinel. A caller naming it lands where an address-less caller lands
    // anyway — the point is that the two namespaces cannot be confused by a
    // later change to the bucketing rules.
    expect(resolveClientLogRateLimitKey(headers(SHARED_BUCKET_KEY))).toBe(SHARED_BUCKET_KEY);
    expect(resolveClientLogRateLimitKey(headers('ip:1.2.3.4'))).toBe(SHARED_BUCKET_KEY);
    expect(resolveClientLogRateLimitKey(headers('1.2.3.4'))).toBe('ip:1.2.3.4');
  });

  it('does not let a junk chain grow the key map', () => {
    configure({ trustProxy: 1, limit: 3 });

    for (let index = 0; index < 50; index += 1) {
      checkClientLogRateLimit(resolveClientLogRateLimitKey(headers(`junk-${index}`)), T0);
    }

    // All fifty landed in the one shared bucket rather than minting fifty keys.
    // Zero PER-CLIENT buckets: all the junk landed in the shared bucket, which
    // is deliberately excluded from the count.
    expect(checkClientLogRateLimit(SHARED_BUCKET_KEY, T0).bucketCount).toBe(0);
  });
});

// The route refuses cross-site, foreign-Origin and non-JSON requests BEFORE the
// limiter sees them, and answers with a bare status. The browser logger fires
// and forgets, so those refusals were invisible on both sides at once — and the
// one an operator actually meets is a proxy that rewrites Host, which fails the
// Origin check on every real browser request. The budget lives here because the
// report machinery does; a second copy in the route would be one more thing to
// keep in step.
describe('reportClientLogRefusal', () => {
  beforeEach(() => {
    mockGetServerEnv.mockReset();
    mockWarn.mockReset();
    configure({});
  });

  it('reports each reason once per window, carrying what it swallowed', () => {
    for (let offset = 0; offset < 3; offset += 1) {
      reportClientLogRefusal('origin_mismatch', T0 + offset);
    }

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
      reason: 'origin_mismatch',
      refusedSinceLastReport: 1,
      originCheck: 'host',
    });

    reportClientLogRefusal('origin_mismatch', T0 + CLIENT_LOG_RATE_WINDOW_MS);

    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenLastCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
      reason: 'origin_mismatch',
      // The two it swallowed, plus itself.
      refusedSinceLastReport: 3,
      originCheck: 'host',
    });
  });

  it('gives each reason its own slot, so a probe flood cannot hide a broken proxy', () => {
    // Cross-site refusals are what an attack looks like and origin_mismatch is
    // what a misconfiguration looks like. On one shared slot the noisy one would
    // bury the actionable one for a whole window.
    reportClientLogRefusal('cross_site', T0);
    reportClientLogRefusal('cross_site', T0 + 1);
    reportClientLogRefusal('origin_mismatch', T0 + 2);
    reportClientLogRefusal('content_type', T0 + 3);

    // The comparand rides on `origin_mismatch` alone — it means nothing on the
    // other two, and a field that means nothing on a record is one an operator
    // has to learn to ignore.
    expect(mockWarn.mock.calls.map((call) => call[1])).toEqual([
      { reason: 'cross_site', refusedSinceLastReport: 1 },
      { reason: 'origin_mismatch', refusedSinceLastReport: 1, originCheck: 'host' },
      { reason: 'content_type', refusedSinceLastReport: 1 },
    ]);
  });

  it('names the configured origin when one is what the check ran against', () => {
    // The two states this separates both drop 100% of browser telemetry and both
    // used to write identical bytes: the override is not being read, or it is
    // being read and is wrong. Since this variable is itself the repair for the
    // first fault, a typo in it reproduces the fault it was reached for — so the
    // record has to say which one the operator is looking at.
    configure({ allowedOrigin: 'https://app.example.com' });

    reportClientLogRefusal('origin_mismatch', T0);

    expect(mockWarn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.refused'], {
      reason: 'origin_mismatch',
      refusedSinceLastReport: 1,
      originCheck: 'allowed_origin',
      // Operator-set and schema-normalised, so it is ours to record — and the
      // normalised form is the one thing reading the env back does not show. The
      // Host comparand gets no such field: it is caller-written.
      allowedOrigin: 'https://app.example.com',
    });
  });

  it('still refuses when the report itself cannot be written', () => {
    // The sink is exactly what these records are about, so it is the thing most
    // likely to be broken when one is written. A refusal that cannot be logged
    // must still be a refusal — and must not throw into the route.
    mockWarn.mockImplementation(() => {
      throw new Error('sink down');
    });

    expect(() => reportClientLogRefusal('origin_mismatch', T0)).not.toThrow();
  });
});

// The record dimension. A request-only cap metered the wrong thing: one request
// may legally carry MAX_RECORDS (100), so a caller packing every batch bought
// roughly a hundred times the ingest of an honest client for the same allowance
// — against a limit whose stated job is bounding what the log sink swallows.
describe('chargeClientLogRecords', () => {
  beforeEach(() => {
    mockGetServerEnv.mockReset();
    mockWarn.mockReset();
  });

  it('admits batches up to the record allowance and refuses the one that crosses it', () => {
    configure({ limit: 10, recordLimit: 10 });

    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 6, T0).allowed).toBe(true);
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 4, T0).allowed).toBe(true);

    const denied = chargeClientLogRecords(admit('ip:1.2.3.4', T0), 1, T0);

    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('record_budget_exhausted');
    // The RECORD allowance, not the request one — `reason` says which dimension
    // ran out and the limiter has to send the figure that actually bound.
    expect(denied.limit).toBe(10);
    expect(denied.sharedBucket).toBe(false);
  });

  it('binds independently of the request allowance, in both directions', () => {
    // The whole point of a second dimension: neither cap implies the other.
    configure({ limit: 100, recordLimit: 10 });

    // Requests to spare, records exhausted.
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 10, T0).allowed).toBe(true);
    expect(checkClientLogRateLimit('ip:1.2.3.4', T0).allowed).toBe(true);
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 1, T0).reason).toBe(
      'record_budget_exhausted',
    );

    // Records to spare, requests exhausted.
    configure({ limit: 2, recordLimit: 1_000 });
    expect(chargeClientLogRecords(admit('ip:5.6.7.8', T0), 1, T0).allowed).toBe(true);
    expect(chargeClientLogRecords(admit('ip:5.6.7.8', T0), 1, T0).allowed).toBe(true);
    expect(checkClientLogRateLimit('ip:5.6.7.8', T0).reason).toBe('window_exhausted');
  });

  it('charges an empty batch nothing, so a request cap alone still governs it', () => {
    configure({ limit: 10, recordLimit: 1 });

    for (let index = 0; index < 5; index += 1) {
      expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 0, T0).allowed).toBe(true);
    }
  });

  it('makes the refused batch pay for itself, so headroom cannot be probed for free', () => {
    // Refunding an over-budget batch would let a caller re-send forever: try 100,
    // get refused, try 100 again. Paying for what you asked to write is what
    // makes the ceiling hold.
    configure({ limit: 100, recordLimit: 10 });

    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 50, T0).allowed).toBe(false);
    // Still over budget on the next attempt, even though nothing was written.
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 1, T0).allowed).toBe(false);
  });

  it('holds the shared bucket to the whole-app record ceiling', () => {
    configure({ limit: 100, recordLimit: 10, sharedRecordLimit: 30 });

    // The per-client figure would have stopped this at ten.
    expect(chargeClientLogRecords(admit(SHARED_BUCKET_KEY, T0), 30, T0).allowed).toBe(true);

    const denied = chargeClientLogRecords(admit(SHARED_BUCKET_KEY, T0), 1, T0);

    expect(denied.allowed).toBe(false);
    expect(denied.limit).toBe(30);
    expect(denied.sharedBucket).toBe(true);
  });

  it('charges every batch against the whole-app record window as well', () => {
    configure({ limit: 100, recordLimit: 10, sharedRecordLimit: 15 });

    // Two clients, each inside its own record allowance...
    expect(chargeClientLogRecords(admit(clientKey(0), T0), 10, T0).allowed).toBe(true);
    expect(chargeClientLogRecords(admit(clientKey(1), T0), 5, T0).allowed).toBe(true);

    // ...and a third batch is refused on the whole-app record ceiling with
    // per-client headroom to spare — the distributed-ingest gap, closed in the
    // dimension the sink is billed in.
    const denied = chargeClientLogRecords(admit(clientKey(2), T0), 1, T0);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('record_budget_exhausted');
    expect(denied.sharedBucket).toBe(true);
    expect(denied.limit).toBe(15);
  });

  it('retires records with the request that carried them, not on a boundary', () => {
    // The charge lands on ITS OWN entry, which is what makes the record window
    // slide with the request window. Attributing every charge to the newest
    // entry instead would keep the earliest records alive until the LAST request
    // aged out, and the budget would free late and in one lump.
    configure({ limit: 10, recordLimit: 10 });

    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 6, T0);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 10_000), 4, T0 + 10_000);

    // One window after the FIRST request, its six retire and no more — so six is
    // exactly what is free again. Had both charges landed on the newest entry
    // instead, retiring the request at T0 would have freed nothing and this
    // would be refused.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 6, rolled).allowed).toBe(true);
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 1, rolled).allowed).toBe(false);
  });

  it('advertises the expiry of the oldest charged request, not the oldest request', () => {
    // An empty batch costs the sink nothing, so its expiry frees no budget;
    // advertising it would promise headroom that never arrives.
    configure({ limit: 10, recordLimit: 5 });

    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 0, T0);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 20_000), 5, T0 + 20_000);

    const denied = chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 30_000), 1, T0 + 30_000);

    // 50s until the charged request at T0 + 20s retires, not 30s until the empty
    // one at T0 does.
    expect(denied.retryAfterSeconds).toBe(50);
  });

  it('lands the charge on its own entry while a dead prefix is still uncompacted', () => {
    // Retirement advances `start` and defers compaction until the dead prefix
    // outgrows the live remainder, so a charge can arrive while `start` is
    // non-zero — the indexing the head-index refactor introduced. Two dead
    // entries against five live ones stays uncompacted (2 * 2 < 7).
    configure({ limit: 10, recordLimit: 10 });
    admit('ip:1.2.3.4', T0);
    admit('ip:1.2.3.4', T0);
    for (let index = 0; index < 4; index += 1) admit('ip:1.2.3.4', T0 + 30_000);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 30_000), 4, T0 + 30_000);

    // Admitted after the two T0 hits retired: the ticket's entry sits past the
    // dead prefix, and its charge must land there, not `start` entries early.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 6, rolled).allowed).toBe(true);

    // Once the mid-window hits retire, their 4 units free but the 6 charged
    // above must still be live. An off-by-`start` charge would have landed on
    // a mid-window entry and retired here with it.
    const later = T0 + 30_000 + CLIENT_LOG_RATE_WINDOW_MS + 1;
    const denied = chargeClientLogRecords(admit('ip:1.2.3.4', later), 6, later);
    expect(denied.allowed).toBe(false);
    // And the budget frees when the entry actually charged retires.
    expect(denied.retryAfterSeconds).toBe(30);
  });

  it("skips the dead prefix's stale charge values when advertising retry", () => {
    // Retired entries keep their charge values until compaction, so a
    // whole-array scan for the oldest charged entry could land on a dead one
    // and advertise a Retry-After clamped to 1s — headroom that never arrives.
    // Two dead entries charged 3 each against five live ones stays uncompacted.
    configure({ limit: 10, recordLimit: 10 });
    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 3, T0);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 3, T0);
    for (let index = 0; index < 4; index += 1) admit('ip:1.2.3.4', T0 + 30_000);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 30_000), 4, T0 + 30_000);

    // The two T0 charges have retired but still sit, uncompacted, at the head
    // of the array. Only the live 4-unit entry may back the Retry-After.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    const denied = chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 7, rolled);

    expect(denied.allowed).toBe(false);
    // 30s until the charged mid-window entry retires — not the 1s a scan
    // starting at the dead prefix would have advertised.
    expect(denied.retryAfterSeconds).toBe(30);
  });

  it('re-checks entries a slow body charged behind the last scan', () => {
    // The scan for the oldest charged entry resumes where the previous one
    // stopped, so a charge landing BEHIND that position has to pull it back —
    // and one always can: a body read sits between a request's admission and
    // its charge, so a slow request's entry is charged after a later one's.
    configure({ limit: 10, recordLimit: 10 });
    const slowRead = admit('ip:1.2.3.4', T0);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 10_000), 5, T0 + 10_000);

    // A rejection reads — and remembers — the oldest charged entry: T0 + 10s,
    // since the slow read's entry is still uncharged.
    const first = chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 20_000), 6, T0 + 20_000);
    expect(first.allowed).toBe(false);
    expect(first.retryAfterSeconds).toBe(50);

    // The slow body finally lands, charging the T0 entry.
    const denied = chargeClientLogRecords(slowRead, 1, T0 + 20_000);

    expect(denied.allowed).toBe(false);
    // 40s until that T0 entry retires — not the 50s of the entry the previous
    // scan stopped at, which is what a position that only moved forward would
    // still be advertising.
    expect(denied.retryAfterSeconds).toBe(40);
  });

  it('rebases the remembered scan position when the dead prefix is compacted', () => {
    // Compaction renumbers every live entry, so a remembered scan position has
    // to move with them: left stale it sits PAST live charged entries and hides
    // them, advertising a later entry's expiry as the moment budget frees.
    configure({ limit: 10, recordLimit: 10 });
    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 0, T0);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 6, T0);
    // A rejection remembers the second entry as the oldest charged one.
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 5, T0).retryAfterSeconds).toBe(60);

    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 20_000), 1, T0 + 20_000);
    chargeClientLogRecords(admit('ip:1.2.3.4', T0 + 30_000), 1, T0 + 30_000);

    // A window on, the three T0 entries retire — three dead against two live
    // compacts the array (3 * 2 >= 5).
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    const denied = chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 10, rolled);

    expect(denied.allowed).toBe(false);
    // 20s until the T0 + 20s entry retires. Un-rebased, the remembered position
    // would have started past it and advertised the T0 + 30s entry's 30s.
    expect(denied.retryAfterSeconds).toBe(20);
  });

  it('still charges a batch whose request aged out while the body was arriving', () => {
    // A read that outlasts the window is pathological, but the cost was real and
    // dropping it would let a trickle of very slow requests write for free.
    configure({ limit: 10, recordLimit: 4 });
    const stale = admit('ip:1.2.3.4', T0);
    // A later request keeps the bucket itself alive past the window.
    admit('ip:1.2.3.4', T0 + 30_000);

    // A window on, the entry the ticket points at has retired but the bucket has
    // not: the cost falls to the newest live entry rather than on the floor.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    checkClientLogRateLimit('ip:1.2.3.4', rolled);

    expect(chargeClientLogRecords(stale, 5, rolled).allowed).toBe(false);
  });

  it('drops the charge when the whole bucket has aged out, rather than resurrecting it', () => {
    configure({ limit: 10, recordLimit: 4 });
    const stale = admit('ip:1.2.3.4', T0);

    // Every hit retires, so the bucket is dropped and this request opens a new
    // one; the ticket now points at a detached bucket with nothing live.
    const rolled = T0 + CLIENT_LOG_RATE_WINDOW_MS;
    checkClientLogRateLimit('ip:1.2.3.4', rolled);

    expect(chargeClientLogRecords(stale, 100, rolled).allowed).toBe(true);

    // And the 100 landed nowhere: the live bucket still has its full allowance.
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', rolled), 4, rolled).allowed).toBe(true);
  });

  it('slides the window itself, so a slow body is not charged against stale records', () => {
    // A body read sits between the request charge and the record charge, so the
    // request charge's sweep can be out of date by the time the ceiling is
    // checked. Without sliding here, this batch would be refused on budget the
    // caller had already got back.
    configure({ limit: 10, recordLimit: 10 });

    chargeClientLogRecords(admit('ip:1.2.3.4', T0), 10, T0);
    const slowRead = admit('ip:1.2.3.4', T0 + 1);

    // A window after the FIRST request, its ten have retired — and nothing has
    // called `checkClientLogRateLimit` since to notice.
    expect(chargeClientLogRecords(slowRead, 10, T0 + CLIENT_LOG_RATE_WINDOW_MS + 1).allowed).toBe(
      true,
    );
  });

  it('gives the record ceiling its own report slot', () => {
    // Three reasons now share the endpoint, and one caller packing batches must
    // not silence the record that says every real user is being dropped. The
    // shared request window sits above 100 so the request-dimension tail below
    // exhausts the per-client window, not the whole-app one.
    configure({ limit: 100, sharedLimit: 200, recordLimit: 1, sharedRecordLimit: 1 });

    const perClient = chargeClientLogRecords(admit('ip:1.2.3.4', T0), 5, T0);
    expect(perClient.shouldReport).toBe(true);
    expect(chargeClientLogRecords(admit('ip:1.2.3.4', T0), 5, T0).shouldReport).toBe(false);

    const shared = chargeClientLogRecords(admit(SHARED_BUCKET_KEY, T0), 5, T0);
    expect(shared.shouldReport).toBe(true);
    expect(shared.rejectedSinceLastReport).toBe(1);

    // And the request dimension keeps its own, distinct from both. A key the
    // record cases have not touched, so the slot under test is demonstrably the
    // request one rather than a leftover.
    for (let index = 0; index < 100; index += 1) checkClientLogRateLimit('ip:9.9.9.9', T0);
    expect(checkClientLogRateLimit('ip:9.9.9.9', T0).shouldReport).toBe(true);
  });
});
