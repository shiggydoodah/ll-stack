# Database Standards

These are the durable conventions that govern every Prisma model, migration, and database access path in this repo. The goals are: a schema that is consistent to read, safe under deletion and concurrency, agent-navigable, and that doesn't accumulate special cases as the app grows.

The agent-facing companion at `docs/agents/database-standards.agents.md` distils these rules into a strict checklist for automated enforcement. This charter exists so humans understand _why_ each rule is here.

The schema is minimal today; the auth-phase models (`User`, `Session`, `EmailVerification`, `PasswordResetToken`, …) are used as the worked examples throughout. Models shown purely to illustrate a rule are marked as illustrative — they are examples, not precedents.

---

## Stack

- PostgreSQL + Prisma ORM
- NestJS (TypeScript)
- All IDs: UUID v7 (time-ordered, globally unique)
- UUID v7 generated at the application layer via the `uuid` npm package (`import { v7 as uuidv7 } from 'uuid'`)

UUID v7 keys give us insert-order locality on the PK index without sacrificing global uniqueness or leaking row counts the way a serial would. Generating in the app layer (rather than via a Postgres extension) keeps the schema portable and lets the service layer hold all ID logic in one place.

---

## ID Convention

Every model gets a **named primary key** — `userId`, `sessionId`, etc. — never a generic `id`.

```prisma
model User {
  userId  String  @id @db.Uuid @map("user_id")

  @@map("users")
}
```

Exceptions to the named-surrogate rule exist only if registered in § "Documented Exceptions" — nowhere else.

`@db.Uuid` is required on every ID and FK field. Without it, Prisma maps `String` to PostgreSQL `text`. UUID v7 is still a valid UUID — `@db.Uuid` just tells PostgreSQL to store it as a native `uuid` column, not a text string.

### FK fields also get @db.Uuid

```prisma
model Session {
  sessionId  String  @id @db.Uuid @map("session_id")
  userId     String  @db.Uuid @map("user_id")
  user       User    @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@map("sessions")
}
```

### UUID v7 generation (NestJS service layer)

```typescript
import { v7 as uuidv7 } from 'uuid';

await prisma.user.create({
  data: { userId: uuidv7(), ... }
});
```

### Naming layers

| Layer               | Convention                    | Example                 |
| ------------------- | ----------------------------- | ----------------------- |
| Prisma / TypeScript | camelCase                     | `userId`, `sessionId`   |
| PostgreSQL columns  | snake_case via `@map`         | `user_id`, `session_id` |
| PostgreSQL tables   | plural snake_case via `@@map` | `users`, `sessions`     |
| PostgreSQL ID type  | native uuid via `@db.Uuid`    | not `text`              |

---

## Timestamp Convention

All `DateTime` fields must use `@db.Timestamptz(3)`. Prisma defaults to `timestamp(3)` (no timezone) — for an app with global users and security-sensitive audit timestamps, always store absolute time with timezone semantics.

### Three model archetypes

**Archetype A — Mutable + soft-deletable** (User etc.)

```prisma
createdAt  DateTime   @default(now()) @db.Timestamptz(3) @map("created_at")
updatedAt  DateTime   @updatedAt      @db.Timestamptz(3) @map("updated_at")
deletedAt  DateTime?                  @db.Timestamptz(3) @map("deleted_at")
```

**Archetype B — Mutable, hard-delete only** (Session, FeatureFlag etc.)

```prisma
createdAt  DateTime  @default(now()) @db.Timestamptz(3) @map("created_at")
updatedAt  DateTime  @updatedAt      @db.Timestamptz(3) @map("updated_at")
// NO deletedAt — deletion means DELETE the row
```

**Archetype C — Append-only / Immutable** (EmailMessage, one-time token rows, audit/event rows etc.)

```prisma
createdAt  DateTime  @default(now()) @db.Timestamptz(3) @map("created_at")
// NO updatedAt — row must never be UPDATE'd after INSERT
// NO deletedAt — immutable by contract
```

