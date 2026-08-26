import 'server-only';

/**
 * Environment resolution for the generated clients' `createClientConfig`.
 *
 * Each `src/<domain>/generated/client.gen.ts` builds its client at module scope, so
 * these run at import time in whichever app pulled the domain in. Reading
 * `process.env` unchecked meant an absent `BACKEND_INTERNAL_URL` produced an
 * `undefined` `baseUrl`: the outbound fetch never settled and `next build` died
 * prerendering with `digest: 'USE_CACHE_TIMEOUT'`, naming the caching scope that was
 * waiting on it rather than the variable that was missing. Failing here instead names
 * the variable.
 *
 * This is a boot-time backstop, not the validation layer — that stays in each app's
 * `config/env.schema.ts` (`apps/frontend`), which this package
 * cannot import without depending on its own consumers.
 *
 * `server-only` makes that server boundary bundler-enforced rather than convention-
 * enforced. Every `'use client'` consumer of `@repo/services` imports types only, so
 * this module is erased from the browser bundle today — but a single value import
 * (the kind `app/(public)/verify-email/actions.ts` already makes server-side) landing
 * in a client component would otherwise turn the throw below into a browser crash
 * telling the user to run `pnpm setup`. It now fails the build, naming the import.
 */
const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(
      `[@repo/services] ${name} is not set. The generated backend clients read it at ` +
        `import time, so the app cannot start without it. Run \`pnpm setup\`, or copy ` +
        `the variable from the relevant .env.example into your app's .env.`,
    );
  }

  return value;
};

/** Internal backend origin every generated client points at (server-to-server only). */
export const getBackendInternalUrl = (): string => requireEnv('BACKEND_INTERNAL_URL');

/** Shared secret the clients attach as `x-api-secret` for the backend's global guard. */
export const getBackendApiSecret = (): string => requireEnv('BACKEND_API_SECRET');
