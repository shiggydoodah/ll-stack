// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  DEFAULT_ROTATION_RETRY_SECONDS,
  getIdleTimeoutSeconds,
  getRotationRetrySeconds,
} from './constants';

/**
 * Both readers pull `process.env` on every call rather than at module load, so
 * `cacheComponents` cannot bake the build environment's value into the bundle.
 * `config/env.schema.ts` validates the same two variables at boot; these cover
 * what happens when a value reaches a running app anyway — a parse order that
 * put a read before the boot check, or a process that never ran one.
 *
 * `unstubEnvs` is on (vitest.config.ts), so each stub is undone after its test.
 */
describe('getIdleTimeoutSeconds', () => {
  it('defaults to eight hours, which is a working day and well under the backend TTL', () => {
    expect(getIdleTimeoutSeconds()).toBe(DEFAULT_IDLE_TIMEOUT_SECONDS);
    expect(DEFAULT_IDLE_TIMEOUT_SECONDS).toBe(28_800);
  });

  it('takes AUTH_IDLE_TIMEOUT_SECONDS when an operator has set one', () => {
    vi.stubEnv('AUTH_IDLE_TIMEOUT_SECONDS', '900');
    expect(getIdleTimeoutSeconds()).toBe(900);
  });

  it.each(['', '   ', 'never', '0', '-1', '30.5'])(
    'falls back to the default on %j rather than expiring bindings on a nonsense figure',
    (value) => {
      vi.stubEnv('AUTH_IDLE_TIMEOUT_SECONDS', value);
      expect(getIdleTimeoutSeconds()).toBe(DEFAULT_IDLE_TIMEOUT_SECONDS);
    },
  );
});

describe('getRotationRetrySeconds', () => {
  it('defaults to the backend’s rotation grace window, so a retry clears it', () => {
    // Matches `AUTH_SESSION_ROTATION_GRACE_SECONDS`'s default. A retry inside
    // that window is answered `superseded`, which writes nothing; one at or
    // after the boundary lets the backend see that no successor was ever used
    // and restore the token, which is what makes the retry the recovery.
    expect(getRotationRetrySeconds()).toBe(DEFAULT_ROTATION_RETRY_SECONDS);
    expect(DEFAULT_ROTATION_RETRY_SECONDS).toBe(60);
  });

  it('takes AUTH_ROTATION_RETRY_SECONDS when an operator has tuned the grace window', () => {
    vi.stubEnv('AUTH_ROTATION_RETRY_SECONDS', '150');
    expect(getRotationRetrySeconds()).toBe(150);
  });

  it.each(['', '  ', 'soon', '0', '-30', '12.5'])(
    'falls back to the default on %j rather than backing off by a nonsense figure',
    (value) => {
      vi.stubEnv('AUTH_ROTATION_RETRY_SECONDS', value);
      expect(getRotationRetrySeconds()).toBe(DEFAULT_ROTATION_RETRY_SECONDS);
    },
  );
});
