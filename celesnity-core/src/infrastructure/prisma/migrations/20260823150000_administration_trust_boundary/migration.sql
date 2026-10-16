CREATE TYPE "celesnity_app"."OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'OFFBOARDING', 'CLOSED');
CREATE TYPE "celesnity_app"."IdentityStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "celesnity_app"."OrganizationRole" AS ENUM ('PLATFORM_ADMIN', 'SUPPORT', 'ORG_OWNER', 'ORG_ADMIN', 'DATA_ENGINEER', 'ANALYST', 'VIEWER', 'AUDITOR', 'SERVICE_ACCOUNT');
CREATE TYPE "celesnity_app"."MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

CREATE TABLE "celesnity_app"."organizations" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "home_region" VARCHAR(40) NOT NULL,
  "status" "celesnity_app"."OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "verified_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "celesnity_app"."organizations"("slug");

INSERT INTO "celesnity_app"."organizations" ("id", "slug", "display_name", "home_region", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', 'celesnity-bootstrap', 'Celesnity Bootstrap', 'europe-west1', CURRENT_TIMESTAMP);

CREATE TABLE "celesnity_app"."user_identities" (
  "id" UUID NOT NULL, "provider" VARCHAR(80) NOT NULL, "subject" VARCHAR(128) NOT NULL,
  "email" VARCHAR(320), "display_name" VARCHAR(200), "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "status" "celesnity_app"."IdentityStatus" NOT NULL DEFAULT 'ACTIVE', "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_identities_provider_subject_key" ON "celesnity_app"."user_identities"("provider", "subject");
CREATE INDEX "user_identities_email_idx" ON "celesnity_app"."user_identities"("email");

CREATE TABLE "celesnity_app"."organization_memberships" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "identity_id" UUID NOT NULL,
  "role" "celesnity_app"."OrganizationRole" NOT NULL,
  "status" "celesnity_app"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE', "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "organization_memberships_organization_id_identity_id_key" ON "celesnity_app"."organization_memberships"("organization_id", "identity_id");
CREATE INDEX "organization_memberships_identity_id_status_idx" ON "celesnity_app"."organization_memberships"("identity_id", "status");

CREATE TABLE "celesnity_app"."organization_invitations" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "email" VARCHAR(320) NOT NULL,
  "role" "celesnity_app"."OrganizationRole" NOT NULL, "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL, "accepted_at" TIMESTAMPTZ(6), "revoked_at" TIMESTAMPTZ(6),
  "accepted_by_id" UUID, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_invitations_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "celesnity_app"."organization_invitations"("token_hash");
CREATE INDEX "organization_invitations_organization_id_email_idx" ON "celesnity_app"."organization_invitations"("organization_id", "email");

CREATE TABLE "celesnity_app"."audit_events" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "actor_identity_id" UUID,
  "session_id" VARCHAR(128), "request_id" VARCHAR(128), "event_type" VARCHAR(120) NOT NULL,
  "action" VARCHAR(160) NOT NULL, "resource_type" VARCHAR(120), "resource_id" VARCHAR(255),
  "outcome" VARCHAR(30) NOT NULL, "ip_address_hash" CHAR(64), "user_agent" VARCHAR(512),
  "metadata" JSONB NOT NULL DEFAULT '{}', "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "audit_events_actor_identity_id_fkey" FOREIGN KEY ("actor_identity_id") REFERENCES "celesnity_app"."user_identities"("id") ON DELETE SET NULL
);
CREATE INDEX "audit_events_organization_id_occurred_at_idx" ON "celesnity_app"."audit_events"("organization_id", "occurred_at");
CREATE INDEX "audit_events_actor_identity_id_occurred_at_idx" ON "celesnity_app"."audit_events"("actor_identity_id", "occurred_at");
CREATE INDEX "audit_events_event_type_occurred_at_idx" ON "celesnity_app"."audit_events"("event_type", "occurred_at");

CREATE FUNCTION "celesnity_app"."reject_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events are append-only'; END;
$$;
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "celesnity_app"."audit_events"
FOR EACH ROW EXECUTE FUNCTION "celesnity_app"."reject_audit_event_mutation"();

ALTER TABLE "celesnity_app"."tenants" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."database_services" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."pipelines" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."scripts" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."executions" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."sql_executions" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."outbox_events" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."metadata_crawlers" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."message_blocks" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."mqtt_stream_adapters" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."streaming_provisioning_attempts" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."pipeline_versions" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."pipeline_compiled_artifacts" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."script_versions" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."database_metadata_crawlers" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."metadata_crawler_runs" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."metadata_crawler_run_scopes" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."catalog_namespaces" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."catalog_relations" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."catalog_columns" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."catalog_constraints" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "celesnity_app"."catalog_constraint_columns" ADD COLUMN "organization_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants','mqtt_stream_adapters','streaming_provisioning_attempts','database_services','pipelines','pipeline_versions','pipeline_compiled_artifacts','scripts','script_versions','executions','sql_executions','outbox_events','metadata_crawlers','database_metadata_crawlers','metadata_crawler_runs','metadata_crawler_run_scopes','catalog_namespaces','catalog_relations','catalog_columns','catalog_constraints','catalog_constraint_columns','message_blocks'] LOOP
    EXECUTE format('ALTER TABLE "celesnity_app".%I ADD CONSTRAINT %I FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT', table_name, table_name || '_organization_id_fkey');
    EXECUTE format('CREATE INDEX %I ON "celesnity_app".%I ("organization_id")', table_name || '_organization_id_idx', table_name);
  END LOOP;
END $$;
