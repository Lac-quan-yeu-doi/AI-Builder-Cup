UPDATE "celesnity_app"."tutorial_definitions" AS definition
SET
  "metadata" = jsonb_set(
    jsonb_set("metadata", '{stepCount}', '21'::jsonb),
    '{estimatedMinutes}',
    '16'::jsonb
  ),
  "steps" = (
    SELECT jsonb_agg(ordered_step.step ORDER BY ordered_step.sort_order)
    FROM (
      SELECT
        CASE
          WHEN (existing.step ->> 'order')::INTEGER >= 16 THEN jsonb_set(
            existing.step,
            '{order}',
            to_jsonb((existing.step ->> 'order')::INTEGER + 1)
          )
          ELSE existing.step
        END AS step,
        existing.ordinality * 2 AS sort_order
      FROM jsonb_array_elements(definition."steps") WITH ORDINALITY AS existing(step, ordinality)

      UNION ALL

      SELECT
        '{"id":"database-onboarding-test-saved-connection","order":16,"title":"Test the saved connection","instructionalContent":"Verify the saved PostgreSQL source before assigning a crawler. A crawler cannot read a source until this connection test succeeds.","destinationFeature":"CATALOG_DATABASES","destinationHref":"/databases/:database/sources/:sourceId","requiredAction":{"id":"test-database-connection","accessibleName":"Test connection"},"targetControl":{"id":"test-saved-database-source","accessibleName":"Test connection","selector":"[data-tutorial-target=\"test-saved-database-source\"]"}}'::jsonb,
        31
    ) AS ordered_step
  ),
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-connections-basics';

-- The new verification step sits inside the existing ordered prefix. Restart
-- checkpoints so active runs cannot skip it after this revision is published.
UPDATE "celesnity_app"."tutorial_progress"
SET
  "status" = 'NOT_STARTED',
  "current_step_id" = 'database-onboarding-open-create',
  "completed_step_ids" = ARRAY[]::TEXT[],
  "context_selections" = '[]'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "tutorial_id" = 'tutorial-connections-basics';
