-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- RAW CONSTRAINT: unique_active_user_email — email is unique among live
-- accounts only. A soft-deleted account (deleted_at IS NOT NULL) releases its
-- address for re-registration, which a plain UNIQUE on email would forbid.
-- Prisma cannot express partial unique indexes, so this lives in raw SQL and
-- is documented on the model in schema.prisma.
CREATE UNIQUE INDEX "unique_active_user_email" ON "users"("email") WHERE "deleted_at" IS NULL;
