# AGENTS.md

This file defines how agents should work in this repo.

Keep root instructions short. Use this file for non-negotiables, workflow rules, repo navigation, and validation expectations. Put deeper standards in `docs/`, local `CONTEXT.md` files, and package-level documentation.

---

## About This Repo

LL Stack is a full-stack TypeScript boilerplate: a pnpm + Turborepo monorepo with a NestJS backend, a Next.js member-facing frontend, a Playwright E2E workspace, and shared packages for config, logging, schemas, generated API clients, UI, and utilities. It is a foundation to build products on, not a product itself — there is no roadmap document to consult for scope decisions; ask the user when product intent matters.

The backend ships the health module, the platform infrastructure (Prisma, OpenAPI extraction, structured logging, OpenTelemetry, throttling, env validation), and the auth/users/dashboard modules (signup, login, sessions, and the example authenticated dashboard read) that the docs use as worked examples.

---

## Codebase Context

Read `CONTEXT-MAP.md` only when you need to search or explore the codebase —
i.e. when the task does not name a specific file path or URL to work on.

- **A specific file path or URL is given:** read that file directly. Do not read
  `CONTEXT-MAP.md` or any `CONTEXT.md` first.
- **A path shortcut is used (see Path Shortcuts):** resolve it to its target path
  and treat it as a directly-provided path — go straight there.
- **No path is given and you need to locate or understand code:** start at
  `CONTEXT-MAP.md`. It maps each section to a `CONTEXT.md` file with
  abstractions, data flows, and integration points; load the relevant
  `CONTEXT.md` files instead of reading source files directly. You may explore
  further when needed, but begin at the map. If the map does not exist yet,
  fall back to the Repository Map below.

---

## Non-Negotiables

These rules override other local preferences unless the user explicitly says otherwise.

- Do not use `any`.
- Do not manually edit generated code.
- Do not introduce new major libraries, frameworks, ORMs, queues, auth providers, or storage providers without approval.
- Do not bypass validation, authorization, or error handling to make code pass quickly.
- Do not weaken types, tests, lint rules, or security rules to complete a task.
- Do not make broad unrelated refactors during feature work.
- Do not change public API contracts without updating DTOs, Swagger/OpenAPI metadata, and relevant docs; regenerate the `packages/services` clients with `pnpm gen:client` (see `docs/agents/backend.agents.md`) — the regenerated output may ship in the same PR as the contract change and any other backend/frontend work.
- Run the relevant available validation checks before reporting non-trivial work as complete, unless the change is documentation/reference-only.

---

## Review Scope Exceptions

- Review agents must ignore changed files under `apps/frontend/app/dev/**`. This route tree is local-only experimental and dev-test surface; do not review, summarize, comment on, or request production hardening, strict coding standards, UI polish, test coverage, validation, local architecture, or development-only implementation fixes for files that live there.
- Review agents must ignore changed files under `docs/**`. These are human- and agent-facing reference documentation, not runnable app code; do not review, summarize, or raise findings on them. The rules _inside_ `docs/agents/*.agents.md` still govern how code in other paths is reviewed.
- Review agents must not review the contents of generated code (e.g. `packages/services` client output produced by `pnpm gen:client`) — it is machine-generated from the backend OpenAPI contract, so a line-by-line review of its implementation is not meaningful. Checking its shape or naming conventions (file/domain layout, exports, tag naming per `packages/services/CONTEXT.md`) is fine and still expected.
- Still review any change outside `apps/frontend/app/dev/**`, `docs/**`, and the generated-code contents excluded above, including shared packages, root tooling, dependencies, CI, secrets, public API contracts, or production runtime behaviour.

---

## Reporting

After each meaningful implementation step, briefly report:

- what changed and why
- validation run and result
- any risks or follow-up work needed

---

## Dependency Updates

Only when asked to update npm dependencies, read `docs/agents/dependency-management.agents.md` before selecting, installing, or committing dependency changes. Do not auto-read that file for unrelated tasks.

## Database Standards

Before touching `apps/backend/prisma/**` (schema or migrations) or any service that calls Prisma, read `docs/agents/database-standards.agents.md`. Schema work is not complete until `pnpm prisma:lint` and `pnpm verify` both pass.

## Backend Development

