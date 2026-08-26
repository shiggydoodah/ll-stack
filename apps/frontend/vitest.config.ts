import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const appRoot = dirname(fileURLToPath(import.meta.url));

// The Next.js tsconfig sets `jsx: "preserve"` (the framework transforms JSX at
// build time), which Vitest/Vite inherits and then fails to parse JSX in `.tsx`
// test files. `@vitejs/plugin-react` transforms JSX (automatic runtime) here so
// component/hook tests can render. The default environment stays `node`; DOM
// tests opt in per-file with a `// @vitest-environment jsdom` pragma.
//
// `@/` resolves to the app root so jsdom component tests can render components that
// statically import app modules (e.g. MembersShell imports `@/lib/routes`). In
// jsdom the web transform resolves imports before mocks apply, so `@/` deps can't be
// `vi.mock`ed there — they load the real module, which is fine for pure modules like
// `lib/routes`. Node-env action/lib tests still import the module under test
// relatively and mock their `@/` deps: `vi.mock` overrides this alias, so they are
// unaffected (see app/actions/login.test and (members)/layout.test).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(appRoot, '.'),
    },
  },
  test: {
    // Local runs cap the fork pool; vitest's own default sizes it to every core.
    // Hard-coded to the project's minimum supported machine rather than derived
    // from the host, so every developer resolves to the same pool whatever the
    // box reports — the same decision already made for `maxWorkers` in
    // apps/backend/jest.config.cjs. Larger machines are left some speed on the
    // table deliberately; override per-run with `vitest --maxWorkers=N` when
    // you want a wider pool.
    //
    // Two tiers, because the two runs are asking for different things. A
    // standalone `pnpm test:frontend` is someone's inner loop and has the
    // machine to itself, so it gets 4 forks; this suite is import/jsdom-bound
    // rather than assertion-bound, and halving the pool nearly doubles it.
    // Under `pnpm test` / `pnpm verify` — which set VERIFY_SWEEP — turbo runs
    // the workspace suites one at a time (--concurrency=1), and the point of
    // that sweep is a low, flat ceiling rather than the fastest finish: 2
    // forks holds the whole phase to ~2 busy workers plus a coordinator. CI
    // keeps vitest's default sizing: runners are small and run one suite per
    // job.
    ...(process.env.CI
      ? {}
      : {
          maxWorkers: process.env.VERIFY_SWEEP ? 2 : 4,
        }),
    // `vi.stubEnv` is undone after every test rather than left standing. Without
    // it a stub set in one case leaked into every case after it in the file —
    // NODE_ENV in particular, which the binding cookie names and the Secure flag
    // both read, so a file's later assertions silently ran under an environment
    // no test asked for.
    unstubEnvs: true,
    env: {
      // Pinned, and pinned to a zone that is NOT UTC. Code that resolves a local
      // wall-clock date is indistinguishable from a UTC implementation when the
      // runner sits in UTC — which is what a CI container defaults to — so
      // `Date.UTC(y, m, d)` in place of `new Date(y, m, d)` would pass every
      // test. Europe/London is offset from UTC for half the year and observes
      // DST, so both mistakes fail loudly.
      TZ: 'Europe/London',
    },
  },
});
