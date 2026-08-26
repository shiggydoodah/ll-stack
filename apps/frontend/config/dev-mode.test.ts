import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { isDevModeEnabled } from './dev-mode';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isDevModeEnabled', () => {
  it('returns true when NODE_ENV is development and DEV_MODE is true', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_MODE', 'true');

    expect(isDevModeEnabled()).toBe(true);
  });

  it('returns false when DEV_MODE is false', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_MODE', 'false');

    expect(isDevModeEnabled()).toBe(false);
  });

  it('returns false outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_MODE', 'true');

    expect(isDevModeEnabled()).toBe(false);
  });

  it('returns true without parsing the full server env', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('BACKEND_INTERNAL_URL', undefined);
    vi.stubEnv('BACKEND_API_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
    vi.stubEnv('BINDING_SECRET', undefined);

    expect(isDevModeEnabled()).toBe(true);
  });
});
