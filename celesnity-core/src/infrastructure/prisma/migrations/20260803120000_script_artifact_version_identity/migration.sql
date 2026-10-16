BEGIN;

-- Keep every Phase 3 schema change atomic and scoped to the application schema.
SET LOCAL ROLE celesnity_app_owner;
SET LOCAL search_path TO celesnity_app;

-- Existing version rows have no immutable object-store version identity and cannot
-- be upgraded safely. Lock out concurrent inserts, then abort instead of silently
-- stranding those publications.
LOCK TABLE "script_versions" IN ACCESS EXCLUSIVE MODE;

DO $phase3_preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM "script_versions") THEN
    RAISE EXCEPTION
      'Cannot apply Phase 3 script artifact identity migration: script_versions must be empty so object_version_id can be required.';
  END IF;
END
$phase3_preflight$;

-- Use an explicit monotonic token for optimistic concurrency. The default safely
-- initializes any pre-Phase 3 draft rows.
ALTER TABLE "scripts"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "scripts_revision_nonnegative" CHECK ("revision" >= 0);

-- Preserve the immutable object-store version identity for every script version.
ALTER TABLE "script_versions"
ADD COLUMN "object_version_id" VARCHAR(1024) NOT NULL;

-- Deterministic script artifact keys are globally unique within the artifacts bucket.
CREATE UNIQUE INDEX "script_versions_object_key_key" ON "script_versions"("object_key");

COMMIT;
