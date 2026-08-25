import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicEnvSchema, serverEnvSchema } from './env.schema';

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
