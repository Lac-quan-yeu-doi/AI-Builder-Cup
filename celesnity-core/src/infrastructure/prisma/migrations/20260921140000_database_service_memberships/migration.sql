CREATE TABLE "celesnity_app"."database_service_memberships" (
  "organization_id" UUID NOT NULL,
  "database_name" VARCHAR(120) NOT NULL,
  "database_service_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "database_service_memberships_pkey"
    PRIMARY KEY ("organization_id", "database_name", "database_service_id")
);

CREATE INDEX "database_service_memberships_organization_id_database_service_id_database_name_idx"
  ON "celesnity_app"."database_service_memberships"
    ("organization_id", "database_service_id", "database_name");

CREATE INDEX "database_service_memberships_organization_id_database_name_database_service_id_idx"
  ON "celesnity_app"."database_service_memberships"
    ("organization_id", "database_name", "database_service_id");

ALTER TABLE "celesnity_app"."database_service_memberships"
  ADD CONSTRAINT "database_service_memberships_database_service_id_organization_id_fkey"
  FOREIGN KEY ("database_service_id", "organization_id")
  REFERENCES "celesnity_app"."database_services"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "celesnity_app"."database_service_memberships"
  ADD CONSTRAINT "database_service_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id")
  REFERENCES "celesnity_app"."organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "celesnity_app"."database_service_memberships" (
  "organization_id",
  "database_name",
  "database_service_id"
)
SELECT
  "organization_id",
  btrim("database_name"),
  "id"
FROM "celesnity_app"."database_services"
WHERE "database_name" IS NOT NULL
  AND btrim("database_name") <> ''
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "celesnity_app"."database_services" AS service
    WHERE service."database_name" IS NOT NULL
      AND btrim(service."database_name") <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM "celesnity_app"."database_service_memberships" AS membership
        WHERE membership."organization_id" = service."organization_id"
          AND membership."database_name" = btrim(service."database_name")
          AND membership."database_service_id" = service."id"
      )
  ) THEN
    RAISE EXCEPTION 'database service membership backfill is incomplete';
  END IF;
END $$;

DROP INDEX IF EXISTS "celesnity_app"."database_services_database_name_idx";
ALTER TABLE "celesnity_app"."database_services" DROP COLUMN "database_name";
