# Database Standards for Agents

This runbook is the authoritative rule set for any schema, migration, or Prisma-touching change. Read it before editing `apps/backend/prisma/**` or any service that calls Prisma.

Human-readable rationale and the full reference tables live at `docs/charters/database-standards.md`. This file is the rule-shaped enforcement layer. If the two ever disagree, the charter is the source of truth — open a PR to reconcile.

Schema work is not complete until `pnpm prisma:lint` and `pnpm verify` both pass.

---

## When to Read This File

Read this file before any of:

- adding a Prisma model
- renaming, reshaping, or deleting a Prisma model
- adding or modifying a field, index, relation, or enum
- writing a Prisma migration (auto-generated or hand-edited)
- adding a service that calls `prisma.<model>.create` / `.update` / `.upsert` / `.delete`
- changing referential actions (`onDelete`, `onUpdate`)
- introducing JSON / JSONB storage
- changing token, API-key, email, or password storage shape

If your task touches none of these, this file does not apply.

---

## Non-Negotiable Rules

These apply to every model, no exceptions unless registered in `docs/charters/database-standards.md` § "Documented Exceptions" — that section is the whole list, and a model taking an exception MUST cite it by name from `schema.prisma` (a citation naming a section that does not exist is worse than none, because it asserts a compliance status nothing checks). A rule broken anywhere else is a bug, not a precedent to copy. Charter prose is outside `pnpm prisma:lint` and `pnpm verify`, so this is a review-only gate.

### IDs

- MUST use a named primary key: `<modelName>Id` (e.g. `userId`, `sessionId`).
- MUST NOT use generic `id`.
- MUST annotate the PK with `@id @db.Uuid @map("<model_name>_id")`.
- MUST NOT use `@default(cuid())`, `@default(uuid())`, `@default(autoincrement())`, or any DB-generated default.
- MUST generate UUID v7 at the service layer using `uuidv7()` (imported as `import { v7 as uuidv7 } from 'uuid'`) on every `create` / `upsert`.
- Every FK column MUST also be `@db.Uuid @map("<fk>_id")`.

### Timestamps

- Every `DateTime` field MUST use `@db.Timestamptz(3)` and `@map("<field>_at")`.
- MUST NOT use the default `timestamp(3)` (no timezone).
- Apply the archetype that matches the row's mutation contract:

  | Archetype                     | Mutable? | Soft-delete? | Fields                                 |
  | ----------------------------- | -------- | ------------ | -------------------------------------- |
  | A — mutable + soft-deletable  | yes      | yes          | `createdAt`, `updatedAt`, `deletedAt?` |
  | B — mutable, hard-delete only | yes      | no           | `createdAt`, `updatedAt`               |
  | C — append-only / immutable   | no       | no           | `createdAt` only                       |

- MUST add `createdAt` to every model.
- MUST add `updatedAt` only when the row is UPDATE'd after creation.
- MUST add `deletedAt` only when the entity supports soft-delete.
- MUST NOT add `updatedAt` to Archetype C models (tokens, audit, history, event entries).

### Column and table mapping

- Every field MUST have `@map("<snake_case>")`.
- Every model MUST have `@@map("<plural_snake_case>")`.
- MUST NOT mix camelCase and snake_case in column names — always snake via `@map`.

### Referential actions

- Every `@relation` MUST declare an explicit `onDelete`. Never rely on Prisma's default.
- Apply by relationship type:

  | Relationship                                     | `onDelete`               |
  | ------------------------------------------------ | ------------------------ |
  | Owned child row (e.g. a per-user preference row) | `Cascade`                |
  | Business-record row that must survive its owner  | `Restrict`               |
  | Session / token row                              | `Cascade`                |
  | Audit / event row                                | No FK declared in Prisma |
  | Provenance pointer (nullable admin actor)        | `SetNull`                |

### Enums

- MUST use a Prisma `enum` for any field with a fixed value set.
- MUST NOT use `String` + a comment listing allowed values.

### Polymorphic targets

- MUST NOT store opaque polymorphic strings (`targetId: String`, `targetType: String`).
- MUST use a discriminator enum + one nullable FK per allowed target type.
- MUST add a PG `CHECK` constraint via raw migration that enforces both cardinality and discriminator/column consistency (see the `activity_source_matches_type` pattern in the charter).
- One exception: `AuditEntry` keeps opaque `actorId` / `targetId` strings deliberately, so the trail outlives hard-deleted rows. Do not add FKs to AuditEntry.

### JSON storage

- MUST NOT use untyped `Json` fields for structured data.
- Promote to a dedicated table with a composite PK where the natural key is unambiguous (see `NotificationPreference` in the charter — illustrative only).
- If a JSONB column is unavoidable, add a PG `CHECK` constraint and Zod validation at the service boundary.

### Soft-delete uniqueness

- For any unique-while-active field on a soft-deletable model, MUST use a partial unique index via raw migration: `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`.
- MUST NOT use a plain `@unique` / `@@unique` for these fields.

### Normalized lookup fields

