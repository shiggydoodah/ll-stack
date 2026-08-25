// Proves the ts-node dev pipeline can still compile and load the backend — the
// gap that let cookie@2 (ESM-only, `exports`-only manifest) ship green through
// `pnpm verify` while `pnpm dev` died at boot with TS2307.
//
// The dev/seed/openapi entry points run `-r ts-node/register` with the
// "ts-node" override block in tsconfig.json, which pins the deprecated node10
// resolver — the only resolver in the repo that cannot read `exports`-only
// package manifests. Every verify gate resolves modules some other way (`tsc`
// under node20, jest's own resolver, real Node against `dist/`), so nothing
// else exercises this pipeline. Same blind-spot shape as `dist-boot-guard.mjs`,
// from the opposite direction; this file mirrors its semantics.
//
// Must be run through the same flags as the real entry points, from
// `apps/backend` (ts-node reads tsconfig.json from cwd):
//
//     node -r ts-node/register -r ./scripts/ts-node-resolve-js-ext.cjs scripts/tsnode-boot-guard.cjs
//
// Deliberately does NOT boot Nest or connect to Postgres. Env validation runs
// eagerly inside `ConfigModule.forRoot`, so on a machine with no env this
// throws application errors long after every file already compiled and every
// static require resolved — that is a pass here, exactly as in the dist guard.
//
// Coverage is the AppModule module graph and nothing beyond it. The other
// ts-node entry points (`src/main.ts`, `scripts/extract-openapi.ts`, the
// standalone seed scripts) all execute on load — `main.ts` calls `bootstrap()`
// at top level — so there is no side-effect-free way to probe them from here.
// They share the tsconfig, the resolver, and almost all of the AppModule
// graph, so the uncovered surface is only their handful of entry-point-only
// imports — but a resolver break confined to one of those files will pass
// this guard.

// The failures this guard exists to catch: ts-node's compiler rejected a file
// (TSError — the cookie@2 case), or Node could not locate/load a module.
const MODULE_LOAD_ERROR_CODES = new Set([
  'ERR_INVALID_MODULE_SPECIFIER',
  'ERR_INVALID_PACKAGE_CONFIG',
  'ERR_INVALID_PACKAGE_TARGET',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_IMPORT_NOT_DEFINED',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'ERR_REQUIRE_ASYNC_MODULE',
  'ERR_REQUIRE_ESM',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_UNSUPPORTED_DIR_IMPORT',
  'MODULE_NOT_FOUND',
]);

function report(ok, message) {
  // `writeSync` for the reason `src/bootstrap/report-boot-failure.ts` documents:
  // `process.exit` drops a pending async write, and stdio is asynchronous when
  // it is a pipe on macOS — which is what `pnpm verify` runs this through. No
  // retry loop here, unlike that module: these messages are a few hundred bytes,
  // so a single write is the whole message.
  require('node:fs').writeSync(ok ? 1 : 2, `\n[tsnode-boot-guard] ${message}\n`);
  process.exit(ok ? 0 : 1);
}

function describeLoadOutcome(error) {
  if (error === null) {
    return {
      ok: true,
      message: 'ts-node pipeline compiles and loads the AppModule graph cleanly.',
    };
  }

  if (error.name === 'TSError' || MODULE_LOAD_ERROR_CODES.has(error.code)) {
    return {
      ok: false,
      message:
        'The ts-node pipeline cannot compile/load the backend, so `pnpm dev` (and the ' +
        `seed/openapi scripts) would not boot:\n\n${error.stack ?? error.message}\n`,
    };
  }

  return {
    ok: true,
    message:
      'ts-node pipeline compiles and loads the AppModule graph cleanly — every file in the graph ' +
      `compiled and every module it requires resolved, then application code raised ${
        error.name ?? error.constructor?.name ?? 'an error'
      }, which is as far as this guard goes (env and database are deliberately not provided).`,
  };
}

// Same deferred-verdict dance as dist-boot-guard.mjs: throws from graph edges
// linked through Node's `require(esm)` path can surface as an uncaught
// exception on a later tick rather than propagating to the try/catch.
process.once('uncaughtException', (error) => {
  const outcome = describeLoadOutcome(error);

  report(outcome.ok, outcome.message);
});

try {
  // Mirrors the first line of src/main.ts — Nest decorators need the metadata
  // polyfill installed before the module graph evaluates.
  require('reflect-metadata');
  require('../src/app.module');
} catch (error) {
  const outcome = describeLoadOutcome(error);

  report(outcome.ok, outcome.message);
}

setImmediate(() => {
  const outcome = describeLoadOutcome(null);

  report(outcome.ok, outcome.message);
});