> **Note on audit rows:** an append-only record (an audit trail, an event log) is strictly Archetype C. It is never UPDATE'd and never deleted; corrections are new entries. It gets `createdAt` only.

### Golden rule

```
createdAt  →  every model, no exceptions
updatedAt  →  only if the row can be UPDATE'd after creation
deletedAt  →  only if the entity supports soft-delete
```

---

## Timestamp Reference — Auth-Phase Models

| Model                    | createdAt | updatedAt | deletedAt | Notes                               |
| ------------------------ | :-------: | :-------: | :-------: | ----------------------------------- |
| User                     |    ✅     |    ✅     |    ✅     | GDPR soft-delete                    |
| Session                  |    ✅     |    ✅     |    ❌     | Revocation is a field, not a delete |
| EmailVerification        |    ✅     |    ❌     |    ❌     | Single-use, append-only             |
| PasswordResetToken       |    ✅     |    ❌     |    ❌     | Single-use, append-only             |
| EmailMessage             |    ✅     |    ❌     |    ❌     | Audit log                           |
| FeatureFlag / KillSwitch |    ✅     |    ✅     |    ❌     | Ops config                          |

---

## Schema Quality Rules

### 1. No untyped JSON blobs

Per-key configuration (e.g. per-channel notification preferences) must be typed. Preferred: promote to a dedicated table. Acceptable fallback: JSONB column with a PG `CHECK` constraint + Zod validation at the service boundary.

```prisma
// Preferred — composite PK, natural uniqueness is self-evident (ILLUSTRATIVE)
model NotificationPreference {
  userId   String              @db.Uuid @map("user_id")
  channel  NotificationChannel               // EMAIL, PUSH, IN_APP
  enabled  Boolean             @map("enabled")
  user     User                @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@id([userId, channel])  // no surrogate PK needed — natural key is clear
  @@map("notification_preferences")
}
```

The composite key reads as correct here because the natural uniqueness is unambiguous — a user has exactly one setting per channel. **`NotificationPreference` is illustrative, not a precedent**: a composite PK in a real model needs its own entry in § "Documented Exceptions" whatever this snippet shows.

### 2. No polymorphic targets via opaque string IDs

Any polymorphic target (a row that points at exactly one of several possible parents — e.g. an activity event sourced from a user action, an admin action, or a system job) uses nullable FKs + a discriminator enum + a PG `CHECK` constraint enforcing exactly one target.

```prisma
// ILLUSTRATIVE
model ActivityEvent {
  activityEventId  String              @id @db.Uuid @map("activity_event_id")
  sourceType       ActivitySourceType  @map("source_type")

  sourceSessionId      String?  @db.Uuid @map("source_session_id")
  sourceAdminActionId  String?  @db.Uuid @map("source_admin_action_id")
  sourceJobRunId       String?  @db.Uuid @map("source_job_run_id")
  // ...
  @@map("activity_events")
}
```

```sql
-- Applied via raw migration
-- Enforces: exactly one source set AND it matches the sourceType discriminator
ALTER TABLE activity_events ADD CONSTRAINT activity_source_matches_type
CHECK (
  (source_type = 'USER'   AND source_session_id      IS NOT NULL AND num_nonnulls(source_session_id, source_admin_action_id, source_job_run_id) = 1)
  OR (source_type = 'ADMIN'  AND source_admin_action_id IS NOT NULL AND num_nonnulls(source_session_id, source_admin_action_id, source_job_run_id) = 1)
  OR (source_type = 'SYSTEM' AND source_job_run_id      IS NOT NULL AND num_nonnulls(source_session_id, source_admin_action_id, source_job_run_id) = 1)
);
```

> A `num_nonnulls = 1` check alone is not enough — it allows `source_type = 'USER'` with `source_job_run_id` filled. The combined constraint enforces both cardinality and type/column consistency.

A future `AuditEntry`-style admin audit table is the deliberate exception to this rule: it stores actor and target as opaque strings precisely so the trail survives hard-deletion of the referenced rows. That is the only place where opaque polymorphic IDs are allowed.

