-- Preserve existing background identities while permitting a distinct Agent actor.
ALTER TABLE "celesnity_app"."organization_service_identities"
  DROP CONSTRAINT "organization_service_identities_pkey";
ALTER TABLE "celesnity_app"."organization_service_identities"
  ADD COLUMN "purpose" VARCHAR(32) NOT NULL DEFAULT 'BACKGROUND';
ALTER TABLE "celesnity_app"."organization_service_identities"
  ADD CONSTRAINT "organization_service_identities_pkey"
    PRIMARY KEY ("organization_id", "purpose");
ALTER TABLE "celesnity_app"."organization_service_identities"
  ADD CONSTRAINT "organization_service_identities_purpose_check"
    CHECK ("purpose" IN ('BACKGROUND', 'AGENT'));
