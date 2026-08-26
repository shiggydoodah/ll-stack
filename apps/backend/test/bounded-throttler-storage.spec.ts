import { Logger } from '@nestjs/common';

import {
  BoundedThrottlerStorage,
  THROTTLE_STORE_PRUNE_INTERVAL_MS,
  type ThrottleDecision,
} from '../src/common/throttling/bounded-throttler.storage';

const TTL_MS = 60_000;
const LIMIT = 3;
const THROTTLER = 'default';

/**
 * A block that outlives its window, so "the window lapsed" and "the block
 * lapsed" can be observed as separate events. With the two equal — the app's
 * actual configuration — they always fall together and neither branch is
 * distinguishable from the other.
 */
const LONG_BLOCK_MS = TTL_MS * 5;

/**
 * Two things are under test and they pull in opposite directions:
 *
 * 1. Limits still behave exactly as the `@nestjs/throttler` default store made
 *    them behave. Every guard in the app rides this contract. Concretely that
 *    means a SLIDING window — upstream arms a decrement timer per hit, so each
 *    hit retires exactly one TTL after itself and there is no boundary at which
 *    the bucket refills. The fixed-window shortcut is the easy way to get (2)
 *    and it would quietly double every bucket's burst tolerance, so it gets its
 *    own tests below rather than being left to the general limit cases.
 * 2. Records are actually reclaimed. The default store never deletes, which on
 *    an anonymous-reachable per-IP bucket makes every distinct source address a
 *    permanent entry — the reason this class exists.
 *
 * Clock control is `jest.setSystemTime`, because the store reads `Date.now()`
 * on every call and windows are minutes long. Note that fake timers shift
 * pending timers by the same delta, so a `setSystemTime` jump followed by
 * `advanceTimersByTime(THROTTLE_STORE_PRUNE_INTERVAL_MS)` is what actually
 * fires the prune interval.
 */
