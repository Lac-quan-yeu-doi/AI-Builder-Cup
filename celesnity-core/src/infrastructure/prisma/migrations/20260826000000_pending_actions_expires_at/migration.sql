-- AIP's own Checkpoint pattern gives a proposed action a TTL (its
-- Logic-to-Automate integration defaults to 24 hours) rather than leaving
-- it approvable forever. Backfills existing rows to createdAt + 24h so the
-- column can be NOT NULL from here on; the application always supplies an
-- explicit value for every row created after this migration.
ALTER TABLE "celesnity_app"."pending_actions"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6);

UPDATE "celesnity_app"."pending_actions"
  SET "expires_at" = "created_at" + INTERVAL '24 hours'
  WHERE "expires_at" IS NULL;

ALTER TABLE "celesnity_app"."pending_actions"
  ALTER COLUMN "expires_at" SET NOT NULL;
