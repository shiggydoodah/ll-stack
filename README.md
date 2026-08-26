# LL Stack

The boilerplate I reach for when I start something new. pnpm workspaces, Turborepo and TypeScript underneath; a NestJS API, a Next.js frontend and Postgres on top.

Batteries included — the wiring between them is already done: typed clients generated from the API's own OpenAPI document, logging that follows a browser click through to the query it caused, working cookie auth, and one command that tells you whether the repo still passes.

It's a starting point, not a product.

## Quick start

You need Node 24 (the repo pins it), pnpm 11+ (`corepack enable && corepack prepare pnpm@11 --activate`) and Docker.

Press **Use this template → Create a new repository**, then clone what it gives you:

```bash
git clone git@github.com:YOUR-USER/YOUR-REPO.git
cd YOUR-REPO
pnpm setup
pnpm dev
```

`pnpm setup` handles the whole first run — installs, copies both `.env.example` files into `.env`, starts Postgres and Seq in Docker, migrates dev and test databases, generates the Prisma and service clients, seeds. It's idempotent, so re-run it whenever.

| Service    | URL                                               |
| ---------- | ------------------------------------------------- |
| Frontend   | [localhost:4100](http://localhost:4100)           |
| API        | [localhost:3100](http://localhost:3100)           |
| Swagger    | [localhost:3100/docs](http://localhost:3100/docs) |
| Seq (logs) | [localhost:8087](http://localhost:8087)           |

Create an account at `/create-account` and you'll land on the dashboard. Open Seq, search for the correlation id, and you can watch that signup cross all three tiers. Seq is only the default here — the logging package sinks to stdout or OTLP just as happily.

Two gotchas worth knowing up front. Postgres runs on **5433** so it won't fight an existing local install; if setup can't reach Docker it falls back to whatever `DATABASE_URL` points at. And the committed `.env.example` values are shared dev placeholders that must stay byte-identical across the backend, frontend and test env files, or every API call 401s. The backend refuses to boot on them outside development. Generate real ones with `openssl rand -base64 32`.

If you just want a look around, clone this repo directly rather than templating it.

## Why it exists

**The plumbing is already done.** Auth, logging, error handling, env validation, a test harness, CI, a component library, the contract between frontend and backend. None of it is hard, all of it is fiddly, and I was getting it slightly wrong every time because I was in a hurry to reach the actual work. Here it's in place from the first commit — signup, login, sessions, an authenticated page, a searchable log sink, a real database, end-to-end tests and a green build — so you can start on the thing you actually wanted to build.

**It's set up for coding agents, not just tolerant of them.** Point an agent at a normal repo and it reads fifty files to answer something two would have covered, then invents a convention you'd have rejected in review. So:

- **`AGENTS.md`** is the root instruction file — non-negotiables, path shortcuts, reporting rules, what counts as validation. [`CLAUDE.md`](CLAUDE.md) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md) point at the same rules, so every tool gives the same answer.
- **`CONTEXT-MAP.md` plus a `CONTEXT.md` in every meaningful directory** act as a routing table. Read the map, pick the smallest relevant area, read one short file covering purpose, architecture, key flows and local gotchas.
- **Standards are written twice, deliberately.** [`docs/charters/`](docs/charters) carries the reasoning for humans; [`docs/agents/`](docs/agents) restates the same rules as MUST / MUST NOT checklists. Where they disagree, the charter wins.
- **Tooling enforces the rules, not review.** ESLint blocks Tailwind longhand, raw `PrismaClient` in feature code, `console.*` on the frontend, `function` declarations in `.tsx`. A drift check fails the build if the API contract changed without the clients being regenerated.
- **`pnpm verify` is the definition of done**, and it's machine-checkable. An agent runs it, reads the failure, fixes its own work. CI runs the identical ladder.
- **`.claude/settings.json` is committed and narrow.** Repo reads and this repo's validation commands are pre-approved. Writes, installs, network access and git mutations still prompt. Reading real `.env` files is denied outright.

Writing all of that down for the agents turned out to make the repo considerably easier for people too.

## Status

Work in progress, and honestly so. The platform underneath is done and solid — monorepo tooling, observability, database standards, generated clients, the UI library, the verify ladder, CI. Sitting on top of it is exactly one vertical slice built end to end: signup, login, cookie-backed sessions, an authenticated dashboard read, and an account page that lists your live sign-ins and ends the ones that aren't this one — wired through server actions and generated clients.

That slice is there to be the worked example the docs point at. It isn't a finished identity system — email verification, password reset and roles are yours to build, and the charters describe the shape they should take. Expect the odd rough edge, and expect things to move.

## How a request flows

Most of the architecture falls out of this one path:

```
Browser
  │  never talks to the API directly
  ▼
Next.js frontend (:4100)
  │  proxy.ts — CSP nonce, correlation + session ids, guest/member redirects
  │  server action → actionWrapper — auth mode, logging, server-side zod re-validation
  ▼
lib/gateway/*
  │  the only place allowed to call the backend
  │  imports @repo/services — clients generated from the API's OpenAPI document
  ▼
NestJS API (:3100)
  │  request id → rate limit → x-api-secret → route guard → validation pipe → handler
  ▼
Prisma → PostgreSQL (:5433)
```

Three rules hold it together:

1. **The backend is private.** Every route sits behind a shared `x-api-secret` header presented by the Next server, and the browser has no route to it. The frontend is a BFF.
2. **The contract is generated, never hand-written.** Controllers and DTOs produce the OpenAPI document, which generates the typed clients in `packages/services`. Change a response shape and the frontend stops compiling.
3. **Every request carries the same ids.** Correlation, request, session and trace ids travel from the browser through the Next server into the API and onto every log line, so one Seq search gets you the whole story.

## What's in it

**The monorepo** — pnpm workspaces and Turborepo. Versions are pinned centrally in a pnpm catalog, so manifests mostly say `catalog:` and there's one place to bump anything. Supply-chain settings are deliberate: `blockExoticSubdeps`, a 2-day `minimumReleaseAge`, and an allowlist for install scripts. Currently Node 24, TypeScript 6 and 7 side by side (7's native Go compiler owns `tsc`, so builds and typechecks run roughly 4.8× faster; 6 stays for the JS compiler API that ts-jest, ts-node, typescript-eslint and Next still require), NestJS 11, Next.js 16, React 19, Prisma 7, Tailwind v4, Zod 4.

**Backend (`apps/backend`)** — NestJS on Express with thin controllers and services that own Prisma access. Every endpoint makes an explicit guard and throttle decision and returns typed OpenAPI error responses; a single exception filter emits a uniform `{ statusCode, error, message, path, timestamp, traceId }` envelope. Env vars are validated by a Zod schema that fails closed — it won't boot in staging or production on a known dev secret, a secret under 32 characters, or with multiple instances declared while rate limiting is still in-memory. Auth is the worked example: argon2id hashing that upgrades a stored password on the next login when you raise the cost, timing-equalised login, session tokens shown once and stored only as a SHA-256 hash, hourly token rotation with a superseded-token alarm that revokes the whole sign-in, an account-facing session list and a revoke-all for when a cookie goes missing, and a background prune for expired sessions whose sweep budget scales with the rotation interval.

**Generated clients (`packages/services`)** — the OpenAPI document is extracted by booting the app in extraction mode (no database needed), split by tag, and generated with `@hey-api/openapi-ts` into one directory per domain. Output is committed and never hand-edited; `pnpm gen:client` regenerates. Every call returns a `ServiceResult` discriminated union, so network failures and HTTP errors are values you handle rather than exceptions you forget to catch.

**Frontend (`apps/frontend`)** — App Router, Server Components by default, split into `(public)/(guest)` and `(members)` route groups. The layering is strict: `proxy.ts` mints the per-request CSP nonce and correlation ids and handles guest/member redirects; server actions always go through `actionWrapper`, which takes a deliberate auth mode and re-validates input server-side (client-side validation is a convenience, nothing more); `lib/gateway/` is the only door to the backend and nothing else may import `@repo/services`. Sessions use a `llstack_session` cookie plus an HMAC binding token that rides in two cookies of its own — a `SameSite=Strict` one that does the work and a `Lax` companion so an emailed link doesn't read as a failed binding — named `__Host-bind*` in production and `bind*_dev` in dev, because that prefix requires `Secure` and local dev is http. That binding token carries two deadlines: an 8-hour idle timeout (`AUTH_IDLE_TIMEOUT_SECONDS`) rolled forward as you use the app, well inside the backend's 7-day session TTL, and the point at which `proxy.ts` asks the backend to re-issue the session token, which retires the old one and makes a copied cookie detectable the next time it turns up.

Next is my default, not a requirement. Everything the frontend consumes — the generated clients, `@repo/ui`, `@repo/schema`, `@repo/logging` — is plain React and framework-agnostic, so TanStack Start, React Router or anything else with a server runtime drops in once you've reimplemented those three layers. A pure SPA works too, but be aware of what you're giving up: rule 1 assumes a server tier holding the `x-api-secret`, and without one you need either a thin proxy in front of the API or a different story at the edge.

**UI library (`packages/ui`)** — around thirty primitives and twenty composed components (dialog, drawer, toast, file upload, password strength meter, avatar crop), built on Radix where Radix earns its place, plus TanStack Form and Table wrappers. Tailwind v4 driven entirely by a `--ui-*` CSS variable token contract, with themes generated from a `theme.json`, so a new theme is a config file rather than a stylesheet rewrite. `COMPONENTS.md` is the catalog, and it exists so nobody writes a fourth button. The library has its own home at [ll-ui](https://github.com/shiggydoodah/ll-ui), where it's developed against a component playground and a render test per specimen — that's the repo to read if you want the design system rather than the stack. It's pre-release, so token and component names can still move; pin a commit if you take it somewhere else.

**Shared packages** — `@repo/config` (TS presets, Prettier), `@repo/logging` (stdout/Seq/OTLP sinks, field redaction, browser-safe entry point), `@repo/schema` (Zod primitives both tiers validate against, so frontend and API agree on what a valid password is), `@repo/utils` (dependency-light helpers).

**Observability** — structured logging through `nestjs-pino` on the backend and a matching server/browser logger pair on the frontend, all writing via `@repo/logging`. Browser logs post to `/api/client-logs`, which is anonymous by necessity and therefore ships **off by default** behind `CLIENT_LOG_INGEST_ENABLED`. Turn it on and it's rate-limited per client and app-wide, size- and shape-capped, restricted to the registered `client.*` browser events with server-assigned severity, and re-redacted server-side. Cross-site posts are refused on their headers before any of that runs, against the host the Next process received — set `CLIENT_LOG_ALLOWED_ORIGIN` if a proxy in front of it rewrites `Host`, or every real browser request fails the check. What gets through joins the same sink as everything else. OpenTelemetry traces and metrics are wired up and off by default.

Sinks are the swappable part: stdout, [Seq](https://datalust.co/seq) and OTLP over HTTP ship with it, and no call site knows which one it's writing to, so pointing OTLP at your own collector or adding a sink for whatever you already run is a change inside one package. Seq is the default because it's what I use locally — Docker Compose brings it up, and searching a correlation id there is the quickest way to watch a request cross all three tiers.

**Testing** — three layers. Jest on the backend, with real-database integration tests against per-worker databases plus a route-inventory pin that fails if an endpoint appears unnoticed. Vitest for the packages and the frontend. And end-to-end with Playwright, which gets its own `apps/testing` workspace: it boots the _real_ backend and frontend against the test database with explicitly injected env, so your local `.env` can't desync the suite from the stack it's meant to be testing. Underneath all that, two boot smokes catch what `tsc` can't — one proves the compiled `dist/` loads in Node, the other that the ts-node dev pipeline resolves.

**CI** — [`ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and every PR. One job stands up Postgres, copies the `.env.example` files exactly as `pnpm setup` does, creates the test database, migrates both, then runs `pnpm format:check` and `pnpm verify`. Playwright is a local-only gate; its job is commented out rather than deleted so it can come back verbatim. There's no CI-only build path, so a red build means the local run got skipped.

## Commands

```bash
pnpm setup                 # first-run setup
pnpm dev                   # backend + frontend
pnpm build / lint / typecheck / format
```

`pnpm verify` is the single source of truth for "does this repo pass" — run it before you push. It goes Node-pin check → prisma-lint → lint → build → boot smokes → drift check → typecheck → tests, cheap checks first. Scoped variants: `verify:backend` (includes the drift check), `verify:frontend`, `verify:ui`. On a weaker machine, `TURBO_CONCURRENCY=2 pnpm verify` keeps the ceiling low.

```bash
pnpm test                  # unit + integration
pnpm test:e2e              # Playwright, two runs (test:e2e:ui for UI mode)
pnpm gen:client            # regenerate typed clients — takes domains, --list, --dry-run, --force
pnpm migrate               # migrate BOTH dev and test databases
pnpm clean                 # build output and caches — :turbo, :gen, :seq for narrower
```

Anything can be scoped with `pnpm --filter @repo/<app> <task>`.

Databases are `llstack_dev` and `llstack_test`, both on `postgresql://postgres:postgres@localhost:5433/`. Docker Compose creates the first, an init script the second. Schema conventions — named UUID v7 primary keys, `@db.Timestamptz(3)`, explicit `onDelete`, soft-delete partial indexes — are enforced by `prisma-lint` and explained in [`docs/charters/database-standards.md`](docs/charters/database-standards.md).

Husky installs with `pnpm install`. Pre-commit formats and re-stages; pre-push blocks direct pushes to `main` unless every changed path is under `docs/`.

## Repo layout

| Path                | What it is                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| `apps/backend`      | NestJS API, Prisma, PostgreSQL                                                     |
| `apps/frontend`     | Next.js App Router app and BFF                                                     |
| `apps/testing`      | Playwright end-to-end workspace                                                    |
| `packages/config`   | Shared TypeScript and Prettier configs                                             |
| `packages/logging`  | Logging sinks and redaction                                                        |
| `packages/schema`   | Shared Zod primitives                                                              |
| `packages/services` | Generated OpenAPI clients                                                          |
| `packages/ui`       | Component library, tokens, themes ([ll-ui](https://github.com/shiggydoodah/ll-ui)) |
| `packages/utils`    | Dependency-light helpers                                                           |
| `docs/charters`     | Standards, with the reasoning                                                      |
| `docs/agents`       | The same standards as agent runbooks                                               |
| `scripts`           | Setup, cleaning, formatting, Postgres init                                         |
| `bruno`             | Hand-driven API request collection                                                 |

## Make it yours

A template copy is byte-identical to this repo, so three files describe LL Stack rather than whatever you're building. Fix them while you still remember they exist.

[`LICENSE`](LICENSE) is MIT and the copyright notice has to be preserved, so leave the LL Stack line and add your own beneath it. [`SECURITY.md`](SECURITY.md) is written about a boilerplate that isn't deployed anywhere, which stops being true the moment you have a product — rewrite it or delete it until you've got something to say. And this README sells the template; yours should describe your product, keeping whatever setup instructions still apply.

Everything else is meant to come with you. `AGENTS.md`, `CLAUDE.md`, the copilot instructions, the charters, the `CONTEXT.md` files and `.claude/settings.json` are the half of this repo that isn't code. Edit them as your conventions drift, but don't open by deleting them.

## Staying current

**Use this template** gives you a repo with no shared history and no upstream remote, so `git pull` will never bring you fixes from here. That's the intended trade — you own your copy from the first commit and nothing upstream can rewrite decisions you've since made.

The cost is that security fixes don't arrive on their own. If you want them, watch this repo and pull changes across deliberately: read the diff on `main`, then cherry-pick or re-apply by hand. If you'd rather stay wired up, fork instead of templating. You keep the shared history and can merge `main` whenever, at the price of a permanent fork relationship and merge conflicts everywhere your product diverges — which, for a boilerplate, is everywhere.

## Security

[`SECURITY.md`](SECURITY.md) covers private vulnerability reporting, which alarming-looking things in here are deliberate (the committed dev credentials, the local Docker settings), the known limitations, and the checklist to work through before deploying anything derived from this repo.

## License

[MIT](LICENSE) — © Louis Lombardi
