import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_LOG_RATE_LIMIT_DEFAULT,
  CLIENT_LOG_RATE_LIMIT_MAX,
  CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT,
  CLIENT_LOG_RATE_SHARED_LIMIT_MAX,
  CLIENT_LOG_RECORD_LIMIT_DEFAULT,
  CLIENT_LOG_RECORD_LIMIT_MAX,
  CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT,
  CLIENT_LOG_RECORD_SHARED_LIMIT_MAX,
  TRUSTED_PROXY_HOPS_MAX,
  publicEnvSchema,
  resolveTrustedProxyHops,
  serverEnvSchema,
} from './env.schema';
import {
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  DEFAULT_ROTATION_RETRY_SECONDS,
} from '../lib/auth/constants';

/**
 * Minimal `KEY=value` reader for the committed `.env.example`. Deliberately not
 * dotenv (no app here depends on it): these files use no quoting, interpolation,
 * or multi-line values, and this is test-only. Trailing ` # comment` is stripped
 * the way dotenv strips it for unquoted values.
 */
const readEnvExample = (url: URL): Record<string, string> =>
  Object.fromEntries(
    readFileSync(url, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const value = line.slice(separator + 1);
        const commentAt = value.search(/\s#/);
        return [
          line.slice(0, separator),
          (commentAt === -1 ? value : value.slice(0, commentAt)).trim(),
        ];
      }),
  );

// The values this app actually ships. Read rather than re-declared: a copy here
// would keep passing through exactly the .env.example-vs-schema drift these tests
// exist to catch (the guard is exact string equality, and it fails open).
const envExample = readEnvExample(new URL('../.env.example', import.meta.url));

const validEnv = {
  NODE_ENV: 'development',
  PORT: '4100',
  BACKEND_INTERNAL_URL: 'http://localhost:3100',
  BACKEND_API_SECRET: 'test-backend-secret',
  SESSION_SECRET: 'test-session-secret-must-be-32-chars',
  BINDING_SECRET: 'test-binding-secret-must-be-32-chars',
  NEXT_PUBLIC_APP_NAME: 'app',
};

