-- Deliberately no automatic grants or legacy shared-actor backfill.
CREATE TABLE "celesnity_app"."organization_service_identities" (
  "organization_id" UUID PRIMARY KEY REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  "identity_id" UUID NOT NULL UNIQUE REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL
);
