---
applyTo: 'packages/services/**/*.{ts,tsx,js,json}'
---

# PR Review Services Package Rules

Use these checks for generated service client and generator changes in `packages/services`.

## Source of truth

- Read `packages/services/CONTEXT.md` before reviewing services package changes.
- For generator changes, also read `packages/services/scripts/CONTEXT.md`.
- Treat backend controllers, DTOs, Swagger/OpenAPI metadata, and the services domain manifest as the source for generated clients.

## Generated client rules

- Do not approve manual edits to generated files under `packages/services/src`.
- If generated output changes, verify the source contract or generator input changed in the same PR or is clearly referenced. It is expected and fine for the regenerated output to land in the same PR as the backend contract change (and any frontend work consuming it) rather than a separate PR.
- Do not review the line-by-line contents of generated files under `packages/services/src` — it is machine output and a content review of it is not meaningful. Instead check its shape: does the right domain/tag output exist, does the manifest and exports line up, does the diff correspond to the contract change.
- For backend API contract changes, expect `pnpm gen:client` from the repo root and treat the generated output's existence and shape as contract evidence.
- Check that generated clients do not expose backend API secrets, access tokens, session tokens, or session internals to browser code.

## Domain manifest and exports

- Keep `packages/services/scripts/domain-manifest.ts`, generated domain directories, and `packages/services/package.json` exports aligned.
- When a new OpenAPI tag/domain is added, verify the manifest, generated output, package exports, and consuming app imports are updated together.
- When an OpenAPI tag/domain is removed or renamed, check for stale exports and broken frontend imports.
- Preserve stable typed imports for frontend apps, such as `@repo/services/auth` and other domain exports.

## Generator behavior

- Review OpenAPI input resolution, hashing, skip decisions, temp output handling, and per-domain splitting for deterministic behavior.
- Flag generator changes that can delete unrelated output, skip required regeneration, or produce unstable file layout.
- Require tests for generator logic that changes parsing, hashing, filtering, manifest handling, or output decisions.

## Services validation expectations

- Prefer `pnpm --filter @repo/services lint`, `typecheck`, and `test` for package-local validation. (The package has no `build` script — it ships TypeScript source; `typecheck` is its compile gate.)
- For backend contract changes that affect generated clients, expect backend validation plus affected frontend or service consumer validation.
