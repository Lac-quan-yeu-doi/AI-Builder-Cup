CREATE TABLE "celesnity_app"."data_workflow_watch_source_cdc_windows" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "opened_at" TIMESTAMPTZ(6) NOT NULL,
  "closes_at" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "event_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_cdc_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_cdc_windows_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_cdc_windows_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_windows_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_windows"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_windows_open_source_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_windows"("watch_source_id", "organization_id")
  WHERE "status" = 'OPEN';
CREATE INDEX "data_workflow_watch_source_cdc_windows_due_idx"
  ON "celesnity_app"."data_workflow_watch_source_cdc_windows"("status", "closes_at", "id");
CREATE INDEX "data_workflow_watch_source_cdc_windows_source_idx"
  ON "celesnity_app"."data_workflow_watch_source_cdc_windows"("organization_id", "watch_source_id", "status", "closes_at");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_cdc_relations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "window_id" UUID NOT NULL,
  "schema_name" VARCHAR(255) NOT NULL,
  "table_name" VARCHAR(255) NOT NULL,
  "change_types" TEXT[] NOT NULL,
  "event_count" INTEGER NOT NULL DEFAULT 0,
  "first_event_at" TIMESTAMPTZ(6) NOT NULL,
  "last_event_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_cdc_relations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_cdc_relations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_cdc_relations_window_id_organization_id_fkey"
    FOREIGN KEY ("window_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_source_cdc_windows"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_relations_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_relations"("id", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_relations_window_relation_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_relations"("window_id", "schema_name", "table_name", "organization_id");
CREATE INDEX "data_workflow_watch_source_cdc_relations_window_idx"
  ON "celesnity_app"."data_workflow_watch_source_cdc_relations"("organization_id", "window_id");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_cdc_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "window_id" UUID NOT NULL,
  "watch_source_id" UUID NOT NULL,
  "connector_id" VARCHAR(255) NOT NULL,
  "topic" VARCHAR(512) NOT NULL,
  "partition" INTEGER NOT NULL,
  "position_fingerprint" VARCHAR(255) NOT NULL,
  "schema_name" VARCHAR(255) NOT NULL,
  "table_name" VARCHAR(255) NOT NULL,
  "operation" VARCHAR(16) NOT NULL,
  "committed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_workflow_watch_source_cdc_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_cdc_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_cdc_events_window_id_organization_id_fkey"
    FOREIGN KEY ("window_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_source_cdc_windows"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_workflow_watch_source_cdc_events_watch_source_id_organization_id_fkey"
    FOREIGN KEY ("watch_source_id", "organization_id") REFERENCES "celesnity_app"."data_workflow_watch_sources"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE
 );
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_events_position_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_events"("watch_source_id", "connector_id", "topic", "partition", "position_fingerprint", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_events_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_events"("id", "organization_id");
CREATE INDEX "data_workflow_watch_source_cdc_events_window_idx"
  ON "celesnity_app"."data_workflow_watch_source_cdc_events"("organization_id", "window_id");

CREATE TABLE "celesnity_app"."data_workflow_watch_source_cdc_checkpoints" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "connector_id" VARCHAR(255) NOT NULL,
  "topic" VARCHAR(512) NOT NULL,
  "partition" INTEGER NOT NULL,
  "position_fingerprint" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "data_workflow_watch_source_cdc_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_workflow_watch_source_cdc_checkpoints_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "celesnity_app"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_checkpoints_position_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_checkpoints"("connector_id", "topic", "partition", "organization_id");
CREATE UNIQUE INDEX "data_workflow_watch_source_cdc_checkpoints_id_organization_id_key"
  ON "celesnity_app"."data_workflow_watch_source_cdc_checkpoints"("id", "organization_id");
