// Lets ts-node resolve the `.js` specifiers that `module: node20` forces on us.
//
// The shared preset compiles with `"module": "node20"`, under which `tsc`
// *requires* an explicit `.js` extension on relative dynamic-import specifiers
// (TS2835). `apps/backend/tsconfig.json` pins ts-node back to CommonJS so those
// imports keep executing through ts-node's require hook, but the CommonJS
// resolver then looks for a `.js` file that does not exist on disk - the source
// is `.ts` - and throws MODULE_NOT_FOUND.
//
// ts-node ships `experimentalResolver` for exactly this, but it is broken: its
// vendored copy of Node's CJS loader calls `fileURLToPath()` on the result of
// `packageExportsResolve()`, which modern Node returns as an object rather than
// a URL, so any resolution that goes through a package `exports` map dies with
// `ERR_INVALID_ARG_TYPE`. Verified broken on both Node 22.22.3 (the CI and
// production runtime) and Node 24.15.0 (the current local toolchain); ts-node
// 10.9.2 has not shipped since 2023.
//
// So do the one thing that flag was meant to do, and nothing else: for relative
// specifiers ending in `.js`, try the extensionless form first and let ts-node's
// own (working) resolver map it to `.ts`. Anything that genuinely is a `.js`
// file on disk still resolves, because we fall through to the original.
//
// Scoped to this repo's own sources, because the hook is process-wide and a
// dependency's relative requires are none of our business. Inside `node_modules`
// this would not just extend resolution, it would change it: a `require('./x.js')`
// that is *meant* to throw MODULE_NOT_FOUND - an optional-feature probe, say -
// would instead fall back onto a neighbouring `./x.json` or `./x.ts` and load the
// wrong module, several layers down, for reasons nothing would trace back here.
//
// Load order matters. This must come *after* `-r ts-node/register` so that our
// wrapper is the outer one and delegates into ts-node's hook:
//
//     node -r ts-node/register -r ./scripts/ts-node-resolve-js-ext.cjs entry.ts
//
// If ts-node is ever replaced, delete this file. Note that `tsx` is not a
// candidate: it transpiles with esbuild, which does not implement
// `emitDecoratorMetadata`, so NestJS constructor injection fails at runtime
// ("Nest can't resolve dependencies of the X (?)").
const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
  if (
    typeof request === 'string' &&
    request.endsWith('.js') &&
    /^\.{1,2}\//.test(request) &&
    // A parentless require is the entry point - ours, so eligible.
    !parent?.filename?.includes('node_modules')
  ) {
    try {
      return originalResolveFilename.call(this, request.slice(0, -'.js'.length), parent, ...rest);
    } catch {
      // Fall through: a real `.js` file on disk, or a genuinely missing module.
    }
  }

  return originalResolveFilename.call(this, request, parent, ...rest);
};
