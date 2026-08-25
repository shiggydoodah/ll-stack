/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.(e2e-)?spec\\.ts$',
  // The shared preset (`packages/config/tsconfig.nestjs.json`) compiles with
  // `"module": "node20"`, which preserves dynamic `import()` as a real ESM
  // import rather than downlevelling it to `Promise.resolve().then(() =>
  // require(...))`. Correct for the built `dist/` output, fatal here: a real
  // `import()` escapes Jest's CommonJS module registry, so `jest.mock`, the
  // module cache and `moduleNameMapper` all stop applying, and the ~99
  // `await import('../src/…')` calls across the suite hit Node's ESM loader
  // instead. Pin the transform back to CommonJS. Reintroducing the node10
  // resolver re-triggers the TypeScript 6 deprecation, hence
  // `ignoreDeprecations`. `apps/backend/tsconfig.json` carries the equivalent
  // override for ts-node — same reason, different runner, keep both.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
  // uuid v14 ships ESM-only (both dist-node and dist are ESM). Jest's CommonJS
  // runtime cannot load ESM without transformation. We map uuid to its dist path
  // and exclude it from the transformIgnorePatterns so ts-jest transpiles it.
  // cookie v2 is the same shape (ESM-only, exports-only) and rides the same
  // anchor; it needs no moduleNameMapper because its exports string already
  // resolves under Jest's require conditions.
  //
  // In pnpm's node_modules layout, uuid resolves through a symlink to a real
  // path like .pnpm/uuid@14.0.0/node_modules/uuid/.... A naive /node_modules/
  // pattern would match the inner /node_modules/uuid/ segment. The anchor-based
  // pattern below ensures that any path containing 'uuid@14' anywhere is NOT
  // ignored (i.e. it is transformed by ts-jest).
  moduleNameMapper: {
    '^uuid$': '<rootDir>/node_modules/uuid/dist/index.js',
    // Counterpart to the CommonJS transform above. `tsc` under `node20` requires
    // `.js` on relative dynamic-import specifiers (TS2835), so the suite's
    // `await import('../src/app.module.js')` calls carry an extension that never
    // exists on disk — the file is `.ts`. Strip it so Jest resolves back through
    // `moduleFileExtensions` and finds the TypeScript source. ts-node needs the
    // same mapping and gets it from `scripts/ts-node-resolve-js-ext.cjs`, loaded
    // as a second `-r` flag on every entry point — ts-node's own
    // `experimentalResolver` is broken, and that file explains why.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: ['^(?!.*(uuid@14|cookie@2)).*\\/node_modules\\/'],
  testEnvironment: 'node',
  // ~26 integration suites build the full `AppModule` in `beforeAll`. Hooks
  // inherit Jest's 5s default timeout, and under cumulative serial load a
  // full-app bootstrap occasionally exceeds it (the "re-run and it passes"
  // class of flake). A 30s global gives bootstraps headroom; true hangs are
  // still caught by this per-test ceiling and the open-handle guard.
  testTimeout: 30000,
  // Silence the static `@nestjs/common` Logger (see test/silence-nest-logger.ts).
  setupFilesAfterEnv: ['<rootDir>/test/silence-nest-logger.ts'],
  // Integration suites reset state via `prisma.<model>.deleteMany()` in
  // `beforeEach`, so two workers on ONE database would wipe each other's
  // fixtures mid-test — which is what kept this suite serial for its whole
  // life. Parallelism is safe now because each worker gets its own database:
  // `test/global-setup.ts` clones the base `llstack_test` per extra worker
  // (`CREATE DATABASE ... TEMPLATE`, ~0.15s each) and
  // `test/helpers/test-database-url.ts` routes worker N > 1 to `<base>_wN`.
  //
  // Hard-coded for a low-spec machine rather than derived from the host, so
  // every developer and CI runner resolves to the same worker count whatever
  // the box reports. Two is the safe floor above serial: each worker can grow
  // to `workerIdleMemoryLimit` of heap and holds its own Postgres connection
  // pools, so on an 8 GiB machine — where the OS, the editor and the Postgres
  // container already claim a few GiB — more workers mostly buy memory
  // pressure rather than throughput, and the suite's tail is DB-bound anyway.
  // Larger machines are left some speed on the table deliberately; override
  // per-run with `--maxWorkers=N` (forwarded through the guard script) when
  // you want a quiet single-worker run or an experiment.
  maxWorkers: 2,
  // Bound each worker's cumulative heap. Everything Jest retains per file
  // (ts-jest in-process compile output, per-file module registries)
  // accumulates for the worker's lifetime — a smooth monotonic ramp with no
  // per-suite leak (every integration spec closes its Nest app / disconnects
  // its PrismaClient). Charted on Node 24 across the serial era's single
  // worker, that ramp reached ~3.77 GB heapUsed by the final files, grazing
  // V8's ~4 GB old-space ceiling — the long-standing "just re-run it"
  // SIGABRT/SIGSEGV flake. Jest samples each worker's `heapUsed` after every
  // test file and recycles the worker once it crosses this limit; the
  // coordinator never runs test code, so it cannot OOM. With 2 workers each
  // now sees half the files, so recycles should be rare, but the bound
  // stays: it is what turns a future footprint regression into a recycle
  // instead of a crash. The guard in
  // scripts/jest-open-handle-guard.mjs recognises the V8 OOM banner, so if a
  // single file's footprint ever outgrows this bound the death is reported as
  // heap exhaustion rather than an anonymous signal to be re-run.
  workerIdleMemoryLimit: '1500MB',
  // Clones the per-worker databases described above; unit-only runs with no
  // database stay possible (it warns and skips instead of failing).
  globalSetup: '<rootDir>/test/global-setup.ts',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
};
