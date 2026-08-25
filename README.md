# LL Stack

LL Stack is the boilerplate I reach for when I start something new. It is a TypeScript monorepo with a NestJS API, a Next.js frontend, Postgres, and — importantly — all the wiring between them already done: typed API clients generated from the backend's own OpenAPI contract, structured logging that correlates a browser click through to a database query, working cookie auth, and one command that tells you whether the whole repo still passes.

It is not a product. It is the floor you stand on before you build one.

Two ideas shape everything in here.

## Batteries included

Starting a project usually means a week of plumbing before you write a line of the thing you actually wanted to build. Auth, logging, error handling, env validation, a test harness, CI, a component library, the contract between frontend and backend. None of it is hard, all of it is fiddly, and you get it slightly wrong every time because you're in a hurry to get to the real work.

That week is already spent here. Clone it, run `pnpm setup`, and you have a running stack with signup, login, sessions, an authenticated page, a searchable log sink, a real database, end-to-end tests, and a green build. Day one is a feature, not a scaffold.

## Agent-first

Most repos treat AI coding agents as an afterthought: point one at your codebase and it reads fifty files to answer a question it should have answered from two, then invents a convention you'd have rejected in review.

This repo is built the other way round. The conventions are written down, the codebase is mapped so an agent can navigate it cheaply, and "done" is a command rather than an opinion:

- **`AGENTS.md`** is the root instruction file — non-negotiables, path shortcuts, reporting rules, and what counts as validation. [`CLAUDE.md`](CLAUDE.md) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md) point at the same rules so every tool gets the same answer.
- **`CONTEXT-MAP.md` plus a `CONTEXT.md` in every meaningful directory** act as a routing table. An agent reads the map, picks the smallest relevant area, and reads one short context file — instead of burning its window grepping through source. Each one covers purpose, architecture, key flows, integrations, and the local gotchas.
- **Standards are written twice, on purpose.** [`docs/charters/`](docs/charters/) explains the reasoning for humans. [`docs/agents/`](docs/agents/) restates the same standards as MUST / MUST NOT checklists an agent can actually follow. Where they disagree, the charter wins.
- **The rules are enforced by tooling, not by review.** ESLint blocks the things that would otherwise become review comments — Tailwind longhand, raw `PrismaClient` in feature code, `console.*` in the frontend, `function` declarations in `.tsx`. A drift check fails the build if the API contract changed without regenerating the clients.
- **`pnpm verify` is the machine-checkable definition of done.** An agent can run it, read the failure, and fix its own work before handing anything back. CI runs the exact same ladder, so there is nothing to argue about.
- **`.claude/settings.json` is committed and deliberately narrow** — reads inside the repo and this repo's own validation commands are pre-approved; writes, installs, network access, and git mutations still prompt. Reading real `.env` files is denied outright.

The side effect nobody warns you about: writing all this down for the agents made it much better for the humans too.

## Status

**Work in progress, and honestly so.** The platform is done and solid — monorepo tooling, observability, database standards, generated clients, the UI library, the verify ladder, CI. On top of that sits exactly one vertical slice built end to end: signup, login, cookie-backed sessions, and an authenticated dashboard read, wired all the way through server actions and generated clients.

That slice exists to be the worked example the docs point at, not to be a finished identity system. Email verification, password reset, roles, and everything a real product needs are yours to build. The charters describe the shape they should take.

Expect the odd rough edge and expect things to move.

## How it fits together

The single most useful thing to understand is the path a request takes, because every architectural decision in the repo falls out of it:

```
Browser
  │  never talks to the API directly
  ▼
Next.js frontend (:4100)
  │  proxy.ts — CSP nonce, correlation + session ids, guest/member redirects
  │  server action → actionWrapper — auth mode, logging, server-side zod re-validation
  ▼
lib/gateway/*
  │  the only place in the app allowed to call the backend
  │  imports @repo/services — clients generated from the API's OpenAPI document
  ▼
NestJS API (:3100)
  │  request id → rate limit → x-api-secret → route guard → validation pipe → handler
  ▼
Prisma → PostgreSQL (:5433)
```

