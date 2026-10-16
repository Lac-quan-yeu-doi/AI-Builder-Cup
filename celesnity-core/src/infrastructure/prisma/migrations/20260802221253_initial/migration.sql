-- This migration is intentionally scoped to the application schema.
SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('POSTGRESQL');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNTESTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScriptStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'PREPARING', 'SUBMITTED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "SqlExecutionStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "data_connections" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "ConnectionType" NOT NULL DEFAULT 'POSTGRESQL',
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL,
    "database_name" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "encryption_iv" VARCHAR(255) NOT NULL,
    "encryption_auth_tag" VARCHAR(255) NOT NULL,
    "encryption_key_version" VARCHAR(50) NOT NULL,
    "ssl_mode" VARCHAR(30) NOT NULL,
    "connection_options" JSONB,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'UNTESTED',
    "last_tested_at" TIMESTAMPTZ(6),
    "last_test_error" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "connection_id" UUID NOT NULL,
    "artifact_bucket" VARCHAR(255) NOT NULL,
    "artifact_prefix" VARCHAR(1000) NOT NULL,
    "status" "ScriptStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_version_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "script_versions" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "object_key" VARCHAR(1000) NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "content_size" INTEGER NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "script_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "script_id" UUID NOT NULL,
    "script_version_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "spark_application_id" VARCHAR(255),
    "resource_profile" JSONB,
    "exit_code" INTEGER,
    "error_summary" TEXT,
    "log_object_key" VARCHAR(1000),
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sql_executions" (
    "id" UUID NOT NULL,
    "sql_text" TEXT NOT NULL,
    "catalog" VARCHAR(255) NOT NULL,
    "namespace" VARCHAR(255),
    "status" "SqlExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "trino_query_id" VARCHAR(255),
    "column_metadata" JSONB,
    "row_count" INTEGER,
    "statistics" JSONB,
    "error_code" VARCHAR(255),
    "error_message" TEXT,
    "error_location" JSONB,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sql_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(120) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_name" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_connections_name_key" ON "data_connections"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_current_version_id_key" ON "scripts"("current_version_id");

-- CreateIndex
CREATE INDEX "scripts_connection_id_idx" ON "scripts"("connection_id");

-- CreateIndex
CREATE INDEX "script_versions_script_id_idx" ON "script_versions"("script_id");

-- CreateIndex
CREATE UNIQUE INDEX "script_versions_script_id_version_number_key" ON "script_versions"("script_id", "version_number");

-- CreateIndex
CREATE INDEX "executions_status_queued_at_idx" ON "executions"("status", "queued_at");

-- CreateIndex
CREATE INDEX "executions_script_id_idx" ON "executions"("script_id");

-- CreateIndex
CREATE INDEX "sql_executions_status_queued_at_idx" ON "sql_executions"("status", "queued_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "data_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "script_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_script_version_id_fkey" FOREIGN KEY ("script_version_id") REFERENCES "script_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "data_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Return to the login role before Prisma records the migration result.
RESET ROLE;
