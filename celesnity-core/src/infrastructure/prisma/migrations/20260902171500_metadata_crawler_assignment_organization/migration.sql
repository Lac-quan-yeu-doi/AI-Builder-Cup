-- Prisma query extensions do not process nested creates. Repair assignments
-- that inherited DEFAULT_ORGANIZATION_ID, then enforce that every assignment
-- stays in the organization shared by its crawler and Database Service.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "celesnity_app"."database_metadata_crawlers" assignment
    JOIN "celesnity_app"."database_services" service
      ON service."id" = assignment."database_service_id"
    JOIN "celesnity_app"."metadata_crawlers" crawler
      ON crawler."id" = assignment."crawler_id"
    WHERE service."organization_id" <> crawler."organization_id"
  ) THEN
    RAISE EXCEPTION
      'Cannot repair metadata crawler assignments whose crawler and database service organizations differ';
  END IF;
END $$;

UPDATE "celesnity_app"."database_metadata_crawlers" assignment
SET "organization_id" = service."organization_id"
FROM "celesnity_app"."database_services" service
WHERE service."id" = assignment."database_service_id"
  AND assignment."organization_id" IS DISTINCT FROM service."organization_id";

CREATE OR REPLACE FUNCTION "celesnity_app"."enforce_metadata_crawler_assignment_organization"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "celesnity_app"."database_services" service
    JOIN "celesnity_app"."metadata_crawlers" crawler
      ON crawler."id" = NEW."crawler_id"
    WHERE service."id" = NEW."database_service_id"
      AND service."organization_id" = NEW."organization_id"
      AND crawler."organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION
      'Metadata crawler assignment organization must match its crawler and database service'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "metadata_crawler_assignment_organization_guard"
  ON "celesnity_app"."database_metadata_crawlers";

CREATE TRIGGER "metadata_crawler_assignment_organization_guard"
BEFORE INSERT OR UPDATE OF "crawler_id", "database_service_id", "organization_id"
ON "celesnity_app"."database_metadata_crawlers"
FOR EACH ROW
EXECUTE FUNCTION "celesnity_app"."enforce_metadata_crawler_assignment_organization"();
