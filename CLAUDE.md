# CLAUDE

Follow the repository instructions in `AGENTS.md`.

## About This Repo

LL Stack is a full-stack TypeScript boilerplate: a pnpm + Turborepo monorepo
with a NestJS backend, a Next.js member-facing frontend, a Playwright E2E
workspace, and shared packages for config, logging, schemas, generated API
clients, UI, and utilities. It is a foundation to build products on, not a
product itself — when a task needs product intent (scope, phasing, whether a
feature should exist), ask the user. The backend ships the health module, the
platform infrastructure, and the auth/users/dashboard modules (signup, login,
sessions, and the example authenticated dashboard read) that the docs use as
worked examples.

## Codebase Context

Read `CONTEXT-MAP.md` only when you need to search or explore the codebase —
i.e. when the task does not name a specific file path or URL.

- A specific file path or URL is given: read it directly; do not read
  `CONTEXT-MAP.md` or any `CONTEXT.md` first.
- No path is given and you need to locate code: start at `CONTEXT-MAP.md`, then
  load the relevant `CONTEXT.md` files instead of reading source directly. If
  the map does not exist yet, fall back to the Repository Map in `AGENTS.md`.

See **Path Shortcuts** in `AGENTS.md` for terms (e.g. `be/`, `fe/`, `ui/`) that
resolve to known paths and count as directly-provided paths.

## Review Scope Exclusions

When reviewing PRs, ignore changed files under `apps/frontend/app/dev/**` and `docs/**` (reference documentation, not runnable code). Do not review the contents of generated code (e.g. `packages/services` client output produced by `pnpm gen:client`) — it is machine-generated from the backend OpenAPI contract, so line-by-line review of its implementation isn't meaningful; checking its shape or naming conventions (file/domain layout, exports, tag naming) is still fine and expected. Review changed files outside those paths normally. The rules inside `docs/agents/*.agents.md` still govern how you review code in other paths.

## Database Standards

Before touching `apps/backend/prisma/**` (schema or migrations) or any service that calls Prisma, read `docs/agents/database-standards.agents.md`. Schema work is not complete until `pnpm prisma:lint` and `pnpm verify` both pass.

## Backend Development

Before building, editing, or planning backend features in `apps/backend` — endpoints, modules, services, guards, DTOs, gating, throttling, config, or observability — read `docs/agents/backend.agents.md`. Keep controllers thin and services Prisma-owning, give every endpoint an explicit guard and throttle decision plus typed OpenAPI error responses, gate flagged capabilities through Gate A before Gate B, and regenerate clients (`pnpm gen:client`) on any contract change — the regenerated output may ship in the same PR as the contract change and any other backend/frontend work. Pure Prisma schema or migration work follows Database Standards instead. Backend work is not complete until `pnpm verify:backend` (or `pnpm verify`) passes.

## Frontend Development

Before building or changing anything in `apps/frontend` — UI, pages, server actions, gateways, forms, auth, logging, or env — read `docs/agents/frontend.agents.md`. Compose from `@repo/ui` primitives, place components by reuse scope (`@/components` for app-shared vs a route's `_components/` for page-specific), use Tailwind + `cn` with no inline styles, and flag any net-new `@repo/ui` primitive for separate review before using it. Wrap every server action in `actionWrapper` with a deliberate auth mode, call the backend only through the `lib/gateway/` layer, and re-validate input server-side with the strict zod action schema. Frontend work is not complete until `pnpm verify:frontend` passes.

## Feature Documentation

Before creating or restructuring anything under `docs/features/` — a feature epic, a `PLAN.md`/`PRD.md`/`TECH_SPEC.md`, numbered implementation steps, a feature's `follow-ups.md`, or anything in `.tasks/`, `.tech-debt/`, `.bugs/`, `.backlog/`, or `.archive/` — read `docs/agents/feature-docs.agents.md`. Every feature directory MUST contain a `PLAN.md` with a non-technical Executive Summary at the top followed by the technical detail, written to be consumed cold — self-contained enough to paste into a fresh agent window with no prior conversation context (real file paths, read-first docs, current state, constraints, acceptance criteria); steps are flat `NN-name.md` files (promoted to `NN-name/implementation.md` folders only when a step needs more than one doc); cross-cutting features split into `backend/`/`frontend/` tracks. A feature's _unplanned_ loose ends are captured later — once implementation is underway or done, never at planning time — in a co-located `follow-ups.md` (backend + frontend in one file), then resolved or triaged into `.tech-debt/`/`.bugs/`/`.tasks/` before archiving; critical or unrelated work becomes its own ticket (a new feature epic, or a `.tech-debt/`/`.bugs/`/`.backlog/` entry) instead. This is documentation-only work and does not require `pnpm verify`.

## Local Git Hooks

When committing, expect Husky to format staged `ts`, `tsx`, `js`, `mjs`, `cjs`,
`json`, `md`, and `css` files and re-stage them before the commit completes.
