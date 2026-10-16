CREATE TYPE "celesnity_app"."CdcConnectionSetupMode" AS ENUM ('EXISTING', 'MANAGED');

CREATE TYPE "celesnity_app"."CdcConnectionVerificationStatus" AS ENUM (
  'UNTESTED',
  'READY',
  'SETUP_REQUIRED',
  'FAILED'
);

CREATE TABLE "celesnity_app"."database_service_cdc_connection_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "database_service_id" UUID NOT NULL,
  "connector_type" VARCHAR(50) NOT NULL,
  "config" JSONB NOT NULL,
  "config_schema_version" INTEGER NOT NULL,
  "encrypted_credential_payload" TEXT NOT NULL,
  "credential_schema_version" INTEGER NOT NULL,
  "encryption_iv" VARCHAR(255) NOT NULL,
  "encryption_auth_tag" VARCHAR(255) NOT NULL,
  "encryption_key_version" VARCHAR(50) NOT NULL,
  "setup_mode" "celesnity_app"."CdcConnectionSetupMode" NOT NULL,
  "publication_name" VARCHAR(63),
  "slot_name" VARCHAR(63),
  "verification_status" "celesnity_app"."CdcConnectionVerificationStatus" NOT NULL DEFAULT 'UNTESTED',
  "verification_issue_code" VARCHAR(80),
  "verification_message" TEXT,
  "last_tested_at" TIMESTAMPTZ(6),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "database_service_cdc_connection_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "database_service_cdc_connection_profiles_database_service_id_key"
  ON "celesnity_app"."database_service_cdc_connection_profiles"("database_service_id");

CREATE UNIQUE INDEX "cdc_profile_db_org_key"
  ON "celesnity_app"."database_service_cdc_connection_profiles"("database_service_id", "organization_id");

CREATE INDEX "database_service_cdc_connection_profiles_organization_id_verification_status_idx"
  ON "celesnity_app"."database_service_cdc_connection_profiles"("organization_id", "verification_status");

ALTER TABLE "celesnity_app"."database_service_cdc_connection_profiles"
  ADD CONSTRAINT "database_service_cdc_connection_profiles_database_service_id_organization_id_fkey"
  FOREIGN KEY ("database_service_id", "organization_id")
  REFERENCES "celesnity_app"."database_services"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "celesnity_app"."database_service_cdc_connection_profiles"
  ADD CONSTRAINT "database_service_cdc_connection_profiles_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "celesnity_app"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
