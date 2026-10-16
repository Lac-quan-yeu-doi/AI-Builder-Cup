-- Existing rooms have no MFA assurance until their owner renews the binding
-- using a currently verified tenant session. Do not backfill from membership.
ALTER TABLE "celesnity_app"."agent_room_bindings"
  ADD COLUMN "mfa_verified_until" TIMESTAMPTZ(6),
  ADD COLUMN "agent_name" VARCHAR(120);

-- Existing agents receive no implicit data access. Administrators must grant
-- each organization-owned agent its own catalog scope explicitly.
ALTER TABLE "celesnity_app"."catalog_access_grants"
  ADD COLUMN "agent_name" VARCHAR(120);
ALTER TABLE "celesnity_app"."catalog_access_grants"
  DROP CONSTRAINT "catalog_access_grants_one_principal_check",
  ADD CONSTRAINT "catalog_access_grants_one_principal_check"
    CHECK (("group_id" IS NOT NULL)::int + ("identity_id" IS NOT NULL)::int + ("agent_name" IS NOT NULL)::int = 1);
CREATE INDEX "catalog_access_grants_organization_id_agent_name_idx"
  ON "celesnity_app"."catalog_access_grants"("organization_id", "agent_name");