Before building, editing, or planning backend features in `apps/backend` — endpoints, modules, services, guards, DTOs, gating, throttling, config, or observability — read `docs/agents/backend.agents.md`. Keep controllers thin and services Prisma-owning, give every endpoint an explicit guard and throttle decision plus typed OpenAPI error responses, gate flagged capabilities through Gate A before Gate B, and regenerate clients (`pnpm gen:client`) on any contract change — the regenerated output may ship in the same PR as the contract change and any other backend/frontend work. Pure Prisma schema or migration work follows Database Standards instead. Backend work is not complete until `pnpm verify:backend` (or `pnpm verify`) passes.

## Frontend UI

Before building or changing UI in `apps/frontend` — components, pages, or styling — read `docs/agents/frontend.agents.md`. Compose from `@repo/ui` primitives, place components by reuse scope (`@/components` for app-shared vs a route's `_components/` for page-specific), use Tailwind + `cn` with no inline styles, and flag any net-new `@repo/ui` primitive for separate review before using it. Frontend UI work is not complete until `pnpm verify:frontend` passes.

## Feature Documentation

Before creating or restructuring anything under `docs/features/` — a feature epic, a `PLAN.md`/`PRD.md`/`TECH_SPEC.md`, numbered implementation steps, a feature's `follow-ups.md`, or anything in `.tasks/`, `.tech-debt/`, `.bugs/`, `.backlog/`, or `.archive/` — read `docs/agents/feature-docs.agents.md`. Every feature directory MUST contain a `PLAN.md` (non-technical Executive Summary at the top, then technical detail), written to be consumed cold — self-contained enough to paste into a fresh agent window with no prior conversation context (real file paths, read-first docs, current state, constraints, acceptance criteria); steps are flat `NN-name.md` files, promoted to `NN-name/implementation.md` folders only when a step needs more than one doc, and cross-cutting features split into `backend/`/`frontend/` tracks. A feature's _unplanned_ loose ends are captured later — once implementation is underway or done, never at planning time — in a co-located `follow-ups.md` (backend + frontend in one file), then resolved or triaged into `.tech-debt/`/`.bugs/`/`.tasks/` before archiving; critical or unrelated work becomes its own ticket (a new feature epic, or a `.tech-debt/`/`.bugs/`/`.backlog/` entry) instead. This is documentation-only work — no `pnpm verify` required.

## Local Git Hooks

- When committing, expect Husky to format staged `ts`, `tsx`, `js`, `mjs`, `cjs`, `json`, `md`, and `css` files and re-stage them before the commit completes.

---

## Context Map Files

This repo uses `CONTEXT.md` files as lightweight maps for apps, packages, modules, and important directories.

When you need to locate or understand code you have not been pointed to, agents must:

1. Look for the nearest relevant `CONTEXT.md`.
2. Read parent context files when useful.
3. Use those files to identify ownership, entry points, dependencies, contracts, local conventions, and validation commands.

When the user provides a specific file path, URL, or a path shortcut, work from that path directly. You may still read the nearest `CONTEXT.md` for local context, but do not start from `CONTEXT-MAP.md`.

Agents should not scan broad directories when a relevant `CONTEXT.md` exists unless more detail is needed.

Typical locations:

```txt
apps/backend/src/CONTEXT.md
apps/frontend/CONTEXT.md
packages/services/CONTEXT.md
docs/CONTEXT.md
docs/charters/CONTEXT.md
```

Rules:

- `CONTEXT.md` files are maps, not long manuals.
- Keep them short and practical.
- Update them when folder structure, ownership, contracts, or important conventions change.
- Prefer links to deeper docs instead of repeating large explanations.
- Do not duplicate generic repo rules from `AGENTS.md`.
- If a task touches `packages/ui` alongside frontend work, use the frontend context — shared UI context is included there.
- If a task requires changes outside the current app or package, identify all affected areas and load each relevant `CONTEXT.md` before proceeding.

---

## Repository Map

Use this map to find the correct area before making changes. For deeper context, read the nearest `CONTEXT.md`.

```txt
apps/
  backend/          # NestJS private backend API, Prisma, Swagger/OpenAPI
  frontend/         # Next.js (App Router) member-facing app
  testing/          # Playwright E2E tests and test utilities

packages/
  config/        # Shared TypeScript and tool config presets
  logging/       # Shared logging sinks and redaction helpers
  schema/        # Shared Zod schema primitives
  services/      # Generated Hey OpenAPI clients and service exports
  ui/            # Shared UI primitives, styles, and theme helpers
  utils/         # Dependency-light shared TypeScript utilities

docs/
  charters/      # Engineering standards by area (rationale)
  agents/        # Agent enforcement runbooks for the charters
  templates/     # Reusable prompt templates
  features/      # Per-feature epics: PLAN/PRD/TECH_SPEC + numbered steps (created as you build)

scripts/         # Repo maintenance scripts
.github/         # CI workflows, PR templates, and review instructions
```

Rules:

- Start with this repo map before scanning the codebase.
- Read the nearest relevant `CONTEXT.md` before modifying code in an app, package, or module.
- Do not manually edit generated files in `packages/services`.

---

## Path Shortcuts

When the user refers to an area using any of these terms, treat it as a
directly-provided path: go straight to that path and skip the `CONTEXT-MAP.md`
scan. You may still read that area's nearest `CONTEXT.md` for local context, and
may explore beyond the path when the task requires it.

| When the user says                | Resolve to                    |
| --------------------------------- | ----------------------------- |
| `backend`, `backend/`, `be/`      | `./apps/backend`              |
| `frontend`, `frontend/`, `fe/`    | `./apps/frontend`             |
| `ui library`, `ui package`, `ui/` | `./packages/ui`               |
| `services/`, `service layer`      | `./packages/services`         |
| `gateway/`, `gateway layer`       | `./apps/frontend/lib/gateway` |
| `docs`, `docs/`                   | `./docs`                      |
| `feature doc`                     | `./docs/features/`            |

---

## Do Not Auto-Read

Do not read the following paths unless the user explicitly asks you to:

- `.temp/` — personal temporary storage; may be incomplete, unpolished, or unrelated to current work
- `docs/features/.backlog/` — parked briefs; not current scope unless the task names one

---

## General Code Quality Rules

All code must be production-aware, maintainable, and easy to review & read.

### TypeScript

- Use strict TypeScript.
- Prefer explicit types at public boundaries.
- Prefer narrow types and generated API types over broad or manual ones.
- Do not hide type problems with broad casts.

### Architecture

- Keep public contracts stable and explicit.
- Prefer small, composable functions over large procedural blocks.
- Avoid unnecessary abstraction.
- Per-app structural patterns — module shape, layering, component boundaries — are defined in the relevant `CONTEXT.md`.

### React / JSX

- In `.tsx` files, always use `const` arrow functions. Never use `function` declarations.
- Function declarations are permitted in `.ts` utility files.

### Tailwind

- Use Tailwind v4 CSS variable shorthand: `bg-(--ui-background)`, `text-(--ui-foreground)`, `border-(--ui-border)`. Never write `bg-[var(--ui-background)]` — ESLint flags it as an error.

---

## Validation

The repo provides a `pnpm verify` command as the default full validation check.

Agents may run targeted checks during implementation for faster feedback, but after non-trivial changes they must run `pnpm verify` unless the change is documentation/reference-only.

`.github/workflows/ci.yml` runs the same ladder (plus `pnpm format:check` and `pnpm test:e2e`) on every push to `main` and every pull request. It is a backstop, not a substitute: CI runs no command you cannot run locally, so a red build means the local run was skipped, not that CI is different.

Available root commands:

```bash
pnpm verify
pnpm verify:backend
pnpm verify:frontend
pnpm verify:ui
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm format:check
pnpm gen:client
```

Useful targeted examples:

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/backend typecheck
pnpm --filter @repo/backend build
pnpm --filter @repo/frontend test
pnpm --filter @repo/frontend typecheck
pnpm --filter @repo/frontend build
pnpm --filter @repo/services test
pnpm --filter @repo/services typecheck
pnpm --filter @repo/testing test:e2e
```

### When validation is required

Run relevant available validation after changes to:

- application code
- package code
- tests
- configuration
- dependencies
- generated services
- API contracts
- database schema or migrations
- CI/build tooling
- scripts that affect the app or developer workflow

Run `pnpm verify` after non-trivial changes unless the change is documentation/reference-only.

### When validation may be skipped

Validation may be skipped only when all changes are limited to:

- `.md` files
- `.txt` files
- documentation-only content

If any changed file outside these documentation-only areas affects the runnable app, packages, tests, tooling, or generated output, run relevant validation.

### Reporting

When reporting back, agents must include:

- what validation was run
- pass/fail result
- if skipped, the exact reason it was skipped
- any failures and whether they are related to the task

Do not claim a task is complete if required validation was not run.

If validation cannot be run, explain why and list the highest-confidence targeted checks that were run instead.

---

## Cross-Agent Instruction Consistency

When updating agent instructions, keep AGENTS.md, CLAUDE.md, and .github/copilot-instructions.md in sync.
