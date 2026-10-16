ALTER TABLE "celesnity_app"."firmware_releases"
  ADD COLUMN "signing_key_id" VARCHAR(80),
  ADD COLUMN "signature_verified_at" TIMESTAMPTZ(6);

ALTER TABLE "celesnity_app"."firmware_releases"
  ADD CONSTRAINT "firmware_releases_signature_verification_check" CHECK (
    ("signing_key_id" IS NULL AND "signature_verified_at" IS NULL)
    OR
    ("signing_key_id" IS NOT NULL AND "signature_verified_at" IS NOT NULL)
  );