Three rules hold that together, and everything else is detail:

1. **The backend is private.** Every route sits behind a shared `x-api-secret` header presented by the Next server. The browser has no route to it. The frontend is a BFF, not a proxy with extra steps.
2. **The contract is generated, never hand-written.** Controllers and DTOs produce an OpenAPI document, which generates the typed clients in `packages/services`. Change a response shape and the frontend stops compiling. That's the point.
3. **Every request carries the same ids.** A correlation id, request id, session id and trace id follow a click from the browser through the Next server, into the API, and onto every log line. One search in Seq gets you the whole story.

## What's in each area

### The monorepo

pnpm workspaces and Turborepo. Dependency versions are pinned centrally in a pnpm catalog, so package manifests mostly say `catalog:` rather than a version and there is one place to bump anything. Turbo's task graph builds workspace packages before their dependents and caches everything it can.

Supply-chain settings are deliberate: `blockExoticSubdeps`, a 2-day `minimumReleaseAge` on new versions, and an explicit allowlist of which packages may run install scripts.

Current versions: Node 22, TypeScript 6 (with the native Go compiler doing builds and typechecks — roughly 4.8× faster), NestJS 11, Next.js 16, React 19, Prisma 7, Tailwind v4, Zod 4.

### Backend — `apps/backend`

NestJS on Express, Prisma, PostgreSQL. Thin controllers, services that own Prisma access.

Every endpoint makes an explicit guard and throttle decision, and returns typed OpenAPI error responses. The request pipeline is a ladder: request-id middleware → global throttler (60 req/min per IP) → API secret guard → route guard → validation pipe → handler → trace-id interceptor. Errors land in one exception filter that emits a uniform `{ statusCode, error, message, path, timestamp, traceId }` envelope.

Environment variables are validated by a Zod schema that fails closed: the app refuses to boot in staging or production on a known dev secret, on a secret under 32 characters, or with more than one instance declared while rate limiting is still in-memory. Swagger is served at `/docs` in development and is off everywhere else unless you explicitly enable it, in which case it sits behind an admin key.

Auth is the worked example: argon2id password hashing, timing-equalised login, session tokens that are 32 random bytes shown once and stored only as a SHA-256 hash, and a background prune for expired sessions.

### Contract and generated clients — `packages/services`

The backend's OpenAPI document is extracted by booting the app in extraction mode (no database needed), then split by tag and code-generated with `@hey-api/openapi-ts` into one directory per domain — `health`, `auth`, `users`, `dashboard`.

The generated output is committed and never hand-edited. `pnpm gen:client` regenerates it, and a drift check inside `pnpm verify` fails the build when a contract change shipped without regeneration. Every call comes back as a `ServiceResult` discriminated union, so network failures and HTTP errors are values you have to handle rather than exceptions you forget to catch.

### Frontend — `apps/frontend`

Next.js App Router, Server Components by default, split into `(public)/(guest)` and `(members)` route groups.

The layering is strict and worth copying:

- **`proxy.ts`** mints the per-request CSP nonce and correlation ids, applies security headers, and fast-path redirects between guest and member routes.
- **Server actions** are always wrapped in `actionWrapper`, which takes a deliberate auth mode, handles logging, and re-validates input server-side with a strict Zod schema. Form validation on the client is a convenience; the server never trusts it.
- **`lib/gateway/`** is the only door to the backend. Nothing else may import `@repo/services`.
- Sessions use a `llstack_session` cookie plus a separate HMAC binding token in a `__Host-` cookie. Logout is a GET route handler so any redirect can trigger it, and it always clears every cookie even if revocation fails.

### UI library — `packages/ui`

A standalone component library ported in from a published package: around thirty primitives (button, input, select, table, typography, layout) and twenty composed components (dialog, drawer, toast, file upload, password strength meter, avatar crop), built on Radix where Radix earns its place, plus TanStack Form and Table wrappers.

Styling is Tailwind v4 driven entirely by a `--ui-*` CSS variable token contract. Themes are generated from a `theme.json` by a script, so a new theme is a config file rather than a stylesheet rewrite. Two ship: `default` and `eightbit`.

