-- An execution result is held by the Query workspace, not tutorial progress.
-- Re-run the statement for active runs upgraded from the two-step revision so
-- the new review step always receives a live result to spotlight.
UPDATE "celesnity_app"."tutorial_progress"
SET
  "current_step_id" = 'query-step-run',
  "completed_step_ids" = array_remove("completed_step_ids", 'query-step-run'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "tutorial_id" = 'tutorial-query-first-result'
  AND "status" <> 'COMPLETED'
  AND "current_step_id" = 'query-step-review-result';
