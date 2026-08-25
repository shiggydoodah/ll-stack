/**
 * Pin the rate-limiting flag ON for suites that assert 429 (Too Many Requests)
 * responses.
 *
 * `RATE_LIMITING_ENABLED` already defaults to on, but a sibling suite may set
 * it to `'false'` on the shared `process.env`. Under Jest's machine-dependent
 * file order a leaked `'false'` would silently disable the throttler guard and
 * make a suite's 429 assertions vanish. Calling this in a suite's env setup
 * keeps those assertions deterministic regardless of order. (Per-test
 * `throttlerStorage.storage.clear()` still keeps setup traffic off the
 * throttle.)
 */
export function pinRateLimitingEnabled(): void {
  process.env['RATE_LIMITING_ENABLED'] = 'true';
}
