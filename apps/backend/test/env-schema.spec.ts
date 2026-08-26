import { envSchema } from '../src/config/env.schema';

const LOCAL_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/llstack_dev',
  BACKEND_API_SECRET: 'dev-backend-api-secret',
  ADMIN_API_KEY: 'dev-admin-api-key',
} as const;

/** A staging/production env that satisfies every fail-closed rule. */
const DEPLOYED_ENV = {
  ...LOCAL_ENV,
  NODE_ENV: 'production',
  BACKEND_API_SECRET: 'S'.repeat(32),
  ADMIN_API_KEY: 'A'.repeat(32),
  FRONTEND_ORIGIN: 'https://app.example.com',
} as const;

function issuePathsOf(result: ReturnType<typeof envSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

/**
 * The fail-closed rules in env.schema.ts are the backend's last line of defence
 * against a misconfigured deploy, and every one of them is a plain `if` that
 * silently does nothing when it is wrong. This spec is what stops them decaying
 * into decoration.
 */
describe('envSchema', () => {
  describe('NODE_ENV', () => {
    it('refuses to parse when NODE_ENV is absent', () => {
      // The whole point: an omitted NODE_ENV used to default to 'development'
      // and disarm every staging/production check below it at once.
      const { NODE_ENV: _omitted, ...withoutNodeEnv } = LOCAL_ENV;
      const result = envSchema.safeParse(withoutNodeEnv);

      expect(result.success).toBe(false);
      expect(issuePathsOf(result)).toContain('NODE_ENV');
      expect(result.success ? '' : result.error.issues[0]?.message).toContain(
        'must be set explicitly',
      );
    });

    it('accepts each declared environment', () => {
      for (const NODE_ENV of ['development', 'test'] as const) {
        expect(envSchema.safeParse({ ...LOCAL_ENV, NODE_ENV }).success).toBe(true);
      }
      for (const NODE_ENV of ['staging', 'production'] as const) {
        expect(envSchema.safeParse({ ...DEPLOYED_ENV, NODE_ENV }).success).toBe(true);
      }
    });
  });

  describe('deployed secrets', () => {
    it('refuses the committed local dev defaults in staging and production', () => {
      for (const NODE_ENV of ['staging', 'production'] as const) {
        const result = envSchema.safeParse({
          ...DEPLOYED_ENV,
          NODE_ENV,
          BACKEND_API_SECRET: 'dev-backend-api-secret',
          ADMIN_API_KEY: 'dev-admin-api-key',
        });

        expect(result.success).toBe(false);
        expect(issuePathsOf(result)).toEqual(
          expect.arrayContaining(['BACKEND_API_SECRET', 'ADMIN_API_KEY']),
        );
      }
    });

    it('refuses a short secret in staging and production', () => {
      // `min(1)` on the field is what lets a fresh clone boot; on its own it
      // accepted BACKEND_API_SECRET=x in production.
      for (const key of ['BACKEND_API_SECRET', 'ADMIN_API_KEY'] as const) {
        const result = envSchema.safeParse({ ...DEPLOYED_ENV, [key]: 'x' });

        expect(result.success).toBe(false);
        expect(issuePathsOf(result)).toContain(key);
      }
    });

    it('accepts a short secret outside staging and production', () => {
      // Local dev is allowed to be sloppy; that is the trade the floor makes.
      expect(
        envSchema.safeParse({ ...LOCAL_ENV, BACKEND_API_SECRET: 'x', ADMIN_API_KEY: 'y' }).success,
      ).toBe(true);
    });

    it('accepts a 32-character secret in production', () => {
      expect(envSchema.safeParse(DEPLOYED_ENV).success).toBe(true);
    });
  });

  describe('OPENAPI_DOCS_ENABLED', () => {
    it('defaults to on in development only', () => {
      expect(envSchema.parse(LOCAL_ENV).OPENAPI_DOCS_ENABLED).toBe(true);
      expect(envSchema.parse({ ...LOCAL_ENV, NODE_ENV: 'test' }).OPENAPI_DOCS_ENABLED).toBe(false);
      expect(envSchema.parse(DEPLOYED_ENV).OPENAPI_DOCS_ENABLED).toBe(false);
      expect(envSchema.parse({ ...DEPLOYED_ENV, NODE_ENV: 'staging' }).OPENAPI_DOCS_ENABLED).toBe(
        false,
      );
    });

    it('can be turned on deliberately in a deployed environment', () => {
      // Allowed, and gated on ADMIN_API_KEY once mounted — see
      // src/bootstrap/openapi-docs.ts.
      expect(
        envSchema.parse({ ...DEPLOYED_ENV, OPENAPI_DOCS_ENABLED: 'true' }).OPENAPI_DOCS_ENABLED,
      ).toBe(true);
    });
  });

  describe('BACKEND_INSTANCE_COUNT', () => {
    it('treats a blank value as unset rather than as zero', () => {
      // `BACKEND_INSTANCE_COUNT=` is how a stack-wide env file says "left
      // alone". Coercion read it as 0 and failed the boot with "greater than
      // 0" — while the frontend's parser booted on the same file — so the two
      // sides of the stack disagreed about one shared value.
      expect(
        envSchema.parse({ ...LOCAL_ENV, BACKEND_INSTANCE_COUNT: '' }).BACKEND_INSTANCE_COUNT,
      ).toBe(1);
      expect(envSchema.parse(LOCAL_ENV).BACKEND_INSTANCE_COUNT).toBe(1);
    });

    it('refuses a value that does not read as the number it parses to, mirroring the frontend', () => {
      for (const BACKEND_INSTANCE_COUNT of ['1e3', '0x10', '12.5']) {
        const result = envSchema.safeParse({ ...LOCAL_ENV, BACKEND_INSTANCE_COUNT });
        expect(result.success).toBe(false);
        expect(issuePathsOf(result)).toContain('BACKEND_INSTANCE_COUNT');
      }
    });

    it('is bounded, so a fat-fingered count cannot silently declare a fleet', () => {
      expect(
        envSchema.parse({ ...LOCAL_ENV, BACKEND_INSTANCE_COUNT: '1000' }).BACKEND_INSTANCE_COUNT,
      ).toBe(1_000);
      expect(envSchema.safeParse({ ...LOCAL_ENV, BACKEND_INSTANCE_COUNT: '1001' }).success).toBe(
        false,
      );
    });

    it('still refuses more than one declared instance in staging and production', () => {
      // The in-process throttler store is the reason; the parser change above
      // must not loosen the fail-closed guard it feeds.
      const result = envSchema.safeParse({ ...DEPLOYED_ENV, BACKEND_INSTANCE_COUNT: '2' });
      expect(result.success).toBe(false);
      expect(issuePathsOf(result)).toContain('BACKEND_INSTANCE_COUNT');

      expect(
        envSchema.parse({ ...LOCAL_ENV, BACKEND_INSTANCE_COUNT: '2' }).BACKEND_INSTANCE_COUNT,
      ).toBe(2);
    });
  });

  describe('AUTH_SESSION_PRUNE_ENABLED', () => {
    it('defaults to on everywhere except test', () => {
      expect(envSchema.parse(LOCAL_ENV).AUTH_SESSION_PRUNE_ENABLED).toBe(true);
      expect(envSchema.parse(DEPLOYED_ENV).AUTH_SESSION_PRUNE_ENABLED).toBe(true);
      expect(envSchema.parse({ ...LOCAL_ENV, NODE_ENV: 'test' }).AUTH_SESSION_PRUNE_ENABLED).toBe(
        false,
      );
    });
  });

  describe('AUTH_SESSION_PRUNE_MAX_BATCHES', () => {
    // One sweep deletes at most this many batches of AUTH_SESSION_PRUNE_BATCH_SIZE
    // rows, and rotation is what makes the figure move: shorten the rotation
    // interval and one sign-in leaves more rows behind, all expiring together.
    it('defaults to 200 batches, which is 100,000 rows an hour at the shipped batch size', () => {
      const env = envSchema.parse(LOCAL_ENV);
      expect(env.AUTH_SESSION_PRUNE_MAX_BATCHES).toBe(200);
      expect(env.AUTH_SESSION_PRUNE_MAX_BATCHES * env.AUTH_SESSION_PRUNE_BATCH_SIZE).toBe(100_000);
    });

    it('takes a tuned ceiling', () => {
      expect(
        envSchema.parse({ ...LOCAL_ENV, AUTH_SESSION_PRUNE_MAX_BATCHES: '1000' })
          .AUTH_SESSION_PRUNE_MAX_BATCHES,
      ).toBe(1_000);
    });

    it('refuses a zero, a fraction, and anything past the cap', () => {
      // Zero is the one that matters: it disables pruning through a knob that
      // reads like a tuning value, and the table then grows forever.
      for (const value of ['0', '-1', '2.5', 'lots', '10001']) {
        const result = envSchema.safeParse({ ...LOCAL_ENV, AUTH_SESSION_PRUNE_MAX_BATCHES: value });
        expect(result.success).toBe(false);
        expect(issuePathsOf(result)).toContain('AUTH_SESSION_PRUNE_MAX_BATCHES');
      }
    });
  });

  describe('session rotation', () => {
    it('defaults to hourly rotation with a one-minute grace window', () => {
      const env = envSchema.parse(LOCAL_ENV);
      expect(env.AUTH_SESSION_ROTATE_AFTER_SECONDS).toBe(3_600);
      expect(env.AUTH_SESSION_ROTATION_GRACE_SECONDS).toBe(60);
    });

    it('refuses a rotation interval that the session TTL would outlive', () => {
      // Silently reachable through config alone, and it leaves the token minted
      // once and never re-issued — the exact state rotation exists to end.
      const result = envSchema.safeParse({
        ...DEPLOYED_ENV,
        AUTH_SESSION_TTL_SECONDS: '3600',
        AUTH_SESSION_ROTATE_AFTER_SECONDS: '3600',
      });

      expect(result.success).toBe(false);
      expect(issuePathsOf(result)).toContain('AUTH_SESSION_ROTATE_AFTER_SECONDS');
    });

    it('refuses a grace window that outlasts the rotation interval', () => {
      // Every superseded token would stay usable for its whole life, so
      // presenting a retired one would never become the reuse signal.
      const result = envSchema.safeParse({
        ...DEPLOYED_ENV,
        AUTH_SESSION_ROTATE_AFTER_SECONDS: '600',
        AUTH_SESSION_ROTATION_GRACE_SECONDS: '600',
      });

      expect(result.success).toBe(false);
      expect(issuePathsOf(result)).toContain('AUTH_SESSION_ROTATION_GRACE_SECONDS');
    });

    it('accepts a shortened interval and grace outside a deployed environment', () => {
      const env = envSchema.parse({
        ...LOCAL_ENV,
        AUTH_SESSION_ROTATE_AFTER_SECONDS: '120',
        AUTH_SESSION_ROTATION_GRACE_SECONDS: '10',
      });
      expect(env.AUTH_SESSION_ROTATE_AFTER_SECONDS).toBe(120);
      expect(env.AUTH_SESSION_ROTATION_GRACE_SECONDS).toBe(10);
    });
  });
});