`COMPONENTS.md` is the catalog — it exists so an agent picks an existing component instead of writing a fourth button.

### Shared packages

- **`@repo/config`** — shared TypeScript presets and the Prettier config.
- **`@repo/logging`** — logging sinks (stdout, Seq, OTLP over HTTP), field-name redaction, and level defaults. Has a browser-safe entry point alongside the Node one.
- **`@repo/schema`** — Zod primitives (email, name, password, token) that both tiers validate against, so the frontend and the API agree on what a valid password is.
- **`@repo/utils`** — dependency-light string and date helpers.

### Observability

Structured logging via `nestjs-pino` on the backend and a matching server/browser logger pair on the frontend, all writing through `@repo/logging`. Browser logs post to `/api/client-logs` and join the same sink. OpenTelemetry traces and metrics are wired up and off by default.

Locally, Docker runs [Seq](https://datalust.co/seq) so you can search logs by correlation id and watch a request cross all three tiers.

### Testing

- **Backend** — Jest, with real-database integration tests against per-worker databases, plus a route-inventory pin that fails if an endpoint appears without anyone noticing.
- **Packages and frontend** — Vitest.
- **End to end** — a Playwright workspace (`apps/testing`) that boots the _real_ backend and frontend against the test database with explicitly injected env, so your local `.env` can't desync the suite from the stack it's testing.
- **Boot smokes** — two guards that catch what `tsc` can't: one proves the compiled `dist/` actually loads in Node, the other proves the ts-node dev pipeline resolves.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every pull request. One job stands up Postgres, copies the committed `.env.example` files into place exactly as `pnpm setup` does, migrates, then runs `pnpm format:check` and `pnpm verify`. A second job installs Chromium and runs the Playwright suite, uploading the report as an artifact.

There is no CI-only build path. CI runs no command you can't run locally, so a red build means the local run got skipped — not that CI is different.

## Getting started

You need Node 22+, pnpm 11+ (`corepack enable && corepack prepare pnpm@11 --activate`), and Docker.

```bash
git clone git@github.com:shiggydoodah/ll-stack.git
cd ll-stack
pnpm setup
pnpm dev
```

`pnpm setup` does the whole first run: installs dependencies, copies both `.env.example` files into `.env`, starts Postgres and Seq in Docker, applies migrations to the dev and test databases, generates the Prisma client, generates the service clients, and seeds. It is idempotent, so re-running it is safe.

`pnpm dev` starts everything:

| Service      | URL                                               |
| ------------ | ------------------------------------------------- |
| Frontend     | [localhost:4100](http://localhost:4100)           |
| API          | [localhost:3100](http://localhost:3100)           |
| Swagger docs | [localhost:3100/docs](http://localhost:3100/docs) |
| Seq (logs)   | [localhost:8087](http://localhost:8087)           |

Create an account at `/create-account` and you'll land on the dashboard. Then open Seq and search for the correlation id — that's the tour.

**A note on Postgres:** it runs on port **5433**, not 5432, so it won't fight an existing local Postgres. If setup can't reach Docker it falls back to whatever `DATABASE_URL` in `apps/backend/.env` points at.

**A note on secrets:** the committed `.env.example` files hold shared local dev placeholders, and they must stay byte-identical across the backend, frontend, and test env files or every API call 401s. The backend refuses to boot on those values outside development. Generate real ones with `openssl rand -base64 32` before deploying anywhere.

## Commands

### Day to day

```bash
pnpm setup                 # first-run setup — install, env files, Docker, migrate, generate, seed
pnpm dev                   # run backend and frontend together
pnpm build                 # build everything
pnpm lint                  # lint everything
pnpm typecheck             # typecheck everything
pnpm format                # Prettier write
pnpm format:check          # Prettier check (CI runs this)
```

### Validation

`pnpm verify` is the single source of truth for "does this repo pass". Run it before you push. It runs prisma-lint → lint → build → boot smokes → client drift check → typecheck → tests, in that order — the cheap checks fail first, and the boot smokes need the build that runs just before them.

```bash
pnpm verify                # the full ladder
pnpm verify:backend        # backend-scoped ladder (includes the drift check)
pnpm verify:frontend       # frontend-scoped ladder
pnpm verify:ui             # UI package plus its consumers
```

On a weaker machine, `TURBO_CONCURRENCY=2 pnpm verify` keeps the ceiling low.

### Tests

```bash
pnpm test                  # all unit and integration tests
pnpm test:backend          # Jest — backend only
pnpm test:frontend         # Vitest — frontend only
pnpm test:ui               # Vitest — UI package only
pnpm test:e2e              # Playwright
pnpm test:e2e:ui           # Playwright in UI mode
```

### API contract

```bash
pnpm gen:client                          # regenerate the typed clients from the OpenAPI doc
pnpm gen:client auth users               # regenerate specific domains
pnpm gen:client --list                   # pick domains from an interactive list
pnpm gen:client --dry-run users          # generate into a scratch dir without touching src/
pnpm gen:client --force                  # regenerate even when the source hash is unchanged
pnpm --filter @repo/backend openapi:extract   # write the OpenAPI document to disk
pnpm bruno:run                           # run the Bruno request collection against local
```

### Database

```bash
pnpm migrate                                    # apply migrations to BOTH dev and test databases
pnpm --filter @repo/backend prisma:generate     # regenerate the Prisma client
pnpm --filter @repo/backend prisma:lint         # schema conventions check
pnpm --filter @repo/backend seed                # seed development data
pnpm --filter @repo/backend db:reset            # drop, re-migrate and re-seed the dev database

# create a migration after editing apps/backend/prisma/schema.prisma
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/llstack_dev \
  pnpm --filter @repo/backend prisma:migrate:dev -- --name describe_your_change
```

| Database       | Purpose             | Connection string                                            |
| -------------- | ------------------- | ------------------------------------------------------------ |
| `llstack_dev`  | Local development   | `postgresql://postgres:postgres@localhost:5433/llstack_dev`  |
| `llstack_test` | Integration and E2E | `postgresql://postgres:postgres@localhost:5433/llstack_test` |

Docker Compose creates the dev database; an init script creates the test one on first boot. Schema conventions — named UUID v7 primary keys, `@db.Timestamptz(3)` timestamps, explicit `onDelete` rules, soft-delete partial indexes — are enforced by `prisma-lint` and explained in [`docs/charters/database-standards.md`](docs/charters/database-standards.md).

### Cleaning up

```bash
pnpm clean                 # build output and caches
pnpm clean:turbo           # Turbo cache only
pnpm clean:gen             # generated output only
pnpm clean:seq             # wipe the local Seq log store
```

### Targeted work

Anything can be scoped to one workspace:

```bash
pnpm --filter @repo/backend test
pnpm --filter @repo/frontend typecheck
pnpm --filter @repo/ui themes:build
```

## Repo layout

| Path                | What it is                                 |
| ------------------- | ------------------------------------------ |
| `apps/backend`      | NestJS API, Prisma, PostgreSQL             |
| `apps/frontend`     | Next.js App Router app and BFF             |
| `apps/testing`      | Playwright end-to-end workspace            |
| `packages/config`   | Shared TypeScript and Prettier configs     |
| `packages/logging`  | Logging sinks and redaction                |
| `packages/schema`   | Shared Zod primitives                      |
| `packages/services` | Generated OpenAPI clients                  |
| `packages/ui`       | Component library, tokens, themes          |
| `packages/utils`    | Dependency-light helpers                   |
| `docs/charters`     | Standards, with the reasoning              |
| `docs/agents`       | The same standards as agent runbooks       |
| `scripts`           | Setup, cleaning, formatting, Postgres init |
| `bruno`             | Hand-driven API request collection         |

## Git hooks

Husky is installed by `pnpm install`. Pre-commit formats and re-stages your staged files. Pre-push blocks direct pushes to `main` unless every changed path is under `docs/`.

## License

[MIT](LICENSE) — © Louis Lombardi
