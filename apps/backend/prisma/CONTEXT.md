# Context: apps/backend/prisma

## Purpose

- The PostgreSQL data model and its migration history — the source of truth for
  every persisted shape in the system.
- Read/edit here for schema changes, new models, indexes, and SQL-level
  constraints.

## Architecture

- `schema.prisma` — `prisma-client-js` generator, `postgresql` datasource (URL
  supplied from the environment via `../prisma.config.ts`). Two models today:
  - `User` (`users`) — `userId` UUID PK, `name`, `email`, `passwordHash`,
    `hashVersion`, `consent`, `role` (`UserRole` enum), `deletedAt` soft delete,
    `createdAt`/`updatedAt`.
  - `Session` (`sessions`) — `sessionId` UUID PK, `userId` FK
    (`onDelete: Cascade`), `familyId`, unique `tokenHash`, `hashVersion`,
    `issuedAt`, `expiresAt`, `rotatedAt`, `firstUsedAt`, `revokedAt`,
    timestamps.
- `migrations/` — ordered SQL migrations plus `migration_lock.toml`. Raw
  constraints that Prisma cannot express live here (see below).

## Key Flows

- Change the schema → `pnpm --filter @repo/backend prisma:migrate:dev` →
  `prisma:generate` → re-run `openapi:extract` / `pnpm gen:client` if the
  contract moved.
- `pnpm migrate` applies migrations to **both** `llstack_dev` and
  `llstack_test`.
- `pnpm --filter @repo/backend db:reset` resets and reseeds the dev database
  (`prisma migrate reset` does not seed in Prisma 7, so the script chains
  `prisma db seed` explicitly).

## Integrations

- Consumed only through `PrismaService` (`src/prisma/`). Feature services own
  their queries; controllers never touch Prisma.
- `.prismalintrc.yml` at the repo root drives `pnpm prisma:lint`.

## Gotchas

- **UUID v7 is generated at the service layer** (`import { v7 as uuidv7 } from
'uuid'`) — there is deliberately no `@default(uuid())`.
- Every `DateTime` is `@db.Timestamptz(3)`; every column is `@map`ped to
  snake_case; every table is `@@map`ped to a plural snake_case name; every
  relation declares an explicit `onDelete`.
- `users.email` uniqueness is a **partial unique index**
  (`unique_active_user_email … WHERE deleted_at IS NULL`) declared in the
  migration SQL, not in `schema.prisma`. Email is stored normalized (trimmed +
  lowercased) at write time.
- `sessions` is Archetype B: mutable, **hard-delete only** — expired rows are
  pruned outright by `SessionPruneService`, never soft-deleted.
- **A `sessions` row is one token, not one sign-in.** Rotation supersedes a row
  (`rotatedAt`) and inserts its successor with the same `familyId` and the same
  `expiresAt`, so a family expires together and one sweep clears it. `familyId`
  carries no FK on purpose: it points at a row the pruner is free to delete.
- `firstUsedAt` is stamped once, the first time a token resolves on a request.
  Null on a successor means its `Set-Cookie` reached nobody, which is what keeps
  a dropped rotation response from reading as token theft (`auth.service.ts`).
- `hashVersion` columns exist so credential hashing can be migrated; dispatch on
  them rather than assuming the current scheme. `users.hash_version` has that
  reader — `AuthService.login` re-hashes a password stored under an older scheme
  or a lower argon2 cost. `sessions.hash_version` does not: a token arrives raw
  on every request, so a second scheme there would be migrated on presentation,
  and there is no second scheme.
- prisma-lint cannot check timestamptz, partial unique indexes, raw CHECK
  constraints, or archetype-correct `updatedAt` — those are on the agent
  checklist.

## Agent Notes

- **Read `docs/agents/database-standards.agents.md` before touching anything
  here**, and `docs/charters/database-standards.md` for the rationale.
- Not complete until both `pnpm prisma:lint` and `pnpm verify` pass.
- Do not hand-edit applied migrations; add a new one.
