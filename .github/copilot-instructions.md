# Copilot Review Instructions

Use this file as the quick-start policy for Copilot PR reviews.

## Codebase Context

Before exploring the codebase, read `CONTEXT-MAP.md` at the repo root. It maps each section to a `CONTEXT.md` file with abstractions, data flows, and integration points.
If required context files are missing, stale, or incomplete, continue with the best available information and flag the missing context as a `Major` finding when it materially limits review confidence.

## Review Scope Exclusions

- Ignore changed files under `apps/frontend/app/dev/**`. This route tree is local-only experimental and dev-test surface, so do not review, summarize, or comment on files that live there.
- Ignore changed files under `docs/**`. These are reference documentation, not runnable app code; do not review, summarize, or raise findings on them. The rules inside `docs/agents/*.agents.md` still govern how you review code in other paths.
- Do not review the contents of generated code (e.g. `packages/services` client output produced by `pnpm gen:client`). It is machine-generated from the backend OpenAPI contract, so a line-by-line review of its implementation is not meaningful; checking its shape or naming conventions (file/domain layout, exports, tag naming) is still fine.

If a PR also touches files outside those excluded paths, review those other paths normally. Do not mention `apps/frontend/app/dev/**`.

## Must-follow core rules

- In `.tsx` files, always use `const` arrow functions. Never use `function` declarations. Flag violations as a `Nit` finding.
- Use Tailwind v4 CSS variable shorthand: `bg-(--ui-background)` not `bg-[var(--ui-background)]`. Flag any use of `[var(--` in className strings as a `Minor` finding.
- Database changes (`apps/backend/prisma/**` or any Prisma-touching service) must follow `docs/agents/database-standards.agents.md`. Flag missing named PKs, `@db.Uuid`, `@db.Timestamptz(3)`, `@map`/`@@map`, explicit `onDelete`, or opaque polymorphic IDs as a `Major` finding.
- Backend changes (`apps/backend` endpoints, modules, services, guards, or DTOs) must follow `docs/agents/backend.agents.md`. Flag missing guard or throttle decisions, undocumented error statuses (including 429), Prisma reads without explicit `select` or `deletedAt` scoping, and contract changes without regenerated clients as a `Major` finding. Regenerated client output is allowed in the same PR as the contract change — do not flag it for being inline. Exception: contract changes confined to tags listed in `IGNORED_TAGS` (`packages/services/scripts/domain-manifest.ts`) need no client regeneration at all; do not flag those (see `docs/agents/backend.agents.md` § Client generation).
- Frontend UI changes (`apps/frontend` components, pages, or styling) must follow `docs/agents/frontend.agents.md`. Flag inline styles, hand-rolled equivalents of existing `@repo/ui` primitives, or a reusable component placed in a route's `_components/` instead of `@/components` as a `Minor` finding.
- When committing, expect Husky to format staged `ts`, `tsx`, `js`, `mjs`, `cjs`, `json`, `md`, and `css` files and re-stage them before the commit completes.
- Report findings first in this order: `Critical`, `Major`, `Minor`, `Nit`.
- Treat `Critical` findings as merge-blocking.
- Every finding must include:
  - File reference(s)
  - Evidence
  - Risk and impact
  - Concrete remediation
- If no material issues are found, explicitly say so and list residual risks/testing gaps.

## Canonical review instruction files

- `.github/instructions/pr-review.instructions.md` (shared/core)
- `.github/instructions/pr-review.backend.instructions.md` (NestJS + Prisma)
- `.github/instructions/pr-review.frontend.instructions.md` (Next.js App Router + React UI + API usage)
- `.github/instructions/pr-review.e2e.instructions.md` (Playwright E2E)
- `.github/instructions/pr-review.packages.instructions.md` (shared package contracts)
- `.github/instructions/pr-review.services.instructions.md` (generated OpenAPI service clients)
- `.github/instructions/pr-review.ui.instructions.md` (shared UI primitives and styles)
- `.github/instructions/pr-review.github-actions.instructions.md` (GitHub workflows, actions, and review automation)

## Charter references

- Root source of truth: `AGENTS.md`
- Repo context source of truth: `CONTEXT-MAP.md` and nearest `CONTEXT.md`
- Backend standards: `docs/charters/backend.md` (rationale) and `docs/agents/backend.agents.md` (rules).
- Frontend standards: `docs/charters/frontend.md` (rationale) and `docs/agents/frontend.agents.md` (rules).
- Testing standards: `docs/charters/testing.md`; skip this file entirely if it is not populated.
- Package standards: nearest package `CONTEXT.md` and matching package review instruction files.
- GitHub automation standards: `.github/instructions/pr-review.github-actions.instructions.md`.

Apply all relevant instruction files based on the changed paths in the PR.
When updating review policy, edit the instruction files above (not this wrapper) to avoid drift.
