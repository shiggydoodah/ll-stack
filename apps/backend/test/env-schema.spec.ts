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

  describe('AUTH_SESSION_PRUNE_ENABLED', () => {
    it('defaults to on everywhere except test', () => {
      expect(envSchema.parse(LOCAL_ENV).AUTH_SESSION_PRUNE_ENABLED).toBe(true);
      expect(envSchema.parse(DEPLOYED_ENV).AUTH_SESSION_PRUNE_ENABLED).toBe(true);
      expect(envSchema.parse({ ...LOCAL_ENV, NODE_ENV: 'test' }).AUTH_SESSION_PRUNE_ENABLED).toBe(
        false,
      );
    });
  });
});
