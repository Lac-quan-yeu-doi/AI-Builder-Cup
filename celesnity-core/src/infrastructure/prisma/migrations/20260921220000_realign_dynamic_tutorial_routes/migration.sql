-- Older Web clients resumed route templates literally (for example,
-- /databases/:database). Return affected active runs to the last static route,
-- where the member can reopen the database and establish concrete route memory.
UPDATE "celesnity_app"."tutorial_definitions"
SET
  "steps" = jsonb_set(
    jsonb_set(
      "steps",
      '{5,destinationHref}',
      '"/databases/:database?tab=sources&create=true"'::jsonb
    ),
    '{9,destinationHref}',
    '"/databases/:database/sources/:sourceId?tab=scan&assignCrawler=true"'::jsonb
  ),
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-connections-basics';

UPDATE "celesnity_app"."tutorial_progress"
SET
  "current_step_id" = 'database-onboarding-open-database',
  "completed_step_ids" = ARRAY[
    'database-onboarding-open-create',
    'database-onboarding-save-database'
  ]::TEXT[],
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-connections-basics'
  AND "status" IN ('IN_PROGRESS', 'PAUSED')
  AND "current_step_id" IN (
    'database-onboarding-open-sources',
    'database-onboarding-open-connection',
    'database-onboarding-save-connection',
    'database-onboarding-open-source',
    'database-onboarding-open-scan',
    'database-onboarding-open-crawler-dialog',
    'database-onboarding-save-crawler',
    'database-onboarding-run-crawler',
    'database-onboarding-browse-schema'
  );
