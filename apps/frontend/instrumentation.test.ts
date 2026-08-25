import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted above the imports, so the spy has to be hoisted with it.
const { getServerEnv } = vi.hoisted(() => ({ getServerEnv: vi.fn() }));

vi.mock('./config/env', () => ({ getServerEnv }));

import { register } from './instrumentation';

beforeEach(() => {
  getServerEnv.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// The env schema's staging/production refusal of the committed dev secrets is
// only worth anything if something evaluates it at boot: every other frontend
// caller of `getServerEnv()` sits inside a `try` that swallows the ZodError
// (lib/logging/server-logger.ts, lib/logging/log-emitter.ts). This hook is the
// one path that lets it fail the boot, so pin that it stays wired.
describe('register', () => {
  it('parses the server env on the node runtime', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    register();

    expect(getServerEnv).toHaveBeenCalledOnce();
  });

  it('skips the edge runtime, which cannot run the node-only sink code', () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    register();

    expect(getServerEnv).not.toHaveBeenCalled();
  });
});
