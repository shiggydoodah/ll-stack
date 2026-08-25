# Context: packages/services

## Purpose

- `@repo/services` — the typed backend clients generated from the backend's
  OpenAPI document, plus the generation pipeline that produces them and the
  drift check that keeps them honest.
- Server-side only. `apps/frontend` imports these **exclusively** through
  `apps/frontend/lib/gateway/*`.

## Architecture

- `src/<domain>/` — one directory per backend OpenAPI tag:
  - `generated/` — Hey API output. **Never hand-edit.** Carries a
    `.source-hash` used to skip unchanged regeneration.
  - `hey-api.ts` — the runtime config the generated client calls: `baseUrl` from
    `BACKEND_INTERNAL_URL`, `auth` from `BACKEND_API_SECRET`.
  - `index.ts` — re-exports the generated SDK, types, and schemas.
  - Current domains: `health`, `auth`, `users`, `dashboard`.
- `src/core/` — hand-written:
  - `service-result.ts` — `ServiceResult<T, E>` and `normalizeServiceResponse`,
    the discriminated result shape every gateway call returns (a missing
    response becomes a synthetic 503 "network error").
  - `client-env.ts` — `'server-only'`; `getBackendInternalUrl` /
    `getBackendApiSecret`, which throw a named error at import time when unset.
- `scripts/` — `gen-client.ts` (CLI), `gen-client-lib.ts` (pipeline),
  `domain-manifest.ts` (`DOMAIN_MANIFEST` + `IGNORED_TAGS`),
  `check-client-drift.ts`, `prompt-multiselect.ts`.
- `openapi-ts.config.ts` — Hey API config, driven per domain by
  `OPENAPI_SPEC_PATH` / `OPENAPI_OUTPUT_PATH` / `OPENAPI_RUNTIME_CONFIG_PATH`.
- Package exports: `./core`, `./health`, `./auth`, `./users`, `./dashboard`.
  There is deliberately **no build script** — the package ships TypeScript.

## Key Flows

**Generation (`pnpm gen:client`, optionally with domain names, `--list`,
`--dry-run`, `--force`):**

1. Resolve the spec from `OPENAPI_SPEC_PATH`, else `BACKEND_URL/docs-json`
   (default `http://localhost:3100/docs-json`), else by running the backend's
   `openapi:extract`.
2. Hash the canonicalised document + manifest + ignored tags.
3. Assert every OpenAPI tag is either in `DOMAIN_MANIFEST` or in `IGNORED_TAGS`.
4. Split by tag, prune unused `components.schemas`, generate each domain.
5. Skip domains whose `.source-hash` still matches unless `--force`.

**Drift check:** `pnpm --filter @repo/services check:drift` runs inside
`pnpm verify` and `pnpm verify:backend`; it fails when a backend contract change
shipped without regeneration.

## Integrations

- Upstream: `apps/backend` controllers + DTOs → `bootstrap/configure-app.ts`
  (tags, operation ids) → OpenAPI document.
- Downstream: `apps/frontend/lib/gateway/*` only.
- `@hey-api/client-next` — the generated clients are Next-aware, which is why
  gateway options accept things like `cache: 'no-store'`.

## Gotchas

- Generated output **is committed** and marked generated in `.gitattributes`.
  Review its shape and naming, not its implementation.
- A contract change MUST regenerate the affected client(s) **and commit the
  output**, and that output ships in the **same PR** as the contract change — no
  standalone generation-only PR. `--dry-run` (into a git-ignored
  `.temp/services-gen/`) is an optional smoke test, not a substitute for
  committing. `check:drift` in `pnpm verify`/`verify:backend` enforces this.
- A backend tag with no manifest entry and no `IGNORED_TAGS` entry **fails
  generation** by design — that is the prompt to make a decision, not a bug.
- `client-env.ts` throws at import time, not first call: the generated clients
  build at module scope, and an undefined `baseUrl` used to surface as a
  `USE_CACHE_TIMEOUT` during `next build` instead of a missing-variable error.
- `scripts/clean.sh --generated` deletes `health`, `auth`, `users` only — it has
  drifted from the manifest (`dashboard` is missing).

## Agent Notes

- New backend surface: add the `.addTag(...)` and operation ids in the backend,
  add a `DOMAIN_MANIFEST` entry here, run `pnpm gen:client`, then write the
  gateway wrapper in the frontend.
- Do not import frontend config into this package; env validation stays in each
  app's `config/env.schema.ts`.
- `README.md` in this directory is the fuller generation reference.
