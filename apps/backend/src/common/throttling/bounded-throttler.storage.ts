import { Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

import { BACKEND_LOG_EVENTS } from '../logging/log-events';

/**
 * What `increment` hands back. `@nestjs/throttler` declares this shape as
 * `ThrottlerStorageRecord` but does not re-export it from its entrypoint, and
 * reaching into the package's `dist/` for it would pin us to its internal
 * layout — so derive it from the interface we implement instead.
 */
export type ThrottleDecision = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Hard ceiling on live throttle records. Measured at ~640 bytes a record in the
 * floor case this class exists for — 100 000 distinct IPv6 keys holding one hit
 * each — so ~60 MB at the ceiling. RE-MEASURE RATHER THAN SCALE THAT FIGURE if
 * you re-size this: it moves with key length, and a record carrying more hits
 * costs eight bytes each on top. Hits stop accumulating at the bucket's `limit`
 * anyway, because passing it blocks the caller and a blocked caller's hits are
 * not counted (60 is the widest limit configured today), so the per-record cost
 * is bounded either way.
 *
 * ~60 MB is far above any legitimate working set: the widest bucket is per-IP
 * over a 60s window, so reaching this needs 100 000 distinct source addresses
 * within about two minutes — one window for their hits to age out, plus up to
 * one prune cycle before the dead records are actually swept. See `increment`
 * for what happens at the ceiling.
 */
export const THROTTLE_STORE_MAX_KEYS = 100_000;

/**
 * Background reclaim cadence. Matches the longest window any bucket uses today
 * (60s), so a key that stops being hit is reclaimed roughly one window after it
 * goes quiet rather than lingering until the next request touches it.
 */
export const THROTTLE_STORE_PRUNE_INTERVAL_MS = 60_000;

/**
 * How many records `makeRoom` will inspect for a dead one to reclaim. `Map`
 * iterates in insertion order, so the first entries are the oldest and the
 * likeliest to be dead — a bounded scan keeps the saturated path cheap instead
 * of O(size).
 *
 * THE TRADE-OFF IS A FALSE SATURATION. If the first 512 records are all still
 * live — counting hits or serving a block — but a dead one sits behind them, the
 * store reports itself full and 429s a caller it could have admitted. That is
 * only reachable at the ceiling — i.e. already under a volumetric attack — and it
 * self-corrects on the next sweep, which is a better trade than an O(100k) scan
 * per sprayed request.
 */
const RECLAIM_SCAN_LIMIT = 512;

/**
 * Floor on how often a request may force a full sweep. A sweep is O(size), and
 * at the ceiling `makeRoom` runs on every request carrying a new key — without
 * this floor, the spray that fills the store also buys the attacker a 100k-entry
 * scan per request. The bounded scan below covers the sub-second window this
 * floor holds a sweep off for; the background interval covers the rest.
 */
const FORCED_PRUNE_MIN_INTERVAL_MS = 1_000;

/**
 * One named throttler's live hits against one storage key. `timestamps` is the
 * when of every hit still inside the window, ascending because hits are pushed
 * in time order; the count is its length. Holding the individual times, rather
 * than a single counter plus a window stamp, is what lets each hit retire on
 * its own clock — see the class header for why that matters.
 *
 * `ttlMs` is the window the stamps were last measured over, carried on the
 * entry so a background sweep can retire them without a caller present to say
 * what the window is.
 */
interface ThrottlerHits {
  timestamps: number[];
  ttlMs: number;
}

/**
 * One tracked bucket. `hitsByThrottler` is keyed by throttler *name* because a
 * single storage key can be shared by several named throttlers (that is the
 * upstream contract — `increment` is passed the name on every call), and each
 * name owns its own window and hit list. Only `isBlocked` / `blockExpiresAtMs`
 * are record-wide, which is also upstream's shape: one block covers the key.
 * A pre-auth guard may put the route in its storage KEY for exactly that
 * reason.
 */
interface ThrottleRecord {
  hitsByThrottler: Map<string, ThrottlerHits>;
  windowExpiresAtMs: number;
  blockExpiresAtMs: number;
  isBlocked: boolean;
}

function secondsUntil(deadlineMs: number, nowMs: number): number {
  return Math.ceil((deadlineMs - nowMs) / 1000);
}

/**
 * In-process throttle store that reclaims its own memory.
 *
 * WHY THIS EXISTS. `@nestjs/throttler`'s default `ThrottlerStorageService`
 * never deletes: its `_storage` Map has no `delete` call anywhere in the class,
 * `setExpirationTime` only decrements a hit counter on a per-hit timer, and
 * `onApplicationShutdown` only clears those timers. Every distinct storage key
 * — and therefore every distinct source IP that ever reaches an IP-keyed
 * bucket — is a permanent entry for the lifetime of the process. That is not
 * tolerable on any anonymous-reachable surface with a per-IP bucket. An IPv6
 * source can spray effectively unlimited distinct addresses, and each one would
 * mint a Map entry that never goes away.
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT. Limits are untouched. Upstream
 * retires each hit exactly one TTL after that hit — a sliding window — and so
 * does this store; what changed is the bookkeeping. Upstream arms a
 * `setTimeout` per hit to do the retiring, so the count lives in timers this
 * class cannot see; here the hit's timestamp IS the record, and hits are
 * retired on the next touch or sweep. Same window, no timers, and — the point —
 * a record that describes its own liveness, so it can be reclaimed without
 * knowing which timers are outstanding. (Deleting a record out from under
 * upstream's pending timers is exactly why the default store cannot simply be
 * swept: its callback destructures `storage.get(key)` and would throw inside a
 * timer.) Reclaim happens three ways, and all three take DEAD records only:
 * lazily when a dead key is touched, on a background prune, and by a bounded
 * scan at the ceiling.
 *
 * WHY NOT A FIXED WINDOW, WHICH WOULD BE CHEAPER. Stamping one expiry on the
 * record and clearing its counts when that lapses is the obvious way to make a
 * record self-describing, and it costs one integer per throttler instead of one
 * timestamp per live hit. It also hands every bucket a fresh allowance at the
 * boundary: a caller aligned to it gets `2 * limit` through in quick succession.
 * The long-run rate is unchanged and `blockDuration` still caps sustained abuse,
 * but on `login-email` — the bucket that exists specifically to cap distributed
 * credential guessing across source IPs — doubled burst tolerance is a real
 * weakening, and not one worth buying with a memory fix. The per-hit cost is
 * bounded anyway: hits stop accumulating once the caller is blocked, so an
 * entry holds at most `limit` of them, and the IPv6-spray keys this class
 * exists to bound hold exactly one each. `bounded-throttler-storage.spec.ts`
 * pins the boundary in both directions.
 *
 * STILL SINGLE-INSTANCE. Bounding the map does not make it shared. Counts are
 * per-process, which is safe only because `env.schema.ts` fails the boot when
 * `BACKEND_INSTANCE_COUNT > 1` in staging/production. A shared store (Redis)
 * remains the prerequisite for scaling out, and would replace this class.
 *
 * Deliberately NOT `@Injectable()`: `AppModule` constructs it by hand inside
 * `ThrottlerModule.forRootAsync`'s factory, which registers the instance under
 * the `ThrottlerStorage` token. Nest owns it from there — including the lifecycle
 * hook below — but never resolves its constructor. The factory, rather than a
 * plain `forRoot({ storage })`, is what makes that ownership per-container: see
 * the note at the call site for what sharing one instance would cost.
 */
export class BoundedThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly records = new Map<string, ThrottleRecord>();
  private readonly pruneTimer: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(BoundedThrottlerStorage.name);

  /** Suppresses repeat saturation reports; cleared once per background sweep. */
  private saturationReported = false;

  /** When a sweep last ran, so a request cannot force one on every call. */
  private lastPruneAtMs = 0;

  /** `maxKeys` is a parameter only so tests can drive the ceiling cheaply. */
  constructor(private readonly maxKeys: number = THROTTLE_STORE_MAX_KEYS) {
    this.pruneTimer = setInterval(() => {
      this.prune(Date.now());
      // Rearm the report here rather than in `prune`, so sustained saturation
      // costs one log line per interval and not one per rejected request.
      this.saturationReported = false;
    }, THROTTLE_STORE_PRUNE_INTERVAL_MS);
    // Never hold the event loop open — the store owns no work worth delaying a
    // shutdown or a test run for.
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruneTimer);
    this.records.clear();
  }

  /**
   * The live record map. Named `storage` to match the property the default
   * `ThrottlerStorageService` exposes, because the integration suites reset
   * throttle state between tests through it.
   */
  get storage(): Map<string, ThrottleRecord> {
    return this.records;
  }

  /**
   * Mirrors `ThrottlerStorageService.increment` step for step — count, block on
   * overflow, unblock once the block lapses, and retire each hit one TTL after
   * it was made — with two deliberate differences, both about memory rather
   * than limits:
   *
   * 1. Hits are retired by timestamp when the record is next touched or swept,
   *    instead of by one decrement timer per hit.
   * 2. A key that is dead on arrival is dropped and rebuilt, and a new key can
   *    only be admitted if the store has room for it.
   *
   * AT THE CEILING WE FAIL CLOSED. When the store is full of records that
   * cannot be reclaimed, a new key gets a synthetic blocked record — the caller
   * sees a normal 429 with `Retry-After`. The alternative, dropping a record
   * that is still LIVE to make space, would hand an attacker the escape hatch
   * this store exists to close: spray enough fresh keys and either your own
   * block gets evicted, or — a step earlier, and just as useful to them — some
   * bucket's under-limit counter gets reset. Reaching that state needs ~100k
   * concurrently live buckets, which is already a volumetric attack, and it
   * self-heals within one window.
   */
  async increment(
    key: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number,
    throttlerName: string,
  ): Promise<ThrottleDecision> {
    const now = Date.now();
    let record = this.records.get(key);

    // Retires this record's aged-out hits on the way past, which is what makes
    // the question answerable at all — see `isReclaimable`.
    if (record !== undefined && this.isReclaimable(record, now)) {
      this.records.delete(key);
      record = undefined;
    }

    if (record === undefined) {
      if (!this.makeRoom(now)) {
        this.reportSaturation();
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(ttlMs / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDurationMs / 1000),
        };
      }
      record = {
        hitsByThrottler: new Map<string, ThrottlerHits>(),
        windowExpiresAtMs: now + ttlMs,
        blockExpiresAtMs: 0,
        isBlocked: false,
      };
      this.records.set(key, record);
    }

    // NOMINAL WINDOW, FOR REPORTING ONLY, rolled exactly where upstream rolls
    // it. `timeToExpire` becomes the `X-RateLimit-Reset` header, which is a
    // window boundary by definition. Nothing is counted or forgotten here: hits
    // keep their own clocks, so crossing this line buys a caller nothing.
    if (record.windowExpiresAtMs <= now) {
      record.windowExpiresAtMs = now + ttlMs;
    }
    const timeToExpire = secondsUntil(record.windowExpiresAtMs, now);

    if (!record.isBlocked) {
      const hits = this.countHit(record, throttlerName, ttlMs, now);
      if (hits.timestamps.length > limit) {
        record.isBlocked = true;
        record.blockExpiresAtMs = now + blockDurationMs;
      }
    }

    // Read before the unblock below, matching upstream: the guard only consults
    // this value when `isBlocked` is true, where it is the Retry-After seconds.
    const timeToBlockExpire = secondsUntil(record.blockExpiresAtMs, now);

    if (record.isBlocked && timeToBlockExpire <= 0) {
      record.isBlocked = false;
      record.blockExpiresAtMs = 0;
      // Upstream's `resetBlockdRequest` zeroes the CALLING throttler's count and
      // then fires one hit for it; any other name sharing this key keeps its
      // own. Scoping the reset the same way is what stops one name — say a
      // short-TTL bucket — from wiping a longer-TTL one's count out from under
      // it.
      record.hitsByThrottler.set(throttlerName, { timestamps: [now], ttlMs });
    }

    return {
      totalHits: record.hitsByThrottler.get(throttlerName)?.timestamps.length ?? 0,
      timeToExpire,
      isBlocked: record.isBlocked,
      timeToBlockExpire,
    };
  }

  /**
   * Records one hit for `throttlerName`, retiring anything that has aged out of
   * the window first. Returns the entry so the caller can read the live count.
   */
  private countHit(
    record: ThrottleRecord,
    throttlerName: string,
    ttlMs: number,
    nowMs: number,
  ): ThrottlerHits {
    const existing = record.hitsByThrottler.get(throttlerName);
    const hits: ThrottlerHits = existing ?? { timestamps: [], ttlMs };
    // A bucket whose TTL changed between calls measures from here on with the
    // new one. The stamps already held are still real hits, so they stay.
    hits.ttlMs = ttlMs;
    this.retireExpiredHits(hits, nowMs);
    hits.timestamps.push(nowMs);
    if (existing === undefined) {
      record.hitsByThrottler.set(throttlerName, hits);
    }
    return hits;
  }

  /**
   * Drops the hits that have aged out of `hits`'s window. Timestamps are pushed
   * in time order, so everything expired is a prefix — stop at the first
   * survivor rather than filtering the whole array.
   *
   * `<=` not `<`: upstream's decrement timer is armed for exactly `ttl` after
   * the hit, and a timer due at `now` has already fired.
   */
  private retireExpiredHits(hits: ThrottlerHits, nowMs: number): void {
    const cutoff = nowMs - hits.ttlMs;
    let expired = 0;
    for (const timestamp of hits.timestamps) {
      if (timestamp > cutoff) {
        break;
      }
      expired += 1;
    }
    if (expired > 0) {
      hits.timestamps.splice(0, expired);
    }
  }

  /**
   * Retires aged-out hits across every throttler on the record, reporting
   * whether any are left. A name with nothing left is dropped, so a key that
   * goes partly quiet shrinks before it is reclaimed outright.
   */
  private retireRecordHits(record: ThrottleRecord, nowMs: number): boolean {
    let hasLiveHits = false;
    for (const [throttlerName, hits] of record.hitsByThrottler) {
      this.retireExpiredHits(hits, nowMs);
      if (hits.timestamps.length === 0) {
        record.hitsByThrottler.delete(throttlerName);
      } else {
        hasLiveHits = true;
      }
    }
    return hasLiveHits;
  }

  /**
   * Half of "still live": a record whose block is still running. The other half
   * is hits still inside their window, which `isReclaimable` checks alongside
   * this — a record failing either test is never dropped to make room.
   */
  private isServingLiveBlock(record: ThrottleRecord, nowMs: number): boolean {
    return record.isBlocked && record.blockExpiresAtMs > nowMs;
  }

  /**
   * Dead: nothing left to count for any throttler, and no block outstanding.
   *
   * Retires aged-out hits as it looks, because that is the only thing that can
   * make a record dead — with no per-hit timers there is nobody else to do it,
   * and the sweep wants it done regardless. Note this is NOT the nominal
   * `windowExpiresAtMs`, which is a reporting stamp: a record can be well past
   * it and still be counting hits made moments ago.
   */
  private isReclaimable(record: ThrottleRecord, nowMs: number): boolean {
    const hasLiveHits = this.retireRecordHits(record, nowMs);
    return !hasLiveHits && !this.isServingLiveBlock(record, nowMs);
  }

  /** True when there is room for one more key. */
  private makeRoom(nowMs: number): boolean {
    if (this.records.size < this.maxKeys) {
      return true;
    }
    if (nowMs - this.lastPruneAtMs >= FORCED_PRUNE_MIN_INTERVAL_MS) {
      this.prune(nowMs);
      // A SWEEP MAKES THE SCAN BELOW POINTLESS, SO DO NOT RUN IT. `prune` visits
      // every record and reclaims every one `isReclaimable` accepts — the same
      // predicate, at the same `nowMs`, that the scan applies. So a store still
      // full when the sweep returns holds nothing reclaimable, and the scan
      // could only walk up to RECLAIM_SCAN_LIMIT records to reach the `false`
      // already known here. That is not free: the predicate retires hits across
      // every throttler on a record, so it is a walk, not a flag read — and this
      // path runs per request under exactly the volumetric attack the class
      // exists to survive. Fail closed now. The scan still earns its keep in the
      // sub-second window where FORCED_PRUNE_MIN_INTERVAL_MS held a sweep off.
      return this.records.size < this.maxKeys;
    }
    // Last resort: a bounded scan for a record that is already DEAD — nothing
    // left to count for any throttler and no block outstanding. Nothing live is
    // ever dropped to make room.
    //
    // AN UNDER-LIMIT COUNTER IS LIVE, AND DROPPING ONE USED TO BE THIS PATH'S
    // ESCAPE HATCH. Deleting a `login-email:<hash>` record sitting at 4 of its 5
    // attempts hands that bucket a free reset — so at the ceiling, which an
    // attacker can reach on their own by spraying distinct IPv6 sources, every
    // counter that had not yet tipped into a block was being reset for them.
    // That is the same hole as evicting a blocked record, one step earlier: the
    // bucket exists to cap distributed credential guessing, and it was the
    // guessing traffic that bought the reset. Live records now stay, and a
    // newcomer that cannot be admitted gets the fail-closed 429 above.
    let scanned = 0;
    for (const [candidateKey, candidate] of this.records) {
      if (this.isReclaimable(candidate, nowMs)) {
        this.records.delete(candidateKey);
        return true;
      }
      scanned += 1;
      if (scanned >= RECLAIM_SCAN_LIMIT) {
        break;
      }
    }
    return false;
  }

  private prune(nowMs: number): void {
    this.lastPruneAtMs = nowMs;
    for (const [candidateKey, candidate] of this.records) {
      if (this.isReclaimable(candidate, nowMs)) {
        this.records.delete(candidateKey);
      }
    }
  }

  private reportSaturation(): void {
    if (this.saturationReported) {
      return;
    }
    this.saturationReported = true;
    // Security denial, so: event + reason only. The key is caller-identifying
    // (it embeds an IP or a hashed identifier) and is never logged.
    this.logger.error({
      event: BACKEND_LOG_EVENTS['system.throttle_store.saturated'],
      message:
        'Throttle store is at its key ceiling with no reclaimable records; new buckets are being rejected with 429.',
      maxKeys: this.maxKeys,
    });
  }
}
