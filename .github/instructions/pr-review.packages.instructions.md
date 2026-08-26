---
applyTo: 'packages/**/*.{ts,tsx,js,json,css}'
---

# PR Review Packages Rules

Use these checks for shared package changes under `packages`.

## Source of truth

- Read the nearest package `CONTEXT.md` before reviewing package source.
- Review package changes against `AGENTS.md`, `CONTEXT.md`, the package `CONTEXT.md`, and any package-local script or source context files. If one of these files is not populated, skip that file entirely and continue with the remaining sources.
- Apply more specific package instructions when they match, such as services or UI rules.

## Shared package contracts

- Treat package exports as public contracts for app workspaces.
- Verify `package.json` exports stay aligned with source files and intended import paths.
- Flag breaking export, type, runtime, or CSS contract changes unless the PR updates affected consumers and documents the change.
- Keep shared packages generic. Do not introduce app-specific business logic, route assumptions, secrets, or environment coupling into reusable packages.
- Preserve strict TypeScript behavior. Do not approve `any`, broad casts, weakened config, or looser lint/type rules.
- Do not introduce new major dependencies or framework coupling without explicit approval.

## Cross-workspace impact

- Check frontend, backend, and test workspace consumers when a package contract changes.
- Require updates to affected app imports, generated clients, docs, or tests when public exports change.
- Check tree-shaking and browser/server compatibility for code intended to be consumed by frontend apps.
- Avoid shared utilities that hide validation, authorization, session, or error-handling boundaries from app code.

## Package testing and validation

- Prefer package-local validation when available, such as `pnpm --filter @repo/services lint`, `typecheck`, and `test`, or `pnpm --filter @repo/ui lint` and `typecheck`. (`@repo/services` has no `build` script — it ships TypeScript source; `typecheck` is its compile gate.)
- If a package has no local validation script, expect the nearest meaningful root validation such as `pnpm lint`, `pnpm typecheck`, `pnpm build`, or `pnpm verify`.
- For non-trivial shared package changes, missing consumer validation is a review risk because failures can surface outside the changed package.
