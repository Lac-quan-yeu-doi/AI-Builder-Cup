BEGIN;

SET LOCAL ROLE celesnity_app_owner;

CREATE TYPE "celesnity_app"."MetadataCrawlerServiceFamily" AS ENUM ('DATABASE');
CREATE TYPE "celesnity_app"."MetadataCrawlerConcurrencyPolicy" AS ENUM ('SKIP');
CREATE TYPE "celesnity_app"."MetadataCrawlerTriggerType" AS ENUM ('SCHEDULED', 'MANUAL');
CREATE TYPE "celesnity_app"."MetadataCrawlerRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED'
);
CREATE TYPE "celesnity_app"."MetadataCrawlerScopeType" AS ENUM ('DATABASE', 'SCHEMA');
CREATE TYPE "celesnity_app"."MetadataCrawlerScopeStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "celesnity_app"."CatalogNamespaceType" AS ENUM ('DATABASE', 'SCHEMA');
CREATE TYPE "celesnity_app"."CatalogRelationType" AS ENUM (
  'TABLE',
  'PARTITIONED_TABLE',
  'VIEW',
  'MATERIALIZED_VIEW',
  'FOREIGN_TABLE'
);
CREATE TYPE "celesnity_app"."CatalogConstraintType" AS ENUM (
  'PRIMARY_KEY',
  'FOREIGN_KEY',
  'UNIQUE',
  'CHECK'
);

CREATE TABLE "celesnity_app"."metadata_crawlers" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "service_family" "celesnity_app"."MetadataCrawlerServiceFamily" NOT NULL DEFAULT 'DATABASE',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "schedule_cron" VARCHAR(120) NOT NULL,
  "schedule_timezone" VARCHAR(100) NOT NULL,
  "next_run_at" TIMESTAMPTZ(6) NOT NULL,
  "concurrency_policy" "celesnity_app"."MetadataCrawlerConcurrencyPolicy" NOT NULL DEFAULT 'SKIP',
  "timeout_seconds" INTEGER NOT NULL DEFAULT 3600,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "discovery_config" JSONB NOT NULL,
  "config_schema_version" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "metadata_crawlers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metadata_crawlers_timeout_seconds_check" CHECK ("timeout_seconds" BETWEEN 60 AND 86400),
  CONSTRAINT "metadata_crawlers_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "celesnity_app"."database_metadata_crawlers" (
  "crawler_id" UUID NOT NULL,
  "database_service_id" UUID NOT NULL,
  CONSTRAINT "database_metadata_crawlers_pkey" PRIMARY KEY ("crawler_id"),
  CONSTRAINT "database_metadata_crawlers_crawler_id_fkey"
    FOREIGN KEY ("crawler_id") REFERENCES "celesnity_app"."metadata_crawlers" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "database_metadata_crawlers_database_service_id_fkey"
    FOREIGN KEY ("database_service_id") REFERENCES "celesnity_app"."database_services" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "database_metadata_crawlers_database_service_id_key"
  ON "celesnity_app"."database_metadata_crawlers" ("database_service_id");

CREATE TABLE "celesnity_app"."metadata_crawler_runs" (
  "id" UUID NOT NULL,
  "crawler_id" UUID NOT NULL,
  "trigger_type" "celesnity_app"."MetadataCrawlerTriggerType" NOT NULL,
  "status" "celesnity_app"."MetadataCrawlerRunStatus" NOT NULL,
  "deduplication_key" VARCHAR(255) NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6),
  "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "heartbeat_at" TIMESTAMPTZ(6),
  "lease_expires_at" TIMESTAMPTZ(6),
  "worker_id" VARCHAR(160),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "crawler_revision" INTEGER NOT NULL,
  "connector_type_snapshot" VARCHAR(50) NOT NULL,
  "safe_config_snapshot" JSONB NOT NULL,
  "database_count" INTEGER NOT NULL DEFAULT 0,
  "schema_count" INTEGER NOT NULL DEFAULT 0,
  "relation_count" INTEGER NOT NULL DEFAULT 0,
  "column_count" INTEGER NOT NULL DEFAULT 0,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "unchanged_count" INTEGER NOT NULL DEFAULT 0,
  "deleted_count" INTEGER NOT NULL DEFAULT 0,
  "warning_count" INTEGER NOT NULL DEFAULT 0,
  "error_category" VARCHAR(40),
  "error_summary" TEXT,
  "log_object_key" VARCHAR(1000),
  CONSTRAINT "metadata_crawler_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metadata_crawler_runs_crawler_id_fkey"
    FOREIGN KEY ("crawler_id") REFERENCES "celesnity_app"."metadata_crawlers" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "metadata_crawler_runs_attempt_check" CHECK ("attempt" >= 0),
  CONSTRAINT "metadata_crawler_runs_counts_check" CHECK (
    "database_count" >= 0 AND "schema_count" >= 0 AND "relation_count" >= 0 AND
    "column_count" >= 0 AND "created_count" >= 0 AND "updated_count" >= 0 AND
    "unchanged_count" >= 0 AND "deleted_count" >= 0 AND "warning_count" >= 0
  )
);
CREATE UNIQUE INDEX "metadata_crawler_runs_deduplication_key_key"
  ON "celesnity_app"."metadata_crawler_runs" ("deduplication_key");
