UPDATE "celesnity_app"."tutorial_progress"
SET
  "completed_step_ids" = array_append("completed_step_ids", 'query-step-open'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-query-first-result'
  AND NOT ('query-step-open' = ANY("completed_step_ids"))
  AND (
    "status" = 'COMPLETED'
    OR 'query-step-run' = ANY("completed_step_ids")
  );

UPDATE "celesnity_app"."tutorial_progress"
SET
  "current_step_id" = 'query-step-open',
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-query-first-result'
  AND "status" <> 'COMPLETED'
  AND NOT ('query-step-run' = ANY("completed_step_ids"));
