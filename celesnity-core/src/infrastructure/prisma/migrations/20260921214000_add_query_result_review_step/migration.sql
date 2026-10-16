UPDATE "celesnity_app"."tutorial_definitions"
SET
  "metadata" = jsonb_set("metadata", '{stepCount}', '3'::jsonb, false),
  "steps" = '[
    {"id":"query-step-open","order":1,"title":"Open Query","instructionalContent":"Open Query from the workspace rail to enter the SQL workspace.","destinationFeature":"HOME","destinationHref":"/chat","targetControl":{"id":"nav-query","accessibleName":"Query","selector":"a[href=\"/sql\"]"}},
    {"id":"query-step-run","order":2,"title":"Run a statement","instructionalContent":"Enter a SELECT against a catalog namespace and run it. Keep this guide open while the query completes.","destinationFeature":"QUERY","destinationHref":"/sql","requiredAction":{"id":"run-query","accessibleName":"Run query"},"targetControl":{"id":"run-query-button","accessibleName":"Run query","selector":"[data-tutorial-target=\"run-query\"]"}},
    {"id":"query-step-review-result","order":3,"title":"Review the query result","instructionalContent":"Read the returned rows and columns, then check the execution status and statistics. Finish after you have reviewed the result.","destinationFeature":"QUERY","destinationHref":"/sql","targetControl":{"id":"query-results","accessibleName":"Query results","selector":"[data-tutorial-target=\"query-results\"]"}}
  ]'::jsonb,
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-query-first-result';

-- Runs that already submitted the statement should resume at the new review
-- step. Previously completed runs retain their completion state and history.
UPDATE "celesnity_app"."tutorial_progress"
SET
  "current_step_id" = 'query-step-review-result',
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-query-first-result'
  AND "status" <> 'COMPLETED'
  AND 'query-step-run' = ANY("completed_step_ids");

UPDATE "celesnity_app"."tutorial_progress"
SET
  "current_step_id" = 'query-step-review-result',
  "completed_step_ids" = CASE
    WHEN 'query-step-review-result' = ANY("completed_step_ids") THEN "completed_step_ids"
    ELSE array_append("completed_step_ids", 'query-step-review-result')
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-query-first-result'
  AND "status" = 'COMPLETED';