describe('BoundedThrottlerStorage', () => {
  let storage: BoundedThrottlerStorage;

  function hit(key: string, { limit = LIMIT, blockMs = TTL_MS } = {}): Promise<ThrottleDecision> {
    return storage.increment(key, TTL_MS, limit, blockMs, THROTTLER);
  }

  /** Replaces the default-ceiling store with one small enough to saturate. */
  function withCeiling(maxKeys: number): void {
    storage.onModuleDestroy();
    storage = new BoundedThrottlerStorage(maxKeys);
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-29T12:00:00.000Z'));
    storage = new BoundedThrottlerStorage();
  });

  afterEach(() => {
    storage.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('limit behaviour (parity with the default store)', () => {
    it('counts hits per key and blocks the one that passes the limit', async () => {
      for (let attempt = 1; attempt <= LIMIT; attempt += 1) {
        const record = await hit('a');
        expect(record.isBlocked).toBe(false);
        expect(record.totalHits).toBe(attempt);
      }

      const blocked = await hit('a');
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.totalHits).toBe(LIMIT + 1);
    });

    it('keeps separate keys on separate counters', async () => {
      for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
        await hit('a');
      }

      await expect(hit('b')).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
    });

    it('keeps separate throttler names on separate counters within one key', async () => {
      for (let attempt = 0; attempt < LIMIT; attempt += 1) {
        await storage.increment('a', TTL_MS, LIMIT, TTL_MS, 'first');
      }

      const second = await storage.increment('a', TTL_MS, LIMIT, TTL_MS, 'second');
      expect(second.totalHits).toBe(1);
      expect(second.isBlocked).toBe(false);
    });

    it('reports both expiry figures in SECONDS, which is what Retry-After needs', async () => {
      const fresh = await hit('a');
      expect(fresh.timeToExpire).toBe(TTL_MS / 1000);

      for (let attempt = 0; attempt < LIMIT; attempt += 1) {
        await hit('a');
      }
      const blocked = await hit('a');
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.timeToBlockExpire).toBe(TTL_MS / 1000);
    });

    it('starts a fresh window once the old one lapses', async () => {
      await hit('a');
      await hit('a');

      jest.setSystemTime(Date.now() + TTL_MS + 1);

      await expect(hit('a')).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
      expect(storage.storage.size).toBe(1);
    });

    it('retires hits one at a time, each on its own clock', async () => {
      await hit('a');

      jest.setSystemTime(Date.now() + TTL_MS / 2);
      await expect(hit('a')).resolves.toMatchObject({ totalHits: 2 });

      // One TTL after the FIRST hit and half a TTL after the second: the first
      // has retired, the second has not. A store that expired counts on a
      // shared window stamp would report 1 here.
      jest.setSystemTime(Date.now() + TTL_MS / 2 + 1);
      await expect(hit('a')).resolves.toMatchObject({ totalHits: 2 });
    });

    it('does not hand back a fresh allowance at the window boundary', async () => {
      // The opening hit fixes the nominal window at [t0, t0 + TTL_MS).
      await hit('a');

      // Spend the rest of the allowance in its final millisecond.
      jest.setSystemTime(Date.now() + TTL_MS - 1);
      for (let attempt = 0; attempt < LIMIT - 1; attempt += 1) {
        await expect(hit('a')).resolves.toMatchObject({ isBlocked: false });
      }

      // Step over the boundary. A FIXED window clears every count here and lets
      // the caller spend LIMIT again — 2x the bucket in two milliseconds. Under
      // per-hit decay only the opening hit has retired, so there is room for
      // exactly one more and the next one blocks.
      jest.setSystemTime(Date.now() + 2);

      await expect(hit('a')).resolves.toMatchObject({ isBlocked: false });
      await expect(hit('a')).resolves.toMatchObject({ isBlocked: true });
    });

    it('holds a block for its full duration even after the window lapses', async () => {
      for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
        await hit('a', { blockMs: LONG_BLOCK_MS });
      }

      // Past the window, nowhere near the end of the block.
      jest.setSystemTime(Date.now() + TTL_MS + 1);

      await expect(hit('a', { blockMs: LONG_BLOCK_MS })).resolves.toMatchObject({
        isBlocked: true,
      });
    });

    it('releases a block once it expires', async () => {
      for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
        await hit('a', { blockMs: LONG_BLOCK_MS });
      }

      jest.setSystemTime(Date.now() + LONG_BLOCK_MS + 1);

      await expect(hit('a', { blockMs: LONG_BLOCK_MS })).resolves.toMatchObject({
        isBlocked: false,
        totalHits: 1,
      });
    });

    it('resets only the calling throttler when a block lapses, not every name on the key', async () => {
      // Unreachable through today's guards — each one prefixes its own storage
      // key, so no two names share a record. It is pinned because the data
      // model invites it: the record holds one entry per name, and a reset that
      // reached across them would let a short-TTL bucket repeatedly wipe a
      // long-TTL bucket's count. Upstream scopes the reset to the calling name.
      const longTtlMs = TTL_MS * 10;
      const shortBlockMs = 1_000;

      await storage.increment('a', longTtlMs, LIMIT, longTtlMs, 'slow');
      await storage.increment('a', longTtlMs, LIMIT, longTtlMs, 'slow');

      // 'fast' overruns, blocking the key, then serves out its short block.
      for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
        await storage.increment('a', TTL_MS, LIMIT, shortBlockMs, 'fast');
      }
      jest.setSystemTime(Date.now() + shortBlockMs + 1);

      await expect(
        storage.increment('a', TTL_MS, LIMIT, shortBlockMs, 'fast'),
      ).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });

      // 'slow' overran nothing and its window is nowhere near lapsing, so its
      // two banked hits are still there — this is its third.
      const slow = await storage.increment('a', longTtlMs, LIMIT, longTtlMs, 'slow');
      expect(slow.totalHits).toBe(3);
    });
  });

  describe('reclaim (the defect this class fixes)', () => {
    it('prunes dead keys in the background, with no further traffic to trigger it', async () => {
      for (let index = 0; index < 50; index += 1) {
        await hit(`ip-${index}`);
      }
      expect(storage.storage.size).toBe(50);

      jest.setSystemTime(Date.now() + TTL_MS + 1);
      jest.advanceTimersByTime(THROTTLE_STORE_PRUNE_INTERVAL_MS);

      // Under the default store these 50 would still be resident — permanently.
      expect(storage.storage.size).toBe(0);
    });

    it('keeps a still-blocked key through a prune, then reclaims it', async () => {
      for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
        await hit('blocked', { blockMs: LONG_BLOCK_MS });
      }
      await hit('idle', { blockMs: LONG_BLOCK_MS });

      // Both windows have lapsed; only the block on 'blocked' is still live.
      jest.setSystemTime(Date.now() + TTL_MS + 1);
      jest.advanceTimersByTime(THROTTLE_STORE_PRUNE_INTERVAL_MS);
      expect([...storage.storage.keys()]).toEqual(['blocked']);

      jest.setSystemTime(Date.now() + LONG_BLOCK_MS);
      jest.advanceTimersByTime(THROTTLE_STORE_PRUNE_INTERVAL_MS);
      expect(storage.storage.size).toBe(0);
    });

    it('never grows past its ceiling, however many distinct keys arrive', async () => {
      const maxKeys = 8;
      withCeiling(maxKeys);

      // The IPv6-spray shape: every request carries a key never seen before.
      for (let index = 0; index < maxKeys * 20; index += 1) {
        await hit(`2001:db8::${index}`);
      }

      // Exactly full, not merely "not over": `toBeLessThanOrEqual` would also
      // pass for a store that threw everything away, which is not the bargain.
      expect(storage.storage.size).toBe(maxKeys);
    });

    it('reclaims a dead record before it will refuse a newcomer', async () => {
      withCeiling(3);

      await hit('blocked', { limit: 0, blockMs: LONG_BLOCK_MS });
      await hit('dead-1');
      await hit('dead-2');
      expect(storage.storage.size).toBe(3);

      // Both counters age out of their window; only the block is still live.
      jest.setSystemTime(Date.now() + TTL_MS + 1);

      await expect(hit('newcomer')).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
      expect(storage.storage.has('newcomer')).toBe(true);
      expect(storage.storage.has('dead-1')).toBe(false);
      // The blocked record stayed put — making room never releases a block.
      expect(storage.storage.has('blocked')).toBe(true);
    });

    it('refuses a newcomer rather than resetting a live under-limit counter', async () => {
      // THE ESCAPE HATCH THIS CLOSES, ONE STEP EARLIER THAN THE BLOCKED-RECORD
      // ONE BELOW. Filling the store is something an attacker can do unaided —
      // distinct IPv6 sources are free — and dropping the oldest record that
      // merely "is not blocked" hands back exactly what `login-email` exists to
      // deny: a counter part-way to its limit, reset by the same spray that
      // filled the store, over and over.
      withCeiling(2);

      await hit('login-email:victim');
      await hit('login-email:victim');
      await hit('other');
      expect(storage.storage.size).toBe(2);

      const refused = await hit('spray');
      expect(refused.isBlocked).toBe(true);
      expect(storage.storage.has('spray')).toBe(false);

      // The counter is where it was left: two hits in, so the next one is its
      // third and not a fresh first.
      await expect(hit('login-email:victim')).resolves.toMatchObject({
        totalHits: 3,
        isBlocked: false,
      });
    });
  });

  describe('saturation', () => {
    it('refuses a new key rather than evicting a blocked one', async () => {
      const maxKeys = 4;
      withCeiling(maxKeys);

      // Fill every slot with a live block. `limit: 0` blocks on the first hit.
      for (let index = 0; index < maxKeys; index += 1) {
        await hit(`blocked-${index}`, { limit: 0 });
      }
      expect(storage.storage.size).toBe(maxKeys);

      // A key arriving now cannot be admitted, and must NOT be admitted by
      // evicting one of the blocked records — that is the escape hatch the
      // ceiling exists to deny. It fails closed instead: a clean 429.
      const refused = await hit('newcomer');
      expect(refused.isBlocked).toBe(true);
      expect(refused.timeToBlockExpire).toBe(TTL_MS / 1000);
      expect(storage.storage.has('newcomer')).toBe(false);

      // Nobody escaped their block to make room.
      expect(storage.storage.size).toBe(maxKeys);
    });

    it('recovers on its own once the blocks lapse', async () => {
      const maxKeys = 4;
      withCeiling(maxKeys);

      for (let index = 0; index < maxKeys; index += 1) {
        await hit(`blocked-${index}`, { limit: 0 });
      }
      await expect(hit('newcomer')).resolves.toMatchObject({ isBlocked: true });

      jest.setSystemTime(Date.now() + TTL_MS + 1);

      await expect(hit('newcomer')).resolves.toMatchObject({ isBlocked: false, totalHits: 1 });
    });

    it('reports saturation once per sweep, not once per rejected request', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const maxKeys = 4;
      withCeiling(maxKeys);

      for (let index = 0; index < maxKeys; index += 1) {
        await hit(`blocked-${index}`, { limit: 0, blockMs: LONG_BLOCK_MS });
      }
      for (let attempt = 0; attempt < 25; attempt += 1) {
        await hit(`spray-${attempt}`, { blockMs: LONG_BLOCK_MS });
      }

      // 25 rejections, one line. An operator-facing condition that logged per
      // request would bury the incident under its own alarm.
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0]?.[0]).toMatchObject({
        event: 'system.throttle_store.saturated',
      });

      // Still saturated one sweep later: it says so again, exactly once.
      jest.advanceTimersByTime(THROTTLE_STORE_PRUNE_INTERVAL_MS);
      await hit('spray-later', { blockMs: LONG_BLOCK_MS });
      await hit('spray-later-2', { blockMs: LONG_BLOCK_MS });
      expect(logSpy).toHaveBeenCalledTimes(2);

      logSpy.mockRestore();
    });

    it('never logs the throttle key, which is caller-identifying', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      withCeiling(1);

      await hit('blocked-2001:db8::dead:beef', { limit: 0, blockMs: LONG_BLOCK_MS });
      await hit('2001:db8::ca11:ab1e', { blockMs: LONG_BLOCK_MS });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logSpy.mock.calls[0])).not.toContain('2001:db8');

      logSpy.mockRestore();
    });
  });

  it('stops its prune timer on module destroy', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    storage.onModuleDestroy();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
