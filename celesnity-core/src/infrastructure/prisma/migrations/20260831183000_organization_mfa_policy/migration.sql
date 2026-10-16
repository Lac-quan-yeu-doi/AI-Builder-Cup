ALTER TABLE "celesnity_app"."organizations"
  ADD COLUMN "mfa_required" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "celesnity_app"."organizations"
  ALTER COLUMN "mfa_required" SET DEFAULT FALSE;
