/*
  Database Service v1 development reset.

  This migration intentionally drops development connection data and the
  script/execution rows that reference it. It must only be applied to the
  confirmed local development database (celesnity_app on localhost:15432).
*/

BEGIN;

SET LOCAL ROLE celesnity_app_owner;
SET LOCAL search_path TO celesnity_app;

ALTER TABLE "celesnity_app"."executions"
  DROP CONSTRAINT IF EXISTS "executions_connection_id_fkey";
ALTER TABLE "celesnity_app"."scripts"
  DROP CONSTRAINT IF EXISTS "scripts_connection_id_fkey";

DELETE FROM "celesnity_app"."executions";
DELETE FROM "celesnity_app"."scripts";
DROP TABLE "celesnity_app"."data_connections";
DROP TYPE IF EXISTS "celesnity_app"."ConnectionType";

ALTER TABLE "celesnity_app"."scripts"
  DROP COLUMN "connection_id";
ALTER TABLE "celesnity_app"."scripts"
  ADD COLUMN "database_service_id" UUID NOT NULL;

ALTER TABLE "celesnity_app"."executions"
  DROP COLUMN "connection_id";
ALTER TABLE "celesnity_app"."executions"
  ADD COLUMN "database_service_id" UUID NOT NULL;

CREATE TABLE "celesnity_app"."database_services" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "connector_type" VARCHAR(50) NOT NULL,
  "config" JSONB NOT NULL,
  "config_schema_version" INTEGER NOT NULL,
  "encrypted_credential_payload" TEXT NOT NULL,
  "credential_schema_version" INTEGER NOT NULL,
  "encryption_iv" VARCHAR(255) NOT NULL,
  "encryption_auth_tag" VARCHAR(255) NOT NULL,
  "encryption_key_version" VARCHAR(50) NOT NULL,
  "verification_status" "celesnity_app"."VerificationStatus" NOT NULL DEFAULT 'UNTESTED',
  "last_tested_at" TIMESTAMPTZ(6),
  "last_test_error" TEXT,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "database_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "database_services_name_key"
  ON "celesnity_app"."database_services"("name");
CREATE INDEX "scripts_database_service_id_idx"
  ON "celesnity_app"."scripts"("database_service_id");

ALTER TABLE "celesnity_app"."scripts"
  ADD CONSTRAINT "scripts_database_service_id_fkey"
  FOREIGN KEY ("database_service_id")
  REFERENCES "celesnity_app"."database_services"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "celesnity_app"."executions"
  ADD CONSTRAINT "executions_database_service_id_fkey"
  FOREIGN KEY ("database_service_id")
  REFERENCES "celesnity_app"."database_services"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