### 3. Reference data must be a real table

A code-configured catalog that rows point at (e.g. an `emailTemplateCode` on `EmailMessage`) must FK to a real table — no dangling code-config references.

```prisma
// ILLUSTRATIVE
model EmailTemplate {
  emailTemplateId  String   @id @db.Uuid @map("email_template_id")
  code             String   @unique           // matches config key e.g. "VERIFY_EMAIL"
  displayName      String   @map("display_name")
  isActive         Boolean  @default(true) @map("is_active")
  createdAt        DateTime @default(now()) @db.Timestamptz(3) @map("created_at")
  updatedAt        DateTime @updatedAt @db.Timestamptz(3) @map("updated_at")

  messages EmailMessage[]
  @@map("email_templates")
}
```

### 4. Status machines need an event log

A single-row status field (e.g. `User.status` moving `ACTIVE → SUSPENDED → DELETED`) loses history on every transition. Pair it with an append-only event table.

```prisma
// ILLUSTRATIVE
enum UserStatusEventSource {
  USER
  ADMIN
  SYSTEM
}

model UserStatusEvent {
  userStatusEventId  String                 @id @db.Uuid @map("user_status_event_id")
  userId             String                 @db.Uuid @map("user_id")
  fromStatus         UserStatus?            @map("from_status")
  toStatus           UserStatus             @map("to_status")
  source             UserStatusEventSource  // typed enum, not a String comment
  createdAt          DateTime @default(now()) @db.Timestamptz(3) @map("created_at")

  @@map("user_status_events")
}
```

---

## Indexing Standards

Always add compound indexes on FK + common filter columns. UUID v7 PKs are sequential so the PK index is already efficient.

```prisma
model Session {
  @@index([userId, revokedAt])
  @@index([expiresAt])
}

model EmailMessage {
  @@index([userId, createdAt])
}

model PasswordResetToken {
  @@index([userId, createdAt])
}
```

---

## Soft-Delete Uniqueness

When a model has `deletedAt`, unique constraints on that model need an explicit policy.

### Rule: unique-while-active fields use a partial index

Fields like email or slug — that should only be unique among non-deleted rows — must use a partial unique index, not a plain `@@unique`.

```sql
-- Applied via raw migration
CREATE UNIQUE INDEX unique_active_user_email
ON users (email)
WHERE deleted_at IS NULL;
```

The `User.email` partial index is the canonical example.

### Rule: normalize at write time; keep a display copy only when it matters

For lookup/uniqueness fields, normalize (trim + lowercase) before writing. Whether to also keep the original display form depends on whether users need to see their exact input back:

- **Display handles** (if one ever ships) — users expect to see the form they chose. Store both `handle` (display) and `handleNormalized` (lowercased/trimmed). The unique index goes on `handleNormalized`.
- **Email** — email is case-insensitive by spec and users have no expectation of casing being preserved. Normalize at the service layer and store only `email` (normalized). The unique index goes on `email`.

```prisma
model User {
  email String @map("email") // stored normalized (trimmed + lowercased) at write time
  // unique partial index on email WHERE deleted_at IS NULL
}
```

When in doubt: if showing back the original value matters to the user experience, keep both columns. If not, normalize and store one.

---

## Raw Migration Rules

Prisma cannot fully express every DB constraint. Any rule Prisma can't express must go in a hand-edited migration.

### When to use a raw migration

- `CHECK` constraints (polymorphic target validation, enum-like string checks)
- Partial unique indexes (`WHERE deleted_at IS NULL`)
- Advanced indexes (expression indexes, covering indexes)
- Constraints using `num_nonnulls`, `CASE`, or other SQL expressions

### Workflow

```bash
# 1. Create a draft migration without applying it
pnpm prisma migrate dev --create-only --name add_activity_source_check

# 2. Edit the generated SQL file to add your raw constraint
# 3. Apply it
pnpm prisma migrate dev
```

### Documentation rule

Every raw constraint must have a comment in the Prisma schema near the affected model:

