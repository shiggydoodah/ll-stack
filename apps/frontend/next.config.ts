import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Next 16.3.1's standalone trace copies only @swc/helpers' cjs/ files, but
  // the server's require-hook resolves the package's `esm/` export targets at
  // boot — so the pruned store ships without them and `node server.js` dies
  // with MODULE_NOT_FOUND on @swc/helpers/esm/_interop_require_default.js.
  // Force the whole package into the trace until the tracer catches up.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**'],
  },
  transpilePackages: ['@repo/ui', '@repo/services', '@repo/logging'],
  reactStrictMode: true,
  cacheComponents: true,
  typescript: {
    // `pnpm typecheck` (native tsc — run by verify and by frontend CI) is the
    // type gate for this app. next build's own pass re-checked the same files
    // with the ~5x-slower TS 6 JS compiler on every build, purely duplicating
    // that gate (docs/spikes/verify-performance-and-test-speed.md). Types are
    // still enforced — just not twice.
    ignoreBuildErrors: true,
  },
  experimental: {
    // Next 16.3 flipped `useTypeScriptCli` to default TRUE. In CLI mode the
    // TypeScript setup check requires `typescript/bin/tsc` to exist, and this
    // repo aliases `typescript` to @typescript/typescript6, whose only bin is
    // `tsc6` — the real `tsc` belongs to @typescript/native (see the TypeScript
    // note at the top of pnpm-workspace.yaml). Next therefore reports
    // TypeScript as missing and tries to `npm install` it mid-build, which then
    // fails on this workspace's `workspace:*` protocol. The API path resolves
    // typescript6's lib/typescript.js correctly, so pin back to it — this is
    // the mode 16.2 used by default, not a new workaround. Note the check runs
    // even with ignoreBuildErrors above, so it cannot be skipped that way.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
