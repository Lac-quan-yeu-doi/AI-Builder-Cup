UPDATE "celesnity_app"."chart_collections"
SET
  "name" = 'Our Analytics',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'ROOT'
  AND "name" = 'All Collections';
