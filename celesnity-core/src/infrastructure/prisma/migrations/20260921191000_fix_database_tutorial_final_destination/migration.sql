UPDATE "celesnity_app"."tutorial_definitions"
SET
  "steps" = jsonb_set(
    "steps",
    '{11,destinationHref}',
    '"/databases/:database/sources/:sourceId"'::jsonb
  ),
  "revision" = "revision" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'tutorial-connections-basics';
