# LL Stack

[![CI](https://github.com/shiggydoodah/ll-stack/actions/workflows/ci.yml/badge.svg)](https://github.com/shiggydoodah/ll-stack/actions/workflows/ci.yml)

A production-minded full-stack TypeScript boilerplate: a pnpm-workspace monorepo powered by Turborepo, with a NestJS backend, a Next.js member-facing frontend, Postgres + Prisma, end-to-end typed API clients generated from OpenAPI, structured logging with OpenTelemetry, and Playwright E2E — plus the engineering charters and agent runbooks that keep it all consistent.

> **Status:** the platform foundation is in place — monorepo tooling, observability,
> database standards, generated clients, shared UI kit, and the full verify pipeline —
> and one vertical slice is built end to end on top of it: signup, login, cookie-backed
> sessions, and an authenticated dashboard read, wired through the frontend's server
> actions and the generated clients. That slice exists to be the worked example the
> charters and runbooks refer to. Email verification, password reset, and the rest of a
> real product are yours to build; the charters describe the shape they should take.

## What's in the box

- **Monorepo** — pnpm workspaces + Turborepo task graph, shared TypeScript config presets, one `pnpm verify` ladder for everything.
- **Backend** — NestJS 11 on Express, Prisma + PostgreSQL, class-validator DTOs, zod-validated env config, `@nestjs/throttler` rate limiting, Swagger/OpenAPI served at `/docs` in development (off elsewhere unless `OPENAPI_DOCS_ENABLED=true`, which puts it behind `ADMIN_API_KEY`).
- **Typed clients, generated** — the backend OpenAPI document is extracted and code-generated (via `@hey-api/openapi-ts`) into `packages/services`, so the frontend consumes a typed contract instead of hand-rolled fetch calls. A drift check fails the build when the contract and the committed client disagree.
- **Frontend** — Next.js (App Router) member-facing app, composed from the shared `@repo/ui` component library (Tailwind v4, token-driven theming, Radix-backed primitives).
- **Auth, as a worked example** — email/password signup and login, Argon2id hashing, cookie-backed sessions with a background prune, a `SessionGuard`-protected dashboard read, and the layout-based route guards on the frontend. Built to be read and copied, not to be a finished identity system.
- **Observability** — structured logging with `nestjs-pino`, shared redaction helpers in `@repo/logging`, OpenTelemetry traces and metrics, and a Seq log sink running in Docker for local log search.
- **Testing** — Jest unit + real-database integration tests on the backend, Vitest in the packages, and a Playwright E2E workspace.
- **CI** — GitHub Actions runs the same `pnpm verify` ladder you run locally, against a real Postgres service, plus the Playwright suite. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Docs-driven engineering** — charters (the _why_) and agent runbooks (the _rules_) covering backend, frontend, database, dependency, commit, and PR standards. See [How the docs work](#how-the-docs-work).

## Repo layout

| Path                | Stack                                           |
| ------------------- | ----------------------------------------------- |
| `apps/backend`      | NestJS, Prisma, PostgreSQL                      |
| `apps/frontend`     | Next.js (App Router), React — member-facing app |
| `apps/testing`      | Playwright E2E                                  |
| `packages/config`   | Shared TypeScript and Prettier configs          |
| `packages/logging`  | Shared logging sinks and redaction              |
| `packages/schema`   | Shared Zod schemas (email, password, tokens)    |
| `packages/services` | Generated OpenAPI service clients               |
| `packages/ui`       | Shared component library                        |
| `packages/utils`    | Dependency-light shared utilities               |

## Prerequisites

- Node >= 22
- pnpm >= 11 — use Corepack: `corepack enable && corepack prepare pnpm@11 --activate`
- Docker (used for Postgres and Seq)

## Quickstart

```bash
git clone <repo-url>
cd ll-stack
pnpm install          # install workspace dependencies
docker compose up -d  # Postgres + Seq
pnpm migrate          # apply Prisma migrations to the dev and test databases
pnpm dev              # backend :3100, frontend :4100
```

Copy each app's `.env.example` to `.env` if the app does not boot without one — the examples ship with safe dev placeholders. Generate real secrets (`openssl rand -base64 32`) before deploying anywhere.

| Service      | URL                        |
| ------------ | -------------------------- |
| Frontend     | http://localhost:4100      |
| Backend API  | http://localhost:3100      |
| Swagger docs | http://localhost:3100/docs |
| Seq (logs)   | http://localhost:8087      |

## Database

| Database       | Purpose                 | URL                                                          |
| -------------- | ----------------------- | ------------------------------------------------------------ |
| `llstack_dev`  | Local development       | `postgresql://postgres:postgres@localhost:5433/llstack_dev`  |
| `llstack_test` | Integration / E2E tests | `postgresql://postgres:postgres@localhost:5433/llstack_test` |

The dev DB is created automatically by Docker Compose; the test DB is created by the Postgres init script. Common flows:

```bash
# Create a migration after editing apps/backend/prisma/schema.prisma
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/llstack_dev \
  pnpm --filter @repo/backend prisma:migrate:dev -- --name describe_your_change

# Apply existing migrations to BOTH llstack_dev and llstack_test (fresh DB or after git pull)
pnpm migrate

# Regenerate the Prisma client only
pnpm --filter @repo/backend prisma:generate
```

Schema conventions — named UUID v7 primary keys, `@db.Timestamptz(3)` timestamps, explicit `onDelete` rules, soft-delete partial indexes — are enforced by `prisma-lint` and documented in [`docs/charters/database-standards.md`](docs/charters/database-standards.md).

## Verify ladder

Run `pnpm verify` before pushing — it is the single source of truth for "does this repo pass".

```bash
pnpm verify                  # prisma-lint + lint + build + boot smokes + typecheck + test
pnpm verify:backend          # backend-scoped ladder
pnpm verify:frontend         # frontend-scoped ladder
pnpm verify:ui               # UI package + its consumers
pnpm test:e2e                # Playwright E2E
pnpm gen:client              # regenerate OpenAPI service clients
```

### In CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and
every pull request. It stands up a Postgres 16 service on the same port
`docker-compose.yml` uses, copies each app's `.env.example` into place exactly as
`pnpm setup` does, applies the migrations, then runs `pnpm format:check` and the same
`pnpm verify` you run locally. A second job installs Chromium and runs `pnpm test:e2e`,
uploading the Playwright report as a build artifact.

There is no CI-only build path: if it passes on your machine it passes here, and a
`.env.example` that drifts out of the shape its env schema accepts fails the run.

## How the docs work

This repo treats engineering standards as first-class artifacts, split into two layers:

- [`docs/charters/`](docs/charters/) — the standards with their rationale, written for humans: backend architecture (layering, guard ladder, throttling, error contracts), frontend architecture (component tiers, the action → gateway → generated-client data path), database standards, dependency management, and commit/PR writing guides.
- [`docs/agents/`](docs/agents/) — the same standards distilled into rule-shaped runbooks (MUST / MUST NOT + checklists) for AI coding agents to enforce. When the two disagree, the charter wins.

[`AGENTS.md`](AGENTS.md) is the root instruction file for agents working in the repo: non-negotiables, repo navigation via `CONTEXT.md` map files, validation expectations, and pointers into the runbooks. [`CLAUDE.md`](CLAUDE.md) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md) mirror it for their respective tools, and [`.github/instructions/`](.github/instructions/) carries per-area PR-review instructions.

The result: humans and agents build against the same written standard, PR review is checklist-driven rather than vibe-driven, and the standards themselves are versioned and reviewable like code.

## License

[MIT](LICENSE) — © Louis Lombardi
