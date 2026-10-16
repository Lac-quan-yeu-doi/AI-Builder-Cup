ALTER TABLE "celesnity_app"."authorization_groups"
  ADD COLUMN IF NOT EXISTS "system_key" VARCHAR(80);

ALTER TABLE "celesnity_app"."charts"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID,
  ADD COLUMN IF NOT EXISTS "collection_id" UUID,
  ADD COLUMN IF NOT EXISTS "owner_identity_id" UUID,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "provenance" VARCHAR(20) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS "current_revision_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "legacy_state" VARCHAR(30) NOT NULL DEFAULT 'MIGRATION_REQUIRED',
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "celesnity_app"."chart_collections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "parent_id" UUID,
  "owner_identity_id" UUID,
  "type" VARCHAR(20) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chart_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chart_collections_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "chart_collections_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "celesnity_app"."chart_collections"("id") ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS "celesnity_app"."chart_revisions" (
  "id" UUID NOT NULL,
  "chart_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "query_definition" JSONB NOT NULL,
  "visualization_definition" JSONB NOT NULL,
  "output_schema" JSONB NOT NULL,
  "query_hash" CHAR(64) NOT NULL,
  "created_by_identity_id" UUID NOT NULL,
  "restored_from_revision" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chart_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chart_revisions_chart_id_revision_number_key" UNIQUE ("chart_id", "revision_number"),
  CONSTRAINT "chart_revisions_chart_id_fkey"
    FOREIGN KEY ("chart_id") REFERENCES "celesnity_app"."charts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "celesnity_app"."chart_collection_grants" (
  "id" UUID NOT NULL,
  "collection_id" UUID NOT NULL,
  "authorization_group_id" UUID NOT NULL,
  "access" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chart_collection_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chart_collection_grants_collection_id_authorization_group_id_key"
    UNIQUE ("collection_id", "authorization_group_id"),
  CONSTRAINT "chart_collection_grants_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "celesnity_app"."chart_collections"("id") ON DELETE CASCADE,
  CONSTRAINT "chart_collection_grants_authorization_group_id_fkey"
    FOREIGN KEY ("authorization_group_id") REFERENCES "celesnity_app"."authorization_groups"("id") ON DELETE CASCADE
);

ALTER TABLE "celesnity_app"."charts"
  ADD CONSTRAINT "charts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "celesnity_app"."charts"
  ADD CONSTRAINT "charts_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "celesnity_app"."chart_collections"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "authorization_groups_organization_system_key_unique"
  ON "celesnity_app"."authorization_groups" ("organization_id", "system_key")
  WHERE "system_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "chart_collections_one_root_per_organization"
  ON "celesnity_app"."chart_collections" ("organization_id")
  WHERE "type" = 'ROOT';
CREATE UNIQUE INDEX IF NOT EXISTS "chart_collections_one_personal_per_owner"
  ON "celesnity_app"."chart_collections" ("organization_id", "owner_identity_id")
  WHERE "type" = 'PERSONAL';
CREATE INDEX IF NOT EXISTS "charts_organization_collection_updated_at_index"
  ON "celesnity_app"."charts" ("organization_id", "collection_id", "updated_at");
CREATE INDEX IF NOT EXISTS "chart_collections_organization_parent_name_index"
  ON "celesnity_app"."chart_collections" ("organization_id", "parent_id", "name");
CREATE INDEX IF NOT EXISTS "chart_collection_grants_authorization_group_id_index"
  ON "celesnity_app"."chart_collection_grants" ("authorization_group_id");

UPDATE "celesnity_app"."charts"
SET "legacy_state" = 'MIGRATION_REQUIRED',
    "provenance" = 'LEGACY'
WHERE "current_revision_number" IS NULL;