CREATE UNIQUE INDEX "metadata_crawler_runs_one_active_per_crawler"
  ON "celesnity_app"."metadata_crawler_runs" ("crawler_id")
  WHERE "status" IN ('QUEUED', 'RUNNING');
CREATE INDEX "metadata_crawler_runs_status_queued_at_idx"
  ON "celesnity_app"."metadata_crawler_runs" ("status", "queued_at");
CREATE INDEX "metadata_crawler_runs_lease_expires_at_status_idx"
  ON "celesnity_app"."metadata_crawler_runs" ("lease_expires_at", "status");

CREATE TABLE "celesnity_app"."metadata_crawler_run_scopes" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "scope_key" VARCHAR(2048) NOT NULL,
  "scope_type" "celesnity_app"."MetadataCrawlerScopeType" NOT NULL,
  "status" "celesnity_app"."MetadataCrawlerScopeStatus" NOT NULL,
  "discovered_count" INTEGER NOT NULL DEFAULT 0,
  "relation_count" INTEGER NOT NULL DEFAULT 0,
  "column_count" INTEGER NOT NULL DEFAULT 0,
  "error_category" VARCHAR(40),
  "error_summary" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  CONSTRAINT "metadata_crawler_run_scopes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metadata_crawler_run_scopes_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "metadata_crawler_run_scopes_counts_check" CHECK (
    "discovered_count" >= 0 AND "relation_count" >= 0 AND "column_count" >= 0
  )
);
CREATE UNIQUE INDEX "metadata_crawler_run_scopes_run_id_scope_key_key"
  ON "celesnity_app"."metadata_crawler_run_scopes" ("run_id", "scope_key");
CREATE INDEX "metadata_crawler_run_scopes_scope_key_status_idx"
  ON "celesnity_app"."metadata_crawler_run_scopes" ("scope_key", "status");

