import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` is hoisted above the imports, so the spies have to be hoisted with it.
const { getServerEnv, warn, info } = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('./config/env', () => ({ getServerEnv }));
// Dynamically imported by `register`, because the logger is `'server-only'` and
// this module also loads on the edge runtime.
vi.mock('./lib/logging/server-logger', () => ({ serverLogger: { warn, info } }));

import { TRUSTED_PROXY_HOPS_MAX } from './config/env.schema';
import { FRONTEND_LOG_EVENTS } from './lib/logging/log-events';
import { register } from './instrumentation';

beforeEach(() => {
  // Reset, not clear: the boot-failure case below installs a throwing
  // implementation, and `mockClear` would leave it in place for every test after
  // it. A bare `vi.fn()` returns undefined either way, which is what the rest
  // of these want.
  getServerEnv.mockReset();
  warn.mockReset();
  info.mockReset();
  // `register` reads the parsed env's kill-switch flag; ingest ON is this
  // suite's quiet baseline so the TRUST_PROXY cases stay about TRUST_PROXY.
  getServerEnv.mockReturnValue({ CLIENT_LOG_INGEST_ENABLED: true });
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
  it('parses the server env on the node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');

    await register();

    expect(getServerEnv).toHaveBeenCalledOnce();
  });

  it('skips the edge runtime, which cannot run the node-only sink code', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    await register();

    expect(getServerEnv).not.toHaveBeenCalled();
  });

  it('fails the boot when the schema refuses the env', async () => {
    // The point of the hook, and the one assertion that was missing when this
    // became `async`: a synchronous throw and a rejected promise are not the
    // same thing to a caller. Next awaits `register()` and rethrows
    // (`next/dist/server/lib/router-utils/instrumentation-globals.external.js`),
    // so the refusal still fails the boot — but nothing pinned that, and a
    // stray `void` or `.catch()` here would serve on credentials the schema
    // refused, silently.
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    getServerEnv.mockImplementation(() => {
      throw new Error('BINDING_SECRET must not be the committed dev value');
    });

    await expect(register()).rejects.toThrow('BINDING_SECRET');
  });

  // CLIENT_LOG_INGEST_ENABLED defaults to off and the /api/client-logs route
  // answers 404 while it is — deliberately, but silently from the browser's
  // point of view (the client logger fires and forgets). The boot line naming
  // the variable is the only place an operator can find out why their browser
  // logs are not arriving, so pin that it stays wired — and pin its LEVEL,
  // which is load-bearing in both directions. Off with NEXT_PUBLIC_LOG_REMOTE
  // off too is the shipped default working as documented and must not spend the
  // warn tier on every boot of every app that never opted in; off while the
  // browser half is on is a bundle posting into a 404, and must stay above an
  // ordinary `LOG_LEVEL=warn` threshold.
  //
  // WHAT THESE CASES CANNOT REACH: vitest runs the source, so
  // `NEXT_PUBLIC_LOG_REMOTE` is always a live `process.env` read here. A real
  // build inlines it — into the server compilation as well as the client one —
  // and constant-folds the branch below, which is the configuration the deploy
  // checklist prescribes and the one where the field reports what the bundle
  // actually does. Nothing in a unit test can model that; verifying it means
  // building and searching the output: `process.env.NEXT_PUBLIC_LOG_REMOTE`
  // survives in the built `.next/server` JS only where it was NOT inlined (search
  // the `.js` files alone — the `.js.map` files keep the original source either
  // way). What these cases pin is the level split and the field, which are the
  // same on both paths.
  describe('client-log ingest kill switch', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    });

    it('names the variable at info while ingest is disabled and nothing is posting', async () => {
      getServerEnv.mockReturnValue({ CLIENT_LOG_INGEST_ENABLED: false });

      await register();

      expect(info).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.ingest_disabled'], {
        variable: 'CLIENT_LOG_INGEST_ENABLED',
        route: '/api/client-logs',
        browserRemoteEnabled: false,
      });
      // Not `warn`: this is the default configuration, both halves agree, and
      // nothing is wrong. A warn here fires on every boot of every app that
      // never enabled ingest, which trains operators past the one boot-time
      // channel that also carries server.trust_proxy.degraded.
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns instead when the browser half is posting into the 404', async () => {
      // The halves disagree: NEXT_PUBLIC_LOG_REMOTE=true means the shipped
      // bundle batches records to a route that does not exist. Somebody asked
      // for browser telemetry and is not getting it — the one shape of this
      // state that is actually broken, and the only one worth a warn.
      getServerEnv.mockReturnValue({ CLIENT_LOG_INGEST_ENABLED: false });
      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');

      await register();

      expect(warn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.client_logs.ingest_disabled'], {
        variable: 'CLIENT_LOG_INGEST_ENABLED',
        route: '/api/client-logs',
        browserRemoteEnabled: true,
      });
      expect(info).not.toHaveBeenCalled();
    });

    it('stays quiet once ingest is switched on', async () => {
      await register();

      expect(warn).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
    });

    it('reports both notices when ingest is off AND TRUST_PROXY is degraded', async () => {
      getServerEnv.mockReturnValue({ CLIENT_LOG_INGEST_ENABLED: false });
      vi.stubEnv('TRUST_PROXY', 'true');

      await register();

      // Each at the level its own state earns — the degraded proxy is
      // actionable whatever the ingest switch says, and stays at warn.
      expect(info).toHaveBeenCalledWith(
        FRONTEND_LOG_EVENTS['server.client_logs.ingest_disabled'],
        expect.objectContaining({ variable: 'CLIENT_LOG_INGEST_ENABLED' }),
      );
      expect(warn).toHaveBeenCalledWith(
        FRONTEND_LOG_EVENTS['server.trust_proxy.degraded'],
        expect.objectContaining({ configuredValue: 'true' }),
      );
    });

    it('does not fail the boot when the notice cannot be written', async () => {
      // Both levels throw: which one this notice takes now depends on the
      // config, and neither may be able to fail a boot.
      getServerEnv.mockReturnValue({ CLIENT_LOG_INGEST_ENABLED: false });
      const unavailable = (): never => {
        throw new Error('sink unavailable');
      };
      warn.mockImplementation(unavailable);
      info.mockImplementation(unavailable);

      await expect(register()).resolves.toBeUndefined();

      vi.stubEnv('NEXT_PUBLIC_LOG_REMOTE', 'true');
      await expect(register()).resolves.toBeUndefined();
    });
  });

  // TRUST_PROXY is one variable for the whole stack and the two apps honour
  // different amounts of it: Express resolves `true`, `loopback`, and CIDR forms
  // against the socket address, and a Next route handler has none. Those forms
  // resolve to zero hops here, which is safe but is NOT what the operator asked
  // for — so the boot has to say so, or a stack-wide `TRUST_PROXY=true` reads as
  // "per-client buckets are on" while /api/client-logs runs one shared bucket.
  describe('TRUST_PROXY', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    });

    // `100` is in the list because an over-declared hop count degrades the same
    // way the unevaluatable forms do — entries are counted from the right, so a
    // chain shorter than the declared depth can only fall back to the shared
    // bucket, silently turning per-client bucketing off for every request.
    it.each(['true', 'loopback', '10.0.0.0/8', '100'])(
      'reports %s as degraded, naming what was configured',
      async (value) => {
        vi.stubEnv('TRUST_PROXY', value);

        await register();

        expect(warn).toHaveBeenCalledWith(FRONTEND_LOG_EVENTS['server.trust_proxy.degraded'], {
          configuredValue: value,
          resolvedHops: 0,
          reason: 'no_socket_address',
        });
      },
    );

    it.each([
      ['a hop count', '2'],
      ['a hop count at the bound', String(TRUSTED_PROXY_HOPS_MAX)],
      ['an explicit false', 'false'],
      ['an empty value', ''],
    ])('stays quiet for %s', async (_label, value) => {
      vi.stubEnv('TRUST_PROXY', value);

      await register();

      expect(warn).not.toHaveBeenCalled();
    });

    it('stays quiet when TRUST_PROXY is unset', async () => {
      vi.stubEnv('TRUST_PROXY', undefined);

      await register();

      expect(warn).not.toHaveBeenCalled();
    });

    it('does not fail the boot when the report itself cannot be written', async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      warn.mockImplementation(() => {
        throw new Error('sink unavailable');
      });

      await expect(register()).resolves.toBeUndefined();
    });
  });
});
