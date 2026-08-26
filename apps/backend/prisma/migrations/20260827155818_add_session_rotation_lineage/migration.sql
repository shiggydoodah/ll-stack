-- Session token rotation and lineage.
--
-- `family_id` groups every token one sign-in has held. It is added nullable,
-- backfilled from the row's own `session_id` (a pre-rotation session is the
-- only member of its own family), then made NOT NULL — the generated migration
-- added it NOT NULL outright, which cannot run against a table that already
-- holds sessions.
--
-- `rotated_at` marks a token superseded by its successor. Null is the family's
-- current token.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "family_id" UUID;

UPDATE "sessions" SET "family_id" = "session_id" WHERE "family_id" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "family_id" SET NOT NULL;

ALTER TABLE "sessions" ADD COLUMN "rotated_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");
