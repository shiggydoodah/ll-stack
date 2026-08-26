# Context: packages/config

## Purpose

- `@repo/config` — the shared TypeScript and Prettier presets every workspace
  extends. No runtime code; it ships JSON and one `.cjs` file through explicit
  subpath exports.

## Architecture

| Export                            | File                          | For                                                                                 |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `@repo/config/tsconfig/base.json` | `tsconfig.base.json`          | Strict flags every preset inherits                                                  |
| `.../nestjs.json`                 | `tsconfig.nestjs.json`        | `apps/backend` — `module: node20`, decorators, sourcemaps, incremental              |
| `.../nextjs.json`                 | `tsconfig.nextjs.json`        | `apps/frontend` — ESNext + `bundler`, `jsx: preserve`, `noEmit`, the `next` plugin  |
| `.../package-build.json`          | `tsconfig.package-build.json` | Emit preset for plain packages (`schema`, `utils`, `logging`) — CommonJS to `dist/` |
| `.../react-library.json`          | `tsconfig.react-library.json` | React packages — `jsx: react-jsx`, `noEmit`                                         |
| `@repo/config/prettier.config`    | `prettier.config.cjs`         | 100 cols, single quotes, trailing commas, tailwind plugin                           |

`tsconfig.base.json` turns on `strict`, `strictNullChecks`,
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `isolatedModules`, and
`forceConsistentCasingInFileNames`.

## Key Flows

- A package's dev `tsconfig.json` extends the matching preset for the editor,
  vitest, and typecheck; a package that emits adds an array extends with
  `package-build.json` **last** so its `module`/`outDir` win:
  `"extends": ["./tsconfig.json", "@repo/config/tsconfig/package-build.json"]`.
- `${configDir}` in the build preset resolves to the _extending_ package's
  directory, so `rootDir`/`outDir` point at that package's `src`/`dist`.

## Gotchas

- `module: node20` replaces the removed node10 pair. It honours `exports` (so
  ESM-only dependencies work from CommonJS via `require(esm)`) but **preserves
  dynamic `import()`** instead of downlevelling it — which is why
  `apps/backend/jest.config.cjs` and `apps/backend/tsconfig.json` both carry
  CommonJS overrides for their TypeScript runners. Removing either breaks the
  backend suite or `pnpm dev`.
- `nodenext` is deliberately avoided (it floats with future TypeScript
  releases); `node16` would reject `require(esm)`.
- `package-build.json` sets `moduleResolution: node16` only because an inherited
  `"bundler"` is illegal with `module: node20` and cannot be un-inherited — it
  is a no-op, not a downgrade.
- The root `prettier.config.js` re-exports this preset; formatting rules are not
  duplicated.

## Agent Notes

- Prefer changing a preset over adding per-package compiler options.
- Any change here can move emit format for every consumer — run `pnpm verify`,
  which includes both backend boot smokes.
