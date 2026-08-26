import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';

import { BoundedThrottlerStorage } from '../src/common/throttling/bounded-throttler.storage';
import { assertTestDatabaseUrl, getTestDatabaseUrl } from './helpers/test-database-url';

/**
 * THROTTLE STORE OWNERSHIP.
 *
 * `AppModule` binds `BoundedThrottlerStorage` through
 * `ThrottlerModule.forRootAsync`'s factory rather than `forRoot({ storage })`,
 * and the difference is only visible with two containers alive at once.
 *
 * Under `forRoot` the instance is an argument evaluated in the `@Module`
 * decorator's metadata — once per IMPORT of `app.module.ts`, not once per Nest
 * container. Every app built from `AppModule` in one module registry then shares
 * a store, so the first `app.close()` runs `onModuleDestroy` on the instance the
 * others are still using: `records.clear()` drops their live throttle state, and
 * `clearInterval(this.pruneTimer)` disarms the 60s background sweep with nothing
 * re-arming it. The store stays bounded regardless — lazy reclaim on touch and
 * the forced prune inside `makeRoom` both survive — but one of the three reclaim
 * paths the class header promises would be gone for the life of the process.
 *
 * Production runs one app per process, so none of this is reachable there, and
 * no spec builds two apps from `AppModule` today. That is exactly why it needs a
 * test: nothing else in the suite would go red if the factory were flattened
 * back to `forRoot({ storage })`.
 *
 * This is a UNIT spec, not an integration one: it compiles the module graph but
 * never calls `app.init()`, so no database connection, flag materialization or
 * HTTP listener is involved.
 */

function applyTestEnv(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '3121';
  process.env['DATABASE_URL'] = assertTestDatabaseUrl(getTestDatabaseUrl());
  process.env['BACKEND_API_SECRET'] = 'test-api-secret';
  process.env['ADMIN_API_KEY'] = 'test-admin-api-key';
  process.env['FRONTEND_PUBLIC_URL'] = 'http://localhost:4100';
  process.env['APPLICATION_NAME'] = 'backend';
  process.env['LOG_SINK'] = 'stdout';
  process.env['LOG_LEVEL'] = 'fatal';
}

/**
 * Node marks a cleared interval `_destroyed`. Private and undocumented, so it is
 * asserted on rather than relied on in `src` — but the alternative is waiting out
 * a 60 000 ms sweep to observe the same fact.
 */
function isTimerDestroyed(store: BoundedThrottlerStorage): boolean {
  const { pruneTimer } = store as unknown as { pruneTimer: { _destroyed?: boolean } };
  return pruneTimer._destroyed === true;
}

describe('throttle store ownership', () => {
  const originalProcessEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalProcessEnv };
  });

  it('gives each container its own store, and one container closing leaves the other intact', async () => {
    applyTestEnv();

    const { AppModule } = await import('../src/app.module.js');
    // `compile()` builds the module graph and instantiates providers; it does
    // NOT run lifecycle hooks, so nothing here connects to Postgres.
    const [first, second] = await Promise.all([
      Test.createTestingModule({ imports: [AppModule] }).compile(),
      Test.createTestingModule({ imports: [AppModule] }).compile(),
    ]);

    const firstStore = first.get<BoundedThrottlerStorage>(getStorageToken());
    const secondStore = second.get<BoundedThrottlerStorage>(getStorageToken());

    // Guards the premise: a cast would let the default `ThrottlerStorageService`
    // through here, and it satisfies every other assertion below.
    expect(firstStore).toBeInstanceOf(BoundedThrottlerStorage);
    expect(secondStore).toBeInstanceOf(BoundedThrottlerStorage);
    // Compared as a boolean rather than with `.not.toBe`, which serializes the
    // whole store — including the prune timer's circular linked list — into the
    // failure message. This is the assertion a `forRoot` regression trips, so it
    // is the one whose output has to be readable.
    expect(firstStore === secondStore).toBe(false);

    await secondStore.increment('203.0.113.7', 60_000, 60, 60_000, 'default');
    expect(secondStore.storage.size).toBe(1);

    // The whole point: `onModuleDestroy` on one container's store must not reach
    // the other's records or its prune timer.
    await first.close();

    expect(isTimerDestroyed(firstStore)).toBe(true);
    expect(isTimerDestroyed(secondStore)).toBe(false);
    expect(secondStore.storage.size).toBe(1);

    await second.close();
    expect(isTimerDestroyed(secondStore)).toBe(true);
  });
});