- For any field used for uniqueness or lookup, MUST normalize (trim + lowercase) before writing.
- **When the display form matters to UX** (e.g. a display handle): MUST store both display (`<field>`) and normalized (`<field>Normalized`). Uniqueness constraints and indexes go on the normalized column.
- **When the display form does not matter** (e.g. `email` — case-insensitive by spec): normalize at the service layer and store only the single `<field>` column. The unique index goes on that column directly.
- See `docs/charters/database-standards.md` § "Rule: normalize at write time; keep a display copy only when it matters".

### Sensitive data

- Tokens and API keys: persist hash only, never raw.
- Every stored credential hash MUST carry a version column (`hashVersion Int @default(1) @db.SmallInt @map("hash_version")`), and hashing MUST be dispatched on it. A hashing scheme cannot be migrated without one: the plaintext is by definition not stored, so the only moment a row can be rehashed is a successful authentication — and that requires knowing which scheme produced the stored value. Adding the column later is useless, because the rows that need it already exist.
- Passwords: argon2 hash only.
- Email: stored normalized, never logged in metadata.
- Provider payloads: do not store raw third-party provider webhook responses unless explicitly required.
- Audit / event metadata: opaque refs only, never PII / tokens / sensitive content.

### Indexes

- Add compound indexes on FK + common filter columns for every model. Examples in the charter.
- Do not add an index covering the PK alone — UUID v7 makes the PK index efficient already.

---

## Checklist — Adding a New Model

When adding a model, walk through this list and tick each item before opening a PR:

- [ ] Named PK: `<modelName>Id String @id @db.Uuid @map("<model_name>_id")`.
- [ ] Every FK has `@db.Uuid @map("<fk>_id")`.
- [ ] Every `DateTime` uses `@db.Timestamptz(3) @map(...)`.
- [ ] Archetype-correct timestamps (no `updatedAt` on Archetype C; no `deletedAt` unless Archetype A).
- [ ] Every field has `@map`.
- [ ] Model has `@@map("<plural_snake_case>")`.
- [ ] Every `@relation` has an explicit `onDelete`.
- [ ] Discriminators are Prisma `enum`s, not `String` + comment.
- [ ] No untyped `Json` field.
- [ ] No opaque polymorphic IDs (or, if `AuditEntry`-style, documented as such).
- [ ] Compound indexes for FK + common filters.
- [ ] If soft-deletable: partial unique indexes added via raw migration for unique-while-active fields.
- [ ] If unique/lookup field: normalize at write time. Keep both `<field>` + `<field>Normalized` only when displaying the original value matters to UX (e.g. a display handle). For fields where casing is irrelevant (e.g. email), store only the normalized form.
- [ ] If sensitive (tokens, API keys, passwords, provider payloads): hash-only / opaque-only, and a credential hash carries `hashVersion`.
- [ ] Service layer passes `<modelName>Id: uuidv7()` on every `create` / `upsert`.
- [ ] `pnpm prisma:lint` passes.
- [ ] `pnpm verify` passes.

---

## Checklist — Adding a Raw Migration Constraint

When a constraint cannot be expressed in `schema.prisma`:

- [ ] Migration generated with `pnpm prisma migrate dev --create-only --name <description>`.
- [ ] Hand-edited SQL adds the CHECK / partial index / expression index.
- [ ] Constraint has a stable, descriptive name (e.g. `activity_source_matches_type`, `unique_active_user_email`).
- [ ] Combined-condition CHECKs cover both cardinality AND discriminator consistency (a `num_nonnulls = 1` check alone is insufficient for polymorphic targets).
- [ ] Rewrite-under-lock accounted for: adding an arm to a polymorphic discriminator recreates the enum a `CHECK` references, so the migration does an `ALTER COLUMN … TYPE`, which rewrites the whole table under an `ACCESS EXCLUSIVE` lock (blocking all reads/writes to it for the duration). No code change avoids this — it is the recipe — but for a large or hot table, confirm the row count and schedule the deploy in a low-traffic window.
- [ ] A `// RAW CONSTRAINT: <name> (see migration)` comment is added to `schema.prisma` next to the affected model.
- [ ] Applied via `pnpm prisma migrate dev`.
- [ ] `pnpm prisma:lint` passes.
- [ ] `pnpm verify` passes.

---

## Validation Commands

```bash
pnpm prisma:lint            # schema lint — fails on missing createdAt/updatedAt/mapping
pnpm --filter @repo/backend test
pnpm --filter @repo/backend typecheck
pnpm verify                 # full validation chain — required after any schema change
```

Do not weaken validation, lint rules, or types to make a schema change pass. If `prisma-lint` blocks a legitimate exception (e.g. an append-only audit table is intentionally Archetype C), add the exception to `.prismalintrc.yml` with a comment, not by removing the rule.

---

## Cross-References

- Human-readable charter: `docs/charters/database-standards.md`
- Repo-wide non-negotiables: `AGENTS.md`
- Prisma schema: `apps/backend/prisma/schema.prisma`
- Prisma directory map: `apps/backend/prisma/CONTEXT.md`
