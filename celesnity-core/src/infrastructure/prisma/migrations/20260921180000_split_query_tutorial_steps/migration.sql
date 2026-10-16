UPDATE "celesnity_app"."tutorial_definitions"
SET
  "metadata" = jsonb_set("metadata", '{stepCount}', '2'::jsonb, false),
  "steps" = '[{"id":"query-step-open","order":1,"title":"Open Query","instructionalContent":"Open Query from the workspace rail to enter the SQL workspace.","destinationFeature":"HOME","destinationHref":"/","targetControl":{"id":"nav-query","accessibleName":"Query","selector":"a[href=\"/sql\"]"}},{"id":"query-step-run","order":2,"title":"Run a statement","instructionalContent":"Enter a SELECT against a catalog namespace and run it. The result panel reports the status, the elapsed time, and the returned columns.","destinationFeature":"QUERY","destinationHref":"/sql","requiredAction":{"id":"run-query","accessibleName":"Run query"},"targetControl":{"id":"run-query-button","accessibleName":"Run query","selector":"[data-tutorial-target=\"run-query\"]"}}]'::jsonb,
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-query-first-result';