CREATE TABLE "celesnity_app"."catalog_namespaces" (
  "id" UUID NOT NULL,
  "database_service_id" UUID NOT NULL,
  "parent_id" UUID,
  "namespace_type" "celesnity_app"."CatalogNamespaceType" NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "canonical_path" VARCHAR(2048) NOT NULL,
  "native_identifier" VARCHAR(1024) NOT NULL,
  "deletion_scope_key" VARCHAR(2048) NOT NULL,
  "description" TEXT,
  "source_hash" CHAR(64) NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_seen_run_id" UUID NOT NULL,
  "last_seen_run_id" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "catalog_namespaces_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_namespaces_database_service_id_fkey"
    FOREIGN KEY ("database_service_id") REFERENCES "celesnity_app"."database_services" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_namespaces_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "celesnity_app"."catalog_namespaces" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_namespaces_first_seen_run_id_fkey"
    FOREIGN KEY ("first_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_namespaces_last_seen_run_id_fkey"
    FOREIGN KEY ("last_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_namespaces_database_service_id_canonical_path_key"
  ON "celesnity_app"."catalog_namespaces" ("database_service_id", "canonical_path");
CREATE INDEX "catalog_namespaces_database_service_id_deletion_scope_key_idx"
  ON "celesnity_app"."catalog_namespaces" ("database_service_id", "deletion_scope_key");

CREATE TABLE "celesnity_app"."catalog_relations" (
  "id" UUID NOT NULL,
  "namespace_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "canonical_path" VARCHAR(2048) NOT NULL,
  "relation_type" "celesnity_app"."CatalogRelationType" NOT NULL,
  "native_identifier" VARCHAR(1024) NOT NULL,
  "deletion_scope_key" VARCHAR(2048) NOT NULL,
  "description" TEXT,
  "ddl" TEXT,
  "source_hash" CHAR(64) NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_seen_run_id" UUID NOT NULL,
  "last_seen_run_id" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "catalog_relations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_relations_namespace_id_fkey"
    FOREIGN KEY ("namespace_id") REFERENCES "celesnity_app"."catalog_namespaces" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_relations_first_seen_run_id_fkey"
    FOREIGN KEY ("first_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_relations_last_seen_run_id_fkey"
    FOREIGN KEY ("last_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_relations_namespace_id_name_key"
  ON "celesnity_app"."catalog_relations" ("namespace_id", "name");
CREATE INDEX "catalog_relations_deletion_scope_key_last_seen_run_id_idx"
  ON "celesnity_app"."catalog_relations" ("deletion_scope_key", "last_seen_run_id");

CREATE TABLE "celesnity_app"."catalog_columns" (
  "id" UUID NOT NULL,
  "relation_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "ordinal_position" INTEGER NOT NULL,
  "native_type" VARCHAR(255) NOT NULL,
  "canonical_type" VARCHAR(255) NOT NULL,
  "nullable" BOOLEAN NOT NULL,
  "default_value" TEXT,
  "description" TEXT,
  "source_hash" CHAR(64) NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_seen_run_id" UUID NOT NULL,
  "last_seen_run_id" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "catalog_columns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_columns_relation_id_fkey"
    FOREIGN KEY ("relation_id") REFERENCES "celesnity_app"."catalog_relations" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_columns_first_seen_run_id_fkey"
    FOREIGN KEY ("first_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_columns_last_seen_run_id_fkey"
    FOREIGN KEY ("last_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_columns_relation_id_name_key"
  ON "celesnity_app"."catalog_columns" ("relation_id", "name");
CREATE UNIQUE INDEX "catalog_columns_relation_id_ordinal_position_key"
  ON "celesnity_app"."catalog_columns" ("relation_id", "ordinal_position");

CREATE TABLE "celesnity_app"."catalog_constraints" (
  "id" UUID NOT NULL,
  "relation_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "constraint_type" "celesnity_app"."CatalogConstraintType" NOT NULL,
  "check_expression" TEXT,
  "referenced_relation_path" VARCHAR(2048),
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_seen_run_id" UUID NOT NULL,
  "last_seen_run_id" UUID NOT NULL,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "catalog_constraints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_constraints_relation_id_fkey"
    FOREIGN KEY ("relation_id") REFERENCES "celesnity_app"."catalog_relations" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_constraints_first_seen_run_id_fkey"
    FOREIGN KEY ("first_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "catalog_constraints_last_seen_run_id_fkey"
    FOREIGN KEY ("last_seen_run_id") REFERENCES "celesnity_app"."metadata_crawler_runs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "catalog_constraints_relation_id_name_key"
  ON "celesnity_app"."catalog_constraints" ("relation_id", "name");

CREATE TABLE "celesnity_app"."catalog_constraint_columns" (
  "id" UUID NOT NULL,
  "constraint_id" UUID NOT NULL,
  "column_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "referenced_column_name" VARCHAR(255),
  CONSTRAINT "catalog_constraint_columns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_constraint_columns_constraint_id_fkey"
    FOREIGN KEY ("constraint_id") REFERENCES "celesnity_app"."catalog_constraints" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_constraint_columns_column_id_fkey"
    FOREIGN KEY ("column_id") REFERENCES "celesnity_app"."catalog_columns" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_constraint_columns_position_check" CHECK ("position" >= 1)
);
CREATE UNIQUE INDEX "catalog_constraint_columns_constraint_id_position_key"
  ON "celesnity_app"."catalog_constraint_columns" ("constraint_id", "position");
CREATE UNIQUE INDEX "catalog_constraint_columns_constraint_id_column_id_key"
  ON "celesnity_app"."catalog_constraint_columns" ("constraint_id", "column_id");

CREATE INDEX "metadata_crawlers_due_idx"
  ON "celesnity_app"."metadata_crawlers" ("next_run_at", "id")
  WHERE "enabled" = TRUE AND "archived_at" IS NULL;
CREATE INDEX "metadata_crawler_runs_claim_idx"
  ON "celesnity_app"."metadata_crawler_runs" ("queued_at", "id")
  WHERE "status" = 'QUEUED';

COMMIT;