describe('frontend env schema', () => {
  it('parses valid env', () => {
    const parsed = serverEnvSchema.parse(validEnv);

    expect(parsed.PORT).toBe(4100);
    expect(parsed.BACKEND_INTERNAL_URL).toBe('http://localhost:3100');
    expect(parsed.DEV_MODE).toBe(false);
  });

  it('parses DEV_MODE=true', () => {
    const parsed = serverEnvSchema.parse({ ...validEnv, DEV_MODE: 'true' });

    expect(parsed.DEV_MODE).toBe(true);
  });

  it('rejects invalid DEV_MODE values', () => {
    expect(() => serverEnvSchema.parse({ ...validEnv, DEV_MODE: 'yes' })).toThrowError();
  });

  // The idle timeout is the session clock interactive users actually meet, so
  // the shipped default is asserted rather than left to drift. It is deliberately
  // the smaller of the two clocks — the backend's AUTH_SESSION_TTL_SECONDS is the
  // absolute ceiling, and nothing here can read it to compare.
  describe('AUTH_IDLE_TIMEOUT_SECONDS', () => {
    it('defaults to eight hours, and blank reads as unset', () => {
      expect(serverEnvSchema.parse(validEnv).AUTH_IDLE_TIMEOUT_SECONDS).toBe(28_800);
      expect(
        serverEnvSchema.parse({ ...validEnv, AUTH_IDLE_TIMEOUT_SECONDS: '' })
          .AUTH_IDLE_TIMEOUT_SECONDS,
      ).toBe(28_800);
    });

    it('matches the default lib/auth reads when the variable is unset', () => {
      // Two readers, one number: the schema validates it, and
      // `getIdleTimeoutSeconds()` reads process.env directly so `proxy.ts` does
      // not pull this schema in on every request. They must not drift.
      expect(serverEnvSchema.parse(validEnv).AUTH_IDLE_TIMEOUT_SECONDS).toBe(
        DEFAULT_IDLE_TIMEOUT_SECONDS,
      );
    });

    it('accepts an explicit whole number of seconds', () => {
      expect(
        serverEnvSchema.parse({ ...validEnv, AUTH_IDLE_TIMEOUT_SECONDS: '1800' })
          .AUTH_IDLE_TIMEOUT_SECONDS,
      ).toBe(1800);
    });

    it('refuses a non-integer, a zero, and anything past the 30-day cap', () => {
      for (const value of ['abc', '12.5', '1e3', '0', '2592001']) {
        expect(() =>
          serverEnvSchema.parse({ ...validEnv, AUTH_IDLE_TIMEOUT_SECONDS: value }),
        ).toThrowError();
      }
    });
  });

  // The back-off after a rotation call that could not be answered. It is the
  // third clock this app shares with the backend and cannot read: it must stay
  // at or below AUTH_SESSION_ROTATION_GRACE_SECONDS, so the retry comes due
  // while the window is still serving the retired token and re-asks until one
  // ask lands past the boundary and becomes the recovery.
  describe('AUTH_ROTATION_RETRY_SECONDS', () => {
    it('defaults to a minute, and blank reads as unset', () => {
      expect(serverEnvSchema.parse(validEnv).AUTH_ROTATION_RETRY_SECONDS).toBe(60);
      expect(
        serverEnvSchema.parse({ ...validEnv, AUTH_ROTATION_RETRY_SECONDS: '' })
          .AUTH_ROTATION_RETRY_SECONDS,
      ).toBe(60);
    });

    it('matches the default lib/auth reads when the variable is unset', () => {
      // Two readers, one number, same as the idle timeout above: the schema
      // validates it and `getRotationRetrySeconds()` reads process.env directly,
      // so `proxy.ts` does not pull this schema in on every request.
      expect(serverEnvSchema.parse(validEnv).AUTH_ROTATION_RETRY_SECONDS).toBe(
        DEFAULT_ROTATION_RETRY_SECONDS,
      );
    });

    it('accepts a tuned back-off matching a widened grace window', () => {
      expect(
        serverEnvSchema.parse({ ...validEnv, AUTH_ROTATION_RETRY_SECONDS: '300' })
          .AUTH_ROTATION_RETRY_SECONDS,
      ).toBe(300);
    });

    it('refuses a non-integer, a zero, and anything past the one-hour cap', () => {
      // Past an hour this has stopped being a back-off between two calls on one
      // navigation and become a rotation interval of its own.
      for (const value of ['abc', '1.5', '0', '-60', '3601']) {
        expect(() =>
          serverEnvSchema.parse({ ...validEnv, AUTH_ROTATION_RETRY_SECONDS: value }),
        ).toThrowError();
      }
    });
  });

  it('defaults the client-log ingest kill switch to OFF', () => {
    // The route answers 404 while this is off, before its rate limit runs. Off
    // by default because an anonymous, internet-writable ingest endpoint must
    // be an operator's choice — the same posture as OpenTelemetry, which ships
    // wired up and off.
    expect(serverEnvSchema.parse(validEnv).CLIENT_LOG_INGEST_ENABLED).toBe(false);
    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_INGEST_ENABLED: 'true' })
        .CLIENT_LOG_INGEST_ENABLED,
    ).toBe(true);
    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_INGEST_ENABLED: 'false' })
        .CLIENT_LOG_INGEST_ENABLED,
    ).toBe(false);
    expect(() =>
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_INGEST_ENABLED: 'yes' }),
    ).toThrowError();
  });

  // The escape hatch for the one deployment shape that breaks /api/client-logs'
  // Origin check silently and completely: a proxy that rewrites Host to its
  // upstream. Unset by default — the route compares against Host, which is
  // exact everywhere Host is preserved.
  describe('CLIENT_LOG_ALLOWED_ORIGIN', () => {
    it('is unset by default, and blank reads as unset', () => {
      // `CLIENT_LOG_ALLOWED_ORIGIN=` is how an env file says "left alone". It
      // must not read as an origin nothing can match, which would refuse every
      // browser request — the exact failure this variable exists to repair.
      expect(serverEnvSchema.parse(validEnv).CLIENT_LOG_ALLOWED_ORIGIN).toBeUndefined();
      expect(
        serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_ALLOWED_ORIGIN: '' })
          .CLIENT_LOG_ALLOWED_ORIGIN,
      ).toBeUndefined();
      expect(
        serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_ALLOWED_ORIGIN: '  ' })
          .CLIENT_LOG_ALLOWED_ORIGIN,
      ).toBeUndefined();
    });

    it('normalises to the form a browser Origin header arrives in', () => {
      // The route compares this string to `new URL(origin).origin`, so it is
      // stored the same way: lowercased, default port dropped, trailing slash
      // gone. A comparison that failed on a trailing slash would be the same
      // total telemetry loss, one character wide.
      const parse = (value: string): string | undefined =>
        serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_ALLOWED_ORIGIN: value })
          .CLIENT_LOG_ALLOWED_ORIGIN;

      expect(parse('https://app.example.com')).toBe('https://app.example.com');
      expect(parse(' https://app.example.com/ ')).toBe('https://app.example.com');
      expect(parse('HTTPS://App.Example.COM')).toBe('https://app.example.com');
      expect(parse('https://app.example.com:443')).toBe('https://app.example.com');
      // A non-default port is part of the origin and is kept.
      expect(parse('http://localhost:4100')).toBe('http://localhost:4100');
    });

    it('refuses anything that is not a bare http(s) origin', () => {
      for (const value of ['app.example.com', 'ftp://app.example.com', '//app.example.com']) {
        expect(() =>
          serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_ALLOWED_ORIGIN: value }),
        ).toThrowError('absolute http(s) URL');
      }

      // A path, query, or credentials here would be silently ignored — an
      // operator reading the value as a restriction it cannot express. Refuse
      // at boot instead.
      //
      // Asserted on a fragment UNIQUE TO THIS BRANCH. Both messages open with
      // the variable name, so matching on that (or on `ORIGIN`, which is inside
      // it) passes for either one — and a regression that made a path-bearing
      // URL fail the parse/scheme branch instead would have been invisible.
      for (const value of [
        'https://app.example.com/api/client-logs',
        'https://app.example.com?x=1',
        'https://user:pw@app.example.com',
      ]) {
        expect(() =>
          serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_ALLOWED_ORIGIN: value }),
        ).toThrowError('scheme, host, and port only');
      }
    });
  });

  it('defaults both client-log ingest allowances and parses an override', () => {
    const parsed = serverEnvSchema.parse(validEnv);

    // 300, not the 60 this shipped with: client-logger.ts flushes on 20 buffered
    // records as well as every 5s, so one tab in an error storm spent 60/min in
    // seconds, and a bucket is an address — corporate NAT and mobile CGNAT put
    // hundreds of members behind one.
    expect(parsed.CLIENT_LOG_RATE_LIMIT_PER_MINUTE).toBe(300);
    // Asserted against the exported constant too, not just the literal: the
    // limiter's unreadable-env fallback IS this value, so the schema has to keep
    // using the shared definition rather than drifting back to a local number.
    expect(parsed.CLIENT_LOG_RATE_LIMIT_PER_MINUTE).toBe(CLIENT_LOG_RATE_LIMIT_DEFAULT);
    // The shared bucket is every caller at once — the whole-app ceiling every
    // request spends alongside its own bucket — so it is sized well above the
    // per-client figure. 6 000, doubled from the figure it carried while it was
    // only the untrusted-topology fallback: now that it always binds, it binds
    // real production traffic.
    expect(parsed.CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE).toBe(6_000);
    expect(parsed.CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE).toBe(
      CLIENT_LOG_RATE_SHARED_LIMIT_DEFAULT,
    );
    expect(parsed.CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE).toBeGreaterThan(
      parsed.CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
    );

    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '120' })
        .CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
    ).toBe(120);
    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: '9000' })
        .CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE,
    ).toBe(9_000);
  });

  it('refuses an ingest limit that would leave the route uncapped', () => {
    // There is deliberately no off switch for an anonymous route, so 0 (and
    // anything non-numeric) has to fail rather than read as "unlimited".
    expect(() =>
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '0' }),
    ).toThrowError();
    expect(() =>
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_PER_MINUTE: 'none' }),
    ).toThrowError();
  });

  it('caps the per-client ingest limit, because it bounds the limiter memory', () => {
    // The live-bucket ceiling shrinks as this rises so that `keys x allowance`
    // stays fixed; past this figure the two can no longer both be satisfied.
    expect(
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_PER_MINUTE: String(CLIENT_LOG_RATE_LIMIT_MAX),
      }).CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
    ).toBe(600);
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_PER_MINUTE: String(CLIENT_LOG_RATE_LIMIT_MAX + 1),
      }),
    ).toThrowError('must be between 1 and 600');
  });

  it('keeps the shared allowance capped at the limiter memory reserve', () => {
    // CLIENT_LOG_RATE_SHARED_BUCKET_RESERVE is this figure: the limiter holds
    // exactly this many hits back from its tracked-hit budget for the shared
    // bucket. Letting the env exceed it would understate the budget, so the cap
    // and the reserve are one definition and this pins that the schema enforces
    // it rather than a number that merely happens to match today.
    expect(
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: String(CLIENT_LOG_RATE_SHARED_LIMIT_MAX),
      }).CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE,
    ).toBe(CLIENT_LOG_RATE_SHARED_LIMIT_MAX);
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: String(CLIENT_LOG_RATE_SHARED_LIMIT_MAX + 1),
      }),
    ).toThrowError();
  });

  it('treats a blank numeric knob as unset rather than as zero', () => {
    // `FOO=` is how an env file says "I left this alone". Coercion would read it
    // as 0 and fail with a message about positivity, for a value nobody set.
    for (const key of [
      'CLIENT_LOG_RATE_LIMIT_PER_MINUTE',
      'CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE',
      'CLIENT_LOG_RECORD_LIMIT_PER_MINUTE',
      'CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE',
      'FRONTEND_INSTANCE_COUNT',
    ] as const) {
      expect(serverEnvSchema.parse({ ...validEnv, [key]: '' })[key]).toBe(
        serverEnvSchema.parse(validEnv)[key],
      );
    }
  });

  it('refuses a numeric knob that does not read as the number it parses to', () => {
    expect(() =>
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '0x10' }),
    ).toThrowError('whole number');
    expect(() =>
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '12.5' }),
    ).toThrowError('whole number');
  });

  it('defaults both record allowances, which are the ingest ceiling proper', () => {
    // A request cap alone metered the wrong thing: a request is worth up to
    // MAX_RECORDS (100), so a caller packing every batch bought ~100x the ingest
    // of one who does not. These are what the log sink is actually sized in.
    const parsed = serverEnvSchema.parse(validEnv);

    expect(parsed.CLIENT_LOG_RECORD_LIMIT_PER_MINUTE).toBe(CLIENT_LOG_RECORD_LIMIT_DEFAULT);
    expect(parsed.CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE).toBe(
      CLIENT_LOG_RECORD_SHARED_LIMIT_DEFAULT,
    );
    // Whole-app ceilings sit above per-client ones, in both dimensions.
    expect(parsed.CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE).toBeGreaterThan(
      parsed.CLIENT_LOG_RECORD_LIMIT_PER_MINUTE,
    );
    // And a record allowance has to leave room for more than one full batch per
    // allowed request, or the request cap could never be the binding one.
    expect(parsed.CLIENT_LOG_RECORD_LIMIT_PER_MINUTE).toBeGreaterThan(
      parsed.CLIENT_LOG_RATE_LIMIT_PER_MINUTE,
    );

    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: '900' })
        .CLIENT_LOG_RECORD_LIMIT_PER_MINUTE,
    ).toBe(900);
    expect(
      serverEnvSchema.parse({ ...validEnv, CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: '90000' })
        .CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE,
    ).toBe(90_000);
  });

  it('refuses a shared allowance below the per-client one, in either dimension', () => {
    // The shared figures are whole-app ceilings charged on EVERY request, so
    // shared-below-per-client is a contradiction, not a small allowance: no
    // caller could ever reach its per-client figure and the throttle records
    // would blame the wrong knob.
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '300',
        CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: '299',
      }),
    ).toThrowError('whole-app request ceiling');
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: '12000',
        CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: '11999',
      }),
    ).toThrowError('whole-app record ceiling');
    // Equal is legal — the floor is the per-client figure itself.
    expect(
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RATE_LIMIT_PER_MINUTE: '300',
        CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE: '300',
      }).CLIENT_LOG_RATE_LIMIT_SHARED_PER_MINUTE,
    ).toBe(300);
  });

  it('caps and floors the record allowances, leaving no way to uncap ingest', () => {
    // Same reasoning as the request allowance: the route is anonymous, so 0 must
    // fail rather than read as "unlimited".
    for (const key of [
      'CLIENT_LOG_RECORD_LIMIT_PER_MINUTE',
      'CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE',
    ] as const) {
      expect(() => serverEnvSchema.parse({ ...validEnv, [key]: '0' })).toThrowError();
      expect(() => serverEnvSchema.parse({ ...validEnv, [key]: 'none' })).toThrowError();
    }

    expect(
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: String(CLIENT_LOG_RECORD_LIMIT_MAX),
      }).CLIENT_LOG_RECORD_LIMIT_PER_MINUTE,
    ).toBe(CLIENT_LOG_RECORD_LIMIT_MAX);
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RECORD_LIMIT_PER_MINUTE: String(CLIENT_LOG_RECORD_LIMIT_MAX + 1),
      }),
    ).toThrowError();
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        CLIENT_LOG_RECORD_LIMIT_SHARED_PER_MINUTE: String(CLIENT_LOG_RECORD_SHARED_LIMIT_MAX + 1),
      }),
    ).toThrowError();
  });

  it('parses TRUST_PROXY as a hop count, trusting nobody by default', () => {
    expect(serverEnvSchema.parse(validEnv).TRUST_PROXY).toBe(0);
    expect(serverEnvSchema.parse({ ...validEnv, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(0);
    expect(serverEnvSchema.parse({ ...validEnv, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
  });

  it('degrades TRUST_PROXY forms that need a socket address, rather than failing the boot', () => {
    // The backend accepts all of these — Express resolves them against the
    // socket address. There is none here, so they cannot be honoured and resolve
    // to zero hops: every caller in one bucket, never "take whatever the caller
    // wrote". Refusing them was the earlier design and it was a trap, because
    // TRUST_PROXY is routinely set once for a whole stack: `TRUST_PROXY=true`
    // booted the backend and crashed the frontend for the same value.
    for (const value of ['true', 'TRUE', 'loopback', '10.0.0.0/8', 'nonsense']) {
      expect(serverEnvSchema.parse({ ...validEnv, TRUST_PROXY: value }).TRUST_PROXY).toBe(0);
    }
  });

  it('separates a degraded TRUST_PROXY from a deliberate one, so boot can report it', () => {
    // The schema only yields a number, so the raw value's verdict is what
    // instrumentation.ts needs to tell "the operator asked for nothing" from
    // "the operator asked for something this app cannot do".
    expect(resolveTrustedProxyHops(undefined)).toEqual({ hops: 0 });
    expect(resolveTrustedProxyHops('')).toEqual({ hops: 0 });
    expect(resolveTrustedProxyHops('  ')).toEqual({ hops: 0 });
    expect(resolveTrustedProxyHops('false')).toEqual({ hops: 0 });
    expect(resolveTrustedProxyHops('2')).toEqual({ hops: 2 });
    expect(resolveTrustedProxyHops(' 2 ')).toEqual({ hops: 2 });

    expect(resolveTrustedProxyHops('true')).toEqual({ hops: 0, unevaluatable: 'true' });
    expect(resolveTrustedProxyHops('loopback')).toEqual({ hops: 0, unevaluatable: 'loopback' });
    expect(resolveTrustedProxyHops('10.0.0.0/8')).toEqual({ hops: 0, unevaluatable: '10.0.0.0/8' });
  });

  it('treats an absurd hop count as a typo, and degrades rather than trusting it', () => {
    // An over-declared count is NOT harmless: entries are counted from the right,
    // so a chain shorter than the declared depth can only fall back to the shared
    // bucket — silently turning per-client bucketing off for every request. Past
    // the bound that is certainly a typo, so it takes the same reported-degraded
    // path as `true`, rather than failing a boot over a value the backend accepts.
    expect(resolveTrustedProxyHops(String(TRUSTED_PROXY_HOPS_MAX))).toEqual({
      hops: TRUSTED_PROXY_HOPS_MAX,
    });
    expect(resolveTrustedProxyHops(String(TRUSTED_PROXY_HOPS_MAX + 1))).toEqual({
      hops: 0,
      unevaluatable: String(TRUSTED_PROXY_HOPS_MAX + 1),
    });
    expect(resolveTrustedProxyHops('100')).toEqual({ hops: 0, unevaluatable: '100' });

    // Still a safe boot, not a refusal.
    expect(serverEnvSchema.parse({ ...validEnv, TRUST_PROXY: '100' }).TRUST_PROXY).toBe(0);
  });

  it('refuses to boot scaled out, because the ingest limit counts in-process', () => {
    // Mirrors the backend's BACKEND_INSTANCE_COUNT guard: N instances silently
    // means N times the allowance, and the refusal is the documented mitigation.
    expect(serverEnvSchema.parse(validEnv).FRONTEND_INSTANCE_COUNT).toBe(1);

    for (const NODE_ENV of ['staging', 'production'] as const) {
      expect(() =>
        serverEnvSchema.parse({ ...validEnv, NODE_ENV, FRONTEND_INSTANCE_COUNT: '2' }),
      ).toThrowError('shared store for the /api/client-logs rate limit');
    }

    // Development and test scale out freely — nothing there depends on the count.
    expect(
      serverEnvSchema.parse({ ...validEnv, FRONTEND_INSTANCE_COUNT: '4' }).FRONTEND_INSTANCE_COUNT,
    ).toBe(4);
  });

  it('rejects invalid env', () => {
    expect(() =>
      serverEnvSchema.parse({
        NODE_ENV: 'development',
        PORT: '4100',
        BACKEND_INTERNAL_URL: 'not-a-url',
        BACKEND_API_SECRET: '',
        SESSION_SECRET: '',
        NEXT_PUBLIC_APP_NAME: 'app',
      }),
    ).toThrowError();
  });

  it('fails closed when staging/production still holds a committed dev secret', () => {
    const devDefaults = {
      BACKEND_API_SECRET: envExample.BACKEND_API_SECRET,
      SESSION_SECRET: envExample.SESSION_SECRET,
      BINDING_SECRET: envExample.BINDING_SECRET,
    };

    for (const NODE_ENV of ['staging', 'production'] as const) {
      for (const [key, devValue] of Object.entries(devDefaults)) {
        expect(() =>
          serverEnvSchema.parse({ ...validEnv, NODE_ENV, [key]: devValue }),
        ).toThrowError(`${key} is still the committed local dev default`);
      }
    }

    // Development and test are exactly where these belong: `pnpm setup` copies
    // them from .env.example so a fresh clone boots unattended.
    for (const NODE_ENV of ['development', 'test'] as const) {
      expect(serverEnvSchema.parse({ ...validEnv, ...devDefaults, NODE_ENV }).SESSION_SECRET).toBe(
        devDefaults.SESSION_SECRET,
      );
    }
  });

  it('refuses the env it actually ships in .env.example under production', () => {
    // The end-to-end property: not "the schema rejects these three strings" but
    // "the schema rejects the file `pnpm setup` copies into .env". Rotating a dev
    // default in .env.example without updating the schema fails here — which is
    // otherwise a silent fail-open, since the guard only matches exact strings.
    const result = serverEnvSchema.safeParse({ ...envExample, NODE_ENV: 'production' });

    if (result.success) {
      throw new Error('.env.example parsed cleanly under NODE_ENV=production — the guard is dead');
    }

    const flaggedKeys = result.error.issues
      .filter((issue) => issue.message.includes('is still the committed local dev default'))
      .map((issue) => issue.path.join('.'))
      .sort();

    expect(flaggedKeys).toEqual(['BACKEND_API_SECRET', 'BINDING_SECRET', 'SESSION_SECRET']);
  });
});

describe('frontend public env schema', () => {
  it('defaults NEXT_PUBLIC_APP_NAME and leaves the log knobs unset', () => {
    const parsed = publicEnvSchema.parse({});

    expect(parsed.NEXT_PUBLIC_APP_NAME).toBe('app');
    expect(parsed.NEXT_PUBLIC_LOG_LEVEL).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_LOG_REMOTE).toBeUndefined();
  });

  it('parses NEXT_PUBLIC_LOG_REMOTE as a boolean flag', () => {
    expect(publicEnvSchema.parse({ NEXT_PUBLIC_LOG_REMOTE: 'true' }).NEXT_PUBLIC_LOG_REMOTE).toBe(
      true,
    );
    expect(publicEnvSchema.parse({ NEXT_PUBLIC_LOG_REMOTE: 'false' }).NEXT_PUBLIC_LOG_REMOTE).toBe(
      false,
    );
    expect(() => publicEnvSchema.parse({ NEXT_PUBLIC_LOG_REMOTE: 'yes' })).toThrowError();
  });
});
