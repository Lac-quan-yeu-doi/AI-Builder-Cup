UPDATE "celesnity_app"."tutorial_definitions"
SET
  "steps" = jsonb_set("steps", '{0,destinationHref}', '"/chat"'::jsonb, false),
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-query-first-result';
