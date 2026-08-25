# Context Map

> Read this first. It is a compressed routing map, not documentation.
> Pick the smallest relevant area, open its `CONTEXT.md`, and only then read
> source. When the user names a file path — or a Path Shortcut from `AGENTS.md`
> — go straight there and skip this map.

## Areas

### Root & tooling

- `.` - pnpm + Turborepo workspace: task graph, verify ladder, ESLint, Docker Compose, git hooks. Context: `CONTEXT.md`
- `.github` - CI (`verify` + `e2e` jobs), Dependabot, PR template, review instruction files. Context: `.github/CONTEXT.md`
- `scripts` - repo automation: `setup.sh`, `clean.sh`, staged-file formatting, Jest guard, Postgres init. Context: `scripts/CONTEXT.md`
- `bruno` - hand-driven Bruno request collection for local smoke checks. Context: `bruno/CONTEXT.md`

### Backend — `apps/backend`

- `apps/backend` - the private NestJS REST API; guards, DTOs, Prisma, OpenAPI, logging, telemetry. Context: `apps/backend/CONTEXT.md`
- `apps/backend/prisma` - PostgreSQL schema (`User`, `Session`) and migration history. Context: `apps/backend/prisma/CONTEXT.md`
- `apps/backend/scripts` - OpenAPI extraction, the dist/ts-node boot guards, dev seed, ts-node resolver shim. Context: `apps/backend/scripts/CONTEXT.md`
- `apps/backend/src` - composition root and the module layout map. Context: `apps/backend/src/CONTEXT.md`
- `apps/backend/src/bootstrap` - `configureApp`, the OpenAPI document + `/docs` gate, boot-failure reporting. Context: `apps/backend/src/bootstrap/CONTEXT.md`
- `apps/backend/src/common` - global guards, exception filter, trace interceptor, request-id middleware, logging, telemetry, throttler store. Context: `apps/backend/src/common/CONTEXT.md`
- `apps/backend/src/config` - the zod env contract and its fail-closed deployment rules. Context: `apps/backend/src/config/CONTEXT.md`
- `apps/backend/src/prisma` - the single `PrismaService` and slow-query logging. Context: `apps/backend/src/prisma/CONTEXT.md`
- `apps/backend/src/health` - `GET /health`, the one public (api-secret-exempt) route. Context: `apps/backend/src/health/CONTEXT.md`
- `apps/backend/src/auth` - register/login/logout, sessions, `SessionGuard`, named throttlers, session prune. Context: `apps/backend/src/auth/CONTEXT.md`
- `apps/backend/src/users` - `GET /users/me`. Context: `apps/backend/src/users/CONTEXT.md`
- `apps/backend/src/dashboard` - `GET /dashboard`, the example authenticated read. Context: `apps/backend/src/dashboard/CONTEXT.md`
- `apps/backend/test` - Jest suite, per-worker test databases, route-inventory pin, env helpers. Context: `apps/backend/test/CONTEXT.md`

### Frontend — `apps/frontend`

- `apps/frontend` - the member-facing Next.js App Router app and BFF; CSP/proxy, auth cookies, env, logging. Context: `apps/frontend/CONTEXT.md`
- `apps/frontend/app` - route groups `(public)/(guest)` and `(members)`, error boundaries, `/logout`, `/api/client-logs`, shared actions. Context: `apps/frontend/app/CONTEXT.md`
- `apps/frontend/components` - app-shared components (`LoggingProvider`, `ErrorScreen`, `NotFoundScreen`, `ModeToggle`, `AppToaster`). Context: `apps/frontend/components/CONTEXT.md`
- `apps/frontend/config` - server/public zod env schemas, `getServerEnv()`, dev-mode switch. Context: `apps/frontend/config/CONTEXT.md`
- `apps/frontend/lib` - all non-route modules; routing table for the sub-areas below. Context: `apps/frontend/lib/CONTEXT.md`
- `apps/frontend/lib/gateway` - the only door to the backend; wraps `@repo/services`, normalises results, logs safely. Context: `apps/frontend/lib/gateway/CONTEXT.md`
- `apps/frontend/lib/actions` - `actionWrapper` (auth gate, logging, control-flow rethrow) and request context. Context: `apps/frontend/lib/actions/CONTEXT.md`
- `apps/frontend/lib/authentication` - session cookie read/write/clear and the validated `validateSession()`. Context: `apps/frontend/lib/authentication/CONTEXT.md`
- `apps/frontend/lib/logging` - server + browser loggers, correlation ids, event catalog. Context: `apps/frontend/lib/logging/CONTEXT.md`
- `apps/frontend/lib/errors` - `ExpectedError`, the registered code catalog, boundary parsing, noise filters. Context: `apps/frontend/lib/errors/CONTEXT.md`
- `apps/frontend/lib/cache` - cache tags, life profiles, `withSessionCache`. Context: `apps/frontend/lib/cache/CONTEXT.md`
- `apps/frontend/lib/auth` - session-**binding** HMAC token and its `__Host-bind` cookie (not the session cookie). Covered in `apps/frontend/lib/CONTEXT.md`.

### Shared packages

- `packages/config` - `@repo/config`: shared TypeScript presets + the Prettier config. Context: `packages/config/CONTEXT.md`
- `packages/logging` - `@repo/logging`: sinks, field-name redaction, level defaults, request-path sanitising. Node barrel vs browser-safe `/shared`. Context: `packages/logging/CONTEXT.md`
- `packages/schema` - `@repo/schema`: shared zod primitives (email, name, password, token) both tiers validate against. Context: `packages/schema/CONTEXT.md`
- `packages/services` - `@repo/services`: generated Hey API clients, the generation pipeline, domain manifest, drift check. Generated output is committed and never hand-edited. Context: `packages/services/CONTEXT.md`
- `packages/ui` - `@repo/ui`: primitives, components, integrations, the `--ui-*` token contract and themes. Catalog: `packages/ui/COMPONENTS.md`. Context: `packages/ui/CONTEXT.md`
- `packages/utils` - `@repo/utils`: dependency-light string/date helpers. Context: `packages/utils/CONTEXT.md`

### Tests & docs

- `apps/testing` - Playwright E2E workspace; boots the real backend + frontend against `llstack_test`. Context: `apps/testing/CONTEXT.md`
- `docs` - the knowledge layer: charters, agent runbooks, and (once created) feature epics. Context: `docs/CONTEXT.md`
- `docs/agents` - the authoritative runbooks to read **before** coding in an area. Context: `docs/agents/CONTEXT.md`
- `docs/charters` - the durable standards and their rationale. Context: `docs/charters/CONTEXT.md`

## Not mapped

Skipped as generated, vendored, or transient: `node_modules/`, `dist/`,
`.next/`, `.turbo/`, `coverage/`, `.husky/_/`, `packages/services/src/*/generated/`
(machine-generated — see `packages/services/CONTEXT.md`), `.temp/` and
`docs/features/.backlog/` (do-not-auto-read; see `AGENTS.md`).
