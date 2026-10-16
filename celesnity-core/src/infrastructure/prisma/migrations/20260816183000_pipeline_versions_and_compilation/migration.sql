SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app, public;

CREATE TABLE "pipeline_versions" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "graph_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pipeline_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipeline_versions_version_number_check" CHECK ("version_number" >= 1),
    CONSTRAINT "pipeline_versions_graph_snapshot_check" CHECK (jsonb_typeof("graph_snapshot") = 'object'),
    CONSTRAINT "pipeline_versions_pipeline_id_fkey"
      FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "pipeline_versions_pipeline_id_version_number_key"
  ON "pipeline_versions"("pipeline_id", "version_number");
CREATE INDEX "pipeline_versions_pipeline_id_created_at_idx"
  ON "pipeline_versions"("pipeline_id", "created_at");

-- Preserve the currently stored graph as the first available historical snapshot.
INSERT INTO "pipeline_versions" (
  "id", "pipeline_id", "version_number", "graph_snapshot", "created_at"
)
SELECT gen_random_uuid(), "id", "version", "graph", "updated_at"
FROM "pipelines"
ON CONFLICT ("pipeline_id", "version_number") DO NOTHING;

CREATE TABLE "pipeline_compiled_artifacts" (
    "id" UUID NOT NULL,
    "pipeline_version_id" UUID NOT NULL,
    "compiler_version" VARCHAR(50) NOT NULL,
    "semantic_graph_sha256" CHAR(64) NOT NULL,
    "bindings_snapshot" JSONB NOT NULL,
    "artifact_bucket" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(1000) NOT NULL,
    "object_version_id" VARCHAR(1024) NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "content_size" INTEGER NOT NULL,
    "source_map" JSONB NOT NULL,
    "compiled_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "pipeline_compiled_artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipeline_compiled_artifacts_pipeline_version_id_fkey"
      FOREIGN KEY ("pipeline_version_id") REFERENCES "pipeline_versions"("id") ON DELETE CASCADE,
    CONSTRAINT "pipeline_compiled_artifacts_bindings_snapshot_check"
      CHECK (jsonb_typeof("bindings_snapshot") = 'object'),
    CONSTRAINT "pipeline_compiled_artifacts_source_map_check"
      CHECK (jsonb_typeof("source_map") = 'object'),
    CONSTRAINT "pipeline_compiled_artifacts_content_size_check" CHECK ("content_size" > 0)
);

CREATE UNIQUE INDEX "pipeline_compiled_artifacts_pipeline_version_id_key"
  ON "pipeline_compiled_artifacts"("pipeline_version_id");
CREATE INDEX "pipeline_compiled_artifacts_graph_compiler_idx"
  ON "pipeline_compiled_artifacts"("semantic_graph_sha256", "compiler_version");

RESET ROLE;
