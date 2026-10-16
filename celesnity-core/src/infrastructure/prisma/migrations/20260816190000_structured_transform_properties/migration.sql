SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

UPDATE "celesnity_app"."node_definitions"
SET
  "description" = 'Keep rows that match one or more typed conditions.',
  "output_ports" = '[{"id":"output","label":"Output","dataType":"DATASET","required":false,"maxConnections":null}]'::jsonb,
  "property_panel" = '{"sections":[{"id":"general","title":"General","fields":[{"key":"name","label":"Name","component":"TEXT_INPUT","required":true,"description":"Display name for this transformation node."}]},{"id":"transformation","title":"Transformation","fields":[{"key":"combination","label":"Combine conditions","component":"RADIO","required":true,"defaultValue":"AND","options":[{"label":"All conditions (AND)","value":"AND"},{"label":"Any condition (OR)","value":"OR"}]},{"key":"conditions","label":"Filter conditions","component":"FILTER_BUILDER","required":true,"description":"Choose a field, operator, and typed comparison value."}]}]}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'FILTER';

UPDATE "celesnity_app"."node_definitions"
SET "property_panel" = jsonb_set(
      "property_panel",
      '{sections,1,fields,0,component}',
      '"COLUMN_MAPPING_BUILDER"'::jsonb
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'CHANGE_SCHEMA';

UPDATE "celesnity_app"."node_definitions"
SET "property_panel" = jsonb_set(
      "property_panel",
      '{sections,1,fields,1,component}',
      '"ORDER_BY_BUILDER"'::jsonb
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'DROP_DUPLICATES';

UPDATE "celesnity_app"."node_definitions"
SET "property_panel" = jsonb_set(
      jsonb_set(
        "property_panel",
        '{sections,1,fields,2,component}',
        '"TYPED_VALUE"'::jsonb
      ),
      '{sections,1,fields,2,visibleWhen}',
      '{"field":"strategy","equals":"LITERAL"}'::jsonb
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'FILL_MISSING_VALUES';

UPDATE "celesnity_app"."node_definitions"
SET "property_panel" = jsonb_set(
      "property_panel",
      '{sections,1,fields,1,component}',
      '"AGGREGATION_BUILDER"'::jsonb
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'AGGREGATE';

RESET ROLE;
