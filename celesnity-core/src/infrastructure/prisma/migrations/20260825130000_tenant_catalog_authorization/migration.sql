CREATE TYPE "celesnity_app"."CatalogResourceType" AS ENUM ('CATALOG', 'DATABASE', 'SCHEMA', 'TABLE', 'COLUMN');
CREATE TYPE "celesnity_app"."CatalogPermission" AS ENUM ('DISCOVER', 'DESCRIBE', 'PREVIEW', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'ALTER', 'GRANT', 'OWN');
CREATE TYPE "celesnity_app"."PolicyEffect" AS ENUM ('ALLOW', 'DENY');

ALTER TABLE "celesnity_app"."organizations"
  ADD COLUMN "identity_tenant_id" VARCHAR(128);
CREATE UNIQUE INDEX "organizations_identity_tenant_id_key"
  ON "celesnity_app"."organizations"("identity_tenant_id");

ALTER TABLE "celesnity_app"."user_identities"
  ADD COLUMN "identity_tenant_id" VARCHAR(128);
DROP INDEX "celesnity_app"."user_identities_provider_subject_key";
CREATE UNIQUE INDEX "user_identities_provider_identity_tenant_id_subject_key"
  ON "celesnity_app"."user_identities"("provider", "identity_tenant_id", "subject");

CREATE TABLE "celesnity_app"."authorization_groups" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "authorization_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "authorization_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "authorization_groups_organization_id_name_key" ON "celesnity_app"."authorization_groups"("organization_id", "name");
CREATE INDEX "authorization_groups_organization_id_idx" ON "celesnity_app"."authorization_groups"("organization_id");

CREATE TABLE "celesnity_app"."authorization_group_members" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "authorization_group_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "authorization_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "celesnity_app"."authorization_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "authorization_group_members_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "authorization_group_members_group_id_identity_id_key" ON "celesnity_app"."authorization_group_members"("group_id", "identity_id");
CREATE INDEX "authorization_group_members_identity_id_idx" ON "celesnity_app"."authorization_group_members"("identity_id");

CREATE TABLE "celesnity_app"."catalog_access_grants" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "group_id" UUID,
  "identity_id" UUID,
  "resource_type" "celesnity_app"."CatalogResourceType" NOT NULL,
  "resource_id" VARCHAR(255) NOT NULL,
  "permissions" "celesnity_app"."CatalogPermission"[] NOT NULL,
  "effect" "celesnity_app"."PolicyEffect" NOT NULL DEFAULT 'ALLOW',
  "include_descendants" BOOLEAN NOT NULL DEFAULT FALSE,
  "grant_option" BOOLEAN NOT NULL DEFAULT FALSE,
  "valid_from" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "catalog_access_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_access_grants_one_principal_check" CHECK (("group_id" IS NOT NULL)::int + ("identity_id" IS NOT NULL)::int = 1),
  CONSTRAINT "catalog_access_grants_valid_window_check" CHECK ("expires_at" IS NULL OR "valid_from" IS NULL OR "expires_at" > "valid_from"),
  CONSTRAINT "catalog_access_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "catalog_access_grants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "celesnity_app"."authorization_groups"("id") ON DELETE CASCADE,
  CONSTRAINT "catalog_access_grants_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE
);
CREATE INDEX "catalog_access_grants_organization_id_resource_type_resource_id_idx" ON "celesnity_app"."catalog_access_grants"("organization_id", "resource_type", "resource_id");
CREATE INDEX "catalog_access_grants_group_id_idx" ON "celesnity_app"."catalog_access_grants"("group_id");
CREATE INDEX "catalog_access_grants_identity_id_idx" ON "celesnity_app"."catalog_access_grants"("identity_id");

CREATE TABLE "celesnity_app"."agent_room_bindings" (
  "room_id" VARCHAR(255) NOT NULL,
  "organization_id" UUID NOT NULL,
  "bound_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_room_bindings_pkey" PRIMARY KEY ("room_id"),
  CONSTRAINT "agent_room_bindings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "agent_room_bindings_bound_by_id_fkey" FOREIGN KEY ("bound_by_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE RESTRICT
);
CREATE INDEX "agent_room_bindings_organization_id_idx" ON "celesnity_app"."agent_room_bindings"("organization_id");