```prisma
model ActivityEvent {
  // RAW CONSTRAINT: activity_source_matches_type (see migration)
  // Enforces source_type matches the non-null FK column.
  ...
}
```

---

## Referential Action Standards

All FK relations must have an explicit `onDelete` rule. Never rely on Prisma's default.

| Relationship type                                     | `onDelete` rule | Rationale                                              |
| ----------------------------------------------------- | --------------- | ------------------------------------------------------ |
| Owned child row (e.g. NotificationPreference → User)  | `Cascade`       | Row is meaningless without parent                      |
| Business-record rows that must survive owner deletion | `Restrict`      | Prevent accidental data loss; soft-delete User instead |
| Session / token rows (Session → User)                 | `Cascade`       | Owned, no value post-deletion                          |
| Audit / event rows (future AuditEntry)                | No FK           | Intentionally survives parent deletion                 |
| Provenance pointer (an admin-actor reference → User)  | `SetNull`       | Keep the row, lose the pointer when the actor goes     |

```prisma
model NotificationPreference {
  user User @relation(fields: [userId], references: [userId], onDelete: Cascade)
}

model Session {
  user User @relation(fields: [userId], references: [userId], onDelete: Cascade)
}
```

---

## Enums Over String Comments

Never use a `String` field with a comment listing allowed values. Always use a Prisma `enum`.

```prisma
// ❌ Wrong
sourceType  String  // "USER" | "ADMIN" | "SYSTEM"

// ✅ Correct
enum ActivitySourceType { USER; ADMIN; SYSTEM }
sourceType  ActivitySourceType
```

Apply this to: user and account statuses, event source types, token purpose and status, and any other discriminator field.

---

## Sensitive Data Rules

Hard rules for this app type (accounts — sensitive user data):

- **Tokens and API keys** — store only hashes (session tokens, password reset, email verification, magic-link tokens, API keys). Never raw values.
- **Email addresses** — stored normalized at write time. Never log or embed in audit/event metadata; reference users by opaque IDs.
- **Passwords** — argon2 hash only. Never store, log, or pass plaintext.
- **Provider payloads** — do not store raw third-party provider responses unless explicitly required. If stored, use typed JSONB with a defined retention window.
- **Audit / event metadata** — must never contain PII, raw tokens, or sensitive content. Opaque refs only.

---

## Documented Exceptions

The rules in `docs/agents/database-standards.agents.md` § "Non-Negotiable Rules" apply to every model, **no exceptions unless listed here**. This section is that list — a rule broken anywhere else in the schema is a bug, not a precedent. An exception earns a place here only when following the rule would make the model _worse_, and the entry has to say why in terms someone can disagree with.

A model taking an exception must cite this section by name from `schema.prisma`, so the claim "documented" is checkable from the code rather than taken on trust. Nothing lints this — `prisma-lint` does not read prose — so a citation pointing at a section that does not exist survives CI untouched and can only be caught in review. Add the entry here in the same change that takes the exception.

| Model                        | Rule waived                           | Why                                                                                |
| ---------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `AuditEntry` (not built yet) | § Polymorphic targets — no opaque IDs | The trail must outlive hard-deleted actors and targets (see Schema Quality Rule 2) |

> **Not a general licence.** Each entry rests on a specific argument — a constraint doing real mechanical work, or a NULL that carries meaning of its own. A rule bent because "the natural key is obvious" or "the relation felt heavy" does not qualify; follow the rule, or make the argument here and let review disagree with it.

---

## Enforcement

`prisma-lint` is configured (`.prismalintrc.yml`) to fail CI if any model is missing `createdAt`, or if a mutable model is missing `updatedAt`. It also enforces `@map` / `@@map` mapping.

```bash
pnpm prisma:lint
```

`pnpm verify` runs `prisma:lint` as part of the backend chain, so non-compliant schemas fail validation locally and in CI.

For agents working on the schema, the rule-shaped checklist at `docs/agents/database-standards.agents.md` is the authoritative source — this charter exists for human readers.
