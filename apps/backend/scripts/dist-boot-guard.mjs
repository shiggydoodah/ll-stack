#!/usr/bin/env node

// Proves the BUILT backend can actually be loaded by Node — closing the gap
// where a workspace package ships raw TypeScript to production undetected.
//
// `pnpm verify` runs lint/build/typecheck/test and none of them execute `dist/`:
// `build` only proves `tsc` emitted files, and every other consumer of the
// workspace packages (ts-node, ts-jest, the Next bundlers) compiles their
// TypeScript itself and so never consults the `require` export condition. The
// one consumer that needs a built artifact was the one nothing exercised.
//
// Two checks, because either one alone has a blind spot:
//
//  1. RESOLUTION — every `@repo/*` the built output require()s must resolve,
//     under Node's `require` conditions, to real JavaScript. This is the
//     layout-independent check, and the primary one. Locally pnpm symlinks
//     workspace packages OUTSIDE node_modules, where Node will happily
//     type-strip a `.ts` entry point and load it; in the Docker image
//     `pnpm deploy` copies them in as real directories UNDER node_modules,
//     where Node refuses to strip types at all
//     (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). So a single-file raw-`.ts`
//     package can pass check 2 on a laptop and still be unbootable in the
//     container. Only this check catches that.
//
//  2. LOAD — `dist/app.module.js` must genuinely load. The AppModule graph
//     reaches every module the container touches at startup, so this catches
//     breakage the regex in check 1 cannot see: a bad relative specifier, a
//     `require` condition pointing at a file that isn't on disk, or a
//     third-party ESM/CJS interop failure under the backend's `node20` emit.
//
// Deliberately does NOT boot Nest or connect to Postgres: requiring the module
// graph is where the module-format failures live, and staying database-free
// keeps this runnable anywhere `dist/` exists.

import { readdirSync, readFileSync, statSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(BACKEND_DIR, 'dist');
const ENTRY_POINT = join(DIST_DIR, 'app.module.js');
const BUILD_HINT = "Run `pnpm --filter '@repo/backend...' build` first.";
// Resolve as if from a module inside dist/, so specifiers see the same
// node_modules chain and the same `require` conditions the real entry point
// does. The file need not exist — createRequire only uses it as a base path.
const requireFromDist = createRequire(join(DIST_DIR, 'dist-boot-guard.cjs'));
const WORKSPACE_SPECIFIER = /require\(\s*['"](@repo\/[^'"]+)['"]\s*\)/g;
// `.mjs` is omitted deliberately. Node could load one through a `require`
// condition via require(esm), but backend-consumed workspace packages are
// CommonJS-only by policy - the same policy the failure message below prescribes
// ("emit CommonJS to dist/"). An `.mjs` target is therefore a finding here, not a
// false positive: it means a package took a route the backend does not support.
const JS_EXTENSIONS = ['.js', '.cjs', '.json', '.node'];
// The failures this guard exists to catch — Node could not locate or load a
// module. Anything else (see `describeLoadOutcome`) means the graph loaded and
// application code ran, which is a pass here.
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
  'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING',
  'MODULE_NOT_FOUND',
]);

function report(ok, message) {
  // `writeSync` for the reason `src/bootstrap/report-boot-failure.ts` documents:
  // `process.exit` drops a pending async write, and stdio is asynchronous when
  // it is a pipe on macOS — which is what `pnpm verify` runs this through. No
  // retry loop here, unlike that module: these messages are a few hundred bytes,
  // so a single write is the whole message.
  writeSync(ok ? 1 : 2, `\n[dist-boot-guard] ${message}\n`);
  process.exit(ok ? 0 : 1);
}

function listJsFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJsFiles(entryPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectWorkspaceSpecifiers(files) {
  // Map specifier -> first dist file that requires it, so a failure can name a
  // concrete import site instead of just the package.
  const specifiers = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const [, specifier] of source.matchAll(WORKSPACE_SPECIFIER)) {
      if (!specifiers.has(specifier)) {
        specifiers.set(specifier, relative(BACKEND_DIR, file));
      }
    }
  }

  return specifiers;
}

function checkResolution(specifiers) {
  const failures = [];

  for (const [specifier, importedBy] of specifiers) {
    let resolved;

    try {
      resolved = requireFromDist.resolve(specifier);
    } catch (error) {
      failures.push(
        `${specifier} (required by ${importedBy}) does not resolve at all: ${error.message}`,
      );
      continue;
    }

    if (!JS_EXTENSIONS.some((extension) => resolved.endsWith(extension))) {
      failures.push(
        `${specifier} (required by ${importedBy}) resolves to ${relative(BACKEND_DIR, resolved)}, ` +
          'which is not JavaScript. Node cannot load that from the Docker layout at all. Give ' +
          'the package a `build` script emitting CommonJS to dist/ and a `require` export ' +
          'condition pointing at it — packages/schema is the working template.',
      );
    }
  }

  return failures;
}

// Env validation runs eagerly inside `ConfigModule.forRoot`, so a bare
// `require` of the AppModule throws on a machine with no env long before any
// module format could go wrong. That is not what this guard measures: reaching
// env validation means every static require in the graph already resolved and
// executed. So only genuine module-load errors fail the run.
function describeLoadOutcome(error) {
  if (error === null) {
    return { ok: true, message: 'Built backend loads cleanly.' };
  }

  if (MODULE_LOAD_ERROR_CODES.has(error.code)) {
    return {
      ok: false,
      message: `The built backend cannot be loaded, so \`node dist/main.js\` would not boot:\n\n${
        error.stack ?? error.message
      }\n`,
    };
  }

  return {
    ok: true,
    message:
      'Built backend loads cleanly — every module in the graph resolved and ran, then ' +
      `application code raised ${error.name ?? error.constructor?.name ?? 'an error'}, which is ` +
      'as far as this guard goes (env and database are deliberately not provided).',
  };
}

if (!statSync(ENTRY_POINT, { throwIfNoEntry: false })?.isFile()) {
  report(
    false,
    `No build to check: ${relative(BACKEND_DIR, ENTRY_POINT)} is missing. ${BUILD_HINT}`,
  );
}

const resolutionFailures = checkResolution(collectWorkspaceSpecifiers(listJsFiles(DIST_DIR)));

if (resolutionFailures.length > 0) {
  report(
    false,
    `The built backend requires workspace packages Node cannot load:\n\n  - ${resolutionFailures.join(
      '\n  - ',
    )}\n`,
  );
}

// An error thrown while loading the AppModule graph does NOT reliably propagate
// to this try/catch — parts of the graph are linked through Node's
// `require(esm)` path, which surfaces the throw as an uncaught exception on a
// later tick instead. Hence the `uncaughtException` listener and the deferred
// verdict below: exiting at the end of this synchronous block would report a
// pass while the real failure was still queued.
process.once('uncaughtException', (error) => {
  const outcome = describeLoadOutcome(error);

  report(outcome.ok, outcome.message);
});

try {
  // Mirrors the first line of dist/main.js — the Nest decorators throughout the
  // module graph need the metadata polyfill installed before they evaluate.
  requireFromDist('reflect-metadata');
  requireFromDist(ENTRY_POINT);
} catch (error) {
  const outcome = describeLoadOutcome(error);

  report(outcome.ok, outcome.message);
}

setImmediate(() => {
  const outcome = describeLoadOutcome(null);

  report(outcome.ok, outcome.message);
});
