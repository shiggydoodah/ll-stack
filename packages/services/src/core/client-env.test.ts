import { afterEach, describe, expect, it, vi } from 'vitest';

// The module under test imports `server-only` to make its server boundary
// bundler-enforced. That package resolves to an empty module under the
// `react-server` export condition (what Next applies in the server layer) and to a
// module that throws on import everywhere else — and plain vitest, with no Next
// bundler, gets the throwing one. Stub it so the boundary marker does not decide
// whether this suite can load; the behaviour under test is env resolution.
vi.mock('server-only', () => ({}));

const { getBackendApiSecret, getBackendInternalUrl } = await import('./client-env');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('client-env', () => {
  it('returns the configured values', () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://localhost:3100');
    vi.stubEnv('BACKEND_API_SECRET', 'dev-backend-api-secret');

    expect(getBackendInternalUrl()).toBe('http://localhost:3100');
    expect(getBackendApiSecret()).toBe('dev-backend-api-secret');
  });

  // The regression this guards: an unset URL used to yield an `undefined` baseUrl, a
  // fetch that never settled, and a `USE_CACHE_TIMEOUT` build failure naming the cache
  // scope rather than the variable. The error must name the variable.
  it.each([
    ['BACKEND_INTERNAL_URL', getBackendInternalUrl],
    ['BACKEND_API_SECRET', getBackendApiSecret],
  ])('throws naming %s when it is unset', (name, read) => {
    vi.stubEnv(name, undefined);

    expect(read).toThrowError(new RegExp(`${name} is not set`));
  });

  it.each([
    ['BACKEND_INTERNAL_URL', getBackendInternalUrl],
    ['BACKEND_API_SECRET', getBackendApiSecret],
  ])('treats an empty %s as unset', (name, read) => {
    vi.stubEnv(name, '');

    expect(read).toThrowError(new RegExp(`${name} is not set`));
  });
});
