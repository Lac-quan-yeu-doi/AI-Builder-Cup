ALTER TABLE "celesnity_app"."firmware_releases"
  ALTER COLUMN "artifact_url" DROP NOT NULL,
  ADD COLUMN "artifact_storage_provider" VARCHAR(20),
  ADD COLUMN "artifact_bucket" VARCHAR(255),
  ADD COLUMN "artifact_object_key" VARCHAR(1000),
  ADD COLUMN "artifact_file_name" VARCHAR(255),
  ADD COLUMN "artifact_content_type" VARCHAR(160),
  ADD COLUMN "artifact_size_bytes" INTEGER;

ALTER TABLE "celesnity_app"."firmware_releases"
  ADD CONSTRAINT "firmware_releases_artifact_source_check" CHECK (
    ("artifact_url" IS NOT NULL AND "artifact_storage_provider" IS NULL AND "artifact_bucket" IS NULL AND "artifact_object_key" IS NULL)
    OR
    ("artifact_url" IS NULL AND "artifact_storage_provider" IN ('MINIO', 'GCS') AND "artifact_bucket" IS NOT NULL AND "artifact_object_key" IS NOT NULL)
  ),
  ADD CONSTRAINT "firmware_releases_artifact_size_check" CHECK (
    "artifact_size_bytes" IS NULL OR "artifact_size_bytes" > 0
  );
