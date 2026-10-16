SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app, public;

CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "graph" JSONB NOT NULL,
    "created_by_id" VARCHAR(120) NOT NULL,
    "created_by_display_name" VARCHAR(200) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipelines_status_check" CHECK ("status" = 'DRAFT'),
    CONSTRAINT "pipelines_version_check" CHECK ("version" >= 1),
    CONSTRAINT "pipelines_graph_check" CHECK (jsonb_typeof("graph") = 'object')
);

CREATE UNIQUE INDEX "pipelines_active_name_key"
ON "pipelines" (LOWER("name")) WHERE "archived_at" IS NULL;

CREATE INDEX "pipelines_status_updated_at_idx" ON "pipelines"("status", "updated_at");

-- Return to the login role before Prisma records the migration result.
RESET ROLE;
