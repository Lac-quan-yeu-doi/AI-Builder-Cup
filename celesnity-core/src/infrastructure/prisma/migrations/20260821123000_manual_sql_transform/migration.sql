SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

INSERT INTO "celesnity_app"."node_definitions" (
  "type",
  "category",
  "label",
  "description",
  "icon_key",
  "enabled",
  "runtime_kind",
  "input_ports",
  "output_ports",
  "property_panel"
) VALUES (
  'MANUAL_SQL',
  'TRANSFORM',
  'Manual SQL',
  'Transform the upstream dataset with a custom Spark SQL query.',
  'manual_sql',
  true,
  'SPARK_DATAFRAME',
  '[{"id":"input","label":"Input","dataType":"DATASET","required":true,"maxConnections":1}]'::jsonb,
  '[{"id":"output","label":"Output","dataType":"DATASET","required":false,"maxConnections":null}]'::jsonb,
  '{"sections":[{"id":"general","title":"General","fields":[{"key":"name","label":"Name","component":"TEXT_INPUT","required":true,"description":"Display name for this transformation node.","defaultValue":"Manual SQL"}]},{"id":"transformation","title":"Transformation","fields":[{"key":"sql","label":"SQL query","component":"SQL_EDITOR","required":true,"description":"The upstream dataset is available as the temporary view input. Enter one Spark SQL query that returns a dataset."}]}]}'::jsonb
);

RESET ROLE;
