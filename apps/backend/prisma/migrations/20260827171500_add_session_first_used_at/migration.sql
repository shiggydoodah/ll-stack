-- When a session token was first presented on a request.
--
-- Null means the token was minted and never used. `resolveSupersededSession`
-- reads it to separate a rotation whose Set-Cookie never reached the browser
-- from a copied token. Both end with the retired parent being presented after
-- its grace window; only the second leaves behind a successor that someone went
-- on to use, and only the second should revoke the family.
--
-- Added nullable and NOT backfilled. Every row that predates this column was
-- minted before anything recorded a first use, and stamping one on now would
-- assert a fact the database never observed — the safe direction, since an
-- unstamped successor suppresses the alarm rather than raising a false one.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "first_used_at" TIMESTAMPTZ(3);
