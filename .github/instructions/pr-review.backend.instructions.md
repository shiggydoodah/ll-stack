---
applyTo: 'apps/backend/**/*.ts'
---

# PR Review Backend Rules (NestJS + Prisma)

Use these checks for backend changes in `apps/backend`.

## Review priority

Apply checks in this order to avoid overwhelm. Focus only on sections relevant to the changed files:

1. **Security** — Always review; merge-blocking issues
2. **API contracts** — Required for controller/DTO changes
3. **Database optimization** — Required when DB schema or queries change
4. **Performance and reliability** — High-impact changes
5. **Architecture, testing, validation** — Review as applicable

## Source of truth

- Read `apps/backend/CONTEXT.md` and the nearest nested `CONTEXT.md` before reviewing source.
- Review backend changes against `AGENTS.md`, `CONTEXT.md`, `apps/backend/CONTEXT.md`, `apps/backend/src/CONTEXT.md`, and `docs/charters/backend.md`. If one of these files is not populated, skip that file entirely and continue with the remaining sources.
- Treat OpenAPI as the definitive source of truth specifically for API contracts. Controllers and DTOs must align with Swagger decorators, and `packages/services` must consume the generated OpenAPI document without manual modification.

## Security (always review)

- Verify authentication and authorization on every changed access path.
- Verify global API-secret guard expectations. Only intentionally public endpoints should use `SkipApiSecret`, and each use must carry a justification comment. See `docs/agents/backend.agents.md` § "Auth and gating".
- Treat a diff touching `apps/backend/test/route-inventory.spec.ts` or its snapshot as a security review: the PR description must name which route changed classification and why.
- Reject cross-user/data-leak risks and privilege escalation paths.
- Require input validation via DTOs with `class-validator` and global whitelist/forbid-non-whitelisted behavior.
- Require safe Prisma query construction. Reject raw SQL or user-controlled query fragments unless there is a clear, parameterized, reviewed need.
- Check unsafe file handling, sensitive logging, and insecure defaults.
- Validate rate-limiting/throttling expectations for abuse-prone endpoints when applicable.
- Ensure error responses do not leak sensitive implementation details.
- Ensure request IDs, access tokens, session tokens, API secrets, and sensitive account data are not logged or returned unintentionally.

## API contracts and generated clients

- Require DTOs, response types, status codes, validation decorators, and Swagger decorators to match runtime behavior.
- Flag controller or DTO changes that require `pnpm gen:client` but do not update generated service output. The regenerated output is allowed in the same PR as the contract change — do not flag it for being inline. Tags listed in `IGNORED_TAGS` (`packages/services/scripts/domain-manifest.ts`) are the exception — contract changes confined to those tags need no client regeneration at all.
- Do not approve manual edits to generated service clients. The backend contract or generator config must be fixed instead.
- If a new OpenAPI tag/domain is added, check whether `packages/services/scripts/domain-manifest.ts` and `packages/services/package.json` exports need updates.
- Preserve backwards-compatible API behavior unless the PR intentionally changes a public contract and updates docs, tests, and generated clients.

## Performance and reliability

- Flag N+1 queries, repeated per-row queries in loops, and unbounded scans.
- Require pagination/limits for list/search endpoints and background jobs.
- Require data minimization: select only required fields/relations.
- Check index/constraint needs for new filters, joins, sorting, and uniqueness assumptions.
- Review transaction safety for multi-write flows; verify rollback/failure handling.
- Identify race-condition risk in read-then-write flows; recommend locking, atomic updates, or idempotency safeguards.
- Verify timeout/retry/backoff behavior for external dependencies and async workflows.
- Check that health, auth, and future module endpoints fail closed when configuration or dependencies are unavailable.

## Database optimization checks (required when DB is touched)

- Validate query shape and expected cardinality for hot paths.
- Check lock scope/duration and contention risks on writes.
- Confirm migrations are backward-compatible and safe for deploy order.
- Verify updates/deletes are properly scoped and protected from broad-impact mistakes.
- Require Prisma migrations for schema changes and regenerated Prisma client output when needed.
- Check enum/default/nullability changes for existing-data and deploy-order risk.

## Architecture and maintainability

- Keep controllers thin; business logic belongs in services.
- Favor shared guards/interceptors/filters over duplicated cross-cutting logic.
- Validate error-response consistency with current API conventions.
- Flag tight coupling that increases rollback risk or test fragility.
- Keep runtime configuration in validated config paths; do not introduce unvalidated environment reads.
- Keep feature modules focused and avoid broad unrelated refactors.
- Preserve strict TypeScript types. Do not accept `any`, broad casts, or weakened validation to satisfy compile errors.

## Backend testing expectations

- Require integration tests for authz-sensitive and DB-sensitive behavior.
- Require regression tests for bug fixes in service logic and query behavior.
- Require contract-aware tests when controllers, DTOs, Swagger output, guards, or error behavior changes.
- Call out missing material coverage as a review finding.

## Backend validation expectations

- Prefer targeted validation during review: `pnpm --filter @repo/backend lint`, `typecheck`, `test`, and `build`.
- For non-trivial backend changes, expect `pnpm verify` or a clearly justified targeted validation set.
- For API contract changes, expect `pnpm gen:client` and affected frontend/service checks when generated clients change.
