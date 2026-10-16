SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

CREATE TABLE "celesnity_app"."node_definitions" (
    "type" VARCHAR(80) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "icon_key" VARCHAR(120) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "runtime_kind" VARCHAR(50) NOT NULL,
    "input_ports" JSONB NOT NULL,
    "output_ports" JSONB NOT NULL,
    "property_panel" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_definitions_pkey" PRIMARY KEY ("type"),
    CONSTRAINT "node_definitions_category_check"
      CHECK ("category" IN ('SOURCE', 'TRANSFORM', 'TARGET')),
    CONSTRAINT "node_definitions_runtime_kind_check"
      CHECK ("runtime_kind" IN ('SPARK_DATAFRAME')),
    CONSTRAINT "node_definitions_input_ports_check"
      CHECK (jsonb_typeof("input_ports") = 'array'),
    CONSTRAINT "node_definitions_output_ports_check"
      CHECK (jsonb_typeof("output_ports") = 'array'),
    CONSTRAINT "node_definitions_property_panel_check"
      CHECK (jsonb_typeof("property_panel") = 'object')
);

CREATE INDEX "node_definitions_category_enabled_label_idx"
  ON "celesnity_app"."node_definitions"("category", "enabled", "label");

WITH catalog_defaults AS (
  SELECT
    '[{"id":"input","label":"Input","dataType":"DATASET","required":true,"maxConnections":1}]'::jsonb AS input_ports,
    '[{"id":"output","label":"Output","dataType":"DATASET","required":false,"maxConnections":null}]'::jsonb AS output_ports,
    '{"id":"general","title":"General","fields":[{"key":"name","label":"Name","component":"TEXT_INPUT","required":true,"description":"Display name for this transformation node."}]}'::jsonb AS general_section
), definitions(type, label, description, icon_key, output_ports, transformation_fields) AS (
  VALUES
    (
      'CHANGE_SCHEMA',
      'Change Schema',
      'Rename, cast, retain, or remove columns before loading the target table.',
      'change_schema',
      NULL::jsonb,
      '[{"key":"mappings","label":"Column mappings","component":"KEY_VALUE","required":true,"description":"Map each source field to a target field and target data type."}]'::jsonb
    ),
    (
      'SELECT_FIELDS',
      'Select Fields',
      'Keep selected columns in the configured output order.',
      'select_fields',
      NULL::jsonb,
      '[{"key":"fields","label":"Fields to keep","component":"MULTI_SELECT","required":true,"description":"Selected input fields; their order defines the output column order."}]'::jsonb
    ),
    (
      'DROP_FIELDS',
      'Drop Fields',
      'Remove selected columns from the dataset.',
      'drop_fields',
      NULL::jsonb,
      '[{"key":"fields","label":"Fields to drop","component":"MULTI_SELECT","required":true}]'::jsonb
    ),
    (
      'RENAME_FIELD',
      'Rename Field',
      'Rename one column without changing its value or data type.',
      'rename_field',
      NULL::jsonb,
      '[{"key":"sourceField","label":"Source field","component":"SELECT","required":true},{"key":"targetField","label":"Target field","component":"TEXT_INPUT","required":true}]'::jsonb
    ),
    (
      'FILTER',
      'Filter',
      'Route rows according to a Spark SQL-compatible boolean condition.',
      'filter',
      '[{"id":"matched","label":"Matched","dataType":"DATASET","required":false,"maxConnections":null},{"id":"rejected","label":"Rejected","dataType":"DATASET","required":false,"maxConnections":null}]'::jsonb,
      '[{"key":"condition","label":"Filter condition","component":"SQL_EDITOR","required":true,"description":"Rows satisfying the expression use matched; all others use rejected."}]'::jsonb
    ),
    (
      'DROP_DUPLICATES',
      'Drop Duplicates',
      'Remove duplicate rows using the complete row or selected match keys.',
      'drop_duplicates',
      NULL::jsonb,
      '[{"key":"matchFields","label":"Match fields","component":"MULTI_SELECT","required":false,"description":"When empty, the complete row is used to detect duplicates."},{"key":"orderBy","label":"Ordering","component":"KEY_VALUE","required":false,"description":"Optional field and direction pairs used to choose the retained row."},{"key":"keep","label":"Record to keep","component":"SELECT","required":true,"defaultValue":"FIRST","options":[{"label":"First","value":"FIRST"},{"label":"Last","value":"LAST"}]}]'::jsonb
    ),
    (
      'DROP_NULL_FIELDS',
      'Drop Null Fields',
      'Remove columns whose values are null for every input row.',
      'drop_null_fields',
      NULL::jsonb,
      '[]'::jsonb
    ),
    (
      'REMOVE_NULL_ROWS',
      'Remove Null Rows',
      'Remove rows when all or any selected columns contain null values.',
      'remove_null_rows',
      NULL::jsonb,
      '[{"key":"fields","label":"Fields","component":"MULTI_SELECT","required":false,"description":"When empty, all input fields are checked."},{"key":"mode","label":"Removal condition","component":"RADIO","required":true,"defaultValue":"ALL","options":[{"label":"All selected fields are null","value":"ALL"},{"label":"Any selected field is null","value":"ANY"}]}]'::jsonb
    ),
    (
      'FILL_MISSING_VALUES',
      'Fill Missing Values',
      'Replace missing values with a literal or a supported statistical value.',
      'fill_missing_values',
      NULL::jsonb,
      '[{"key":"field","label":"Field","component":"SELECT","required":true},{"key":"strategy","label":"Strategy","component":"SELECT","required":true,"defaultValue":"LITERAL","options":[{"label":"Literal value","value":"LITERAL"},{"label":"Mean","value":"MEAN"},{"label":"Median","value":"MEDIAN"},{"label":"Mode","value":"MODE"}]},{"key":"value","label":"Literal value","component":"TEXT_INPUT","required":false,"dependsOn":["strategy"]}]'::jsonb
    ),
    (
      'AGGREGATE',
      'Aggregate',
      'Group rows and calculate SUM, AVG, MIN, MAX, or COUNT values.',
      'aggregate',
      NULL::jsonb,
      '[{"key":"groupBy","label":"Grouping fields","component":"MULTI_SELECT","required":false},{"key":"aggregations","label":"Aggregations","component":"KEY_VALUE","required":true,"description":"Define source field, function, and output field for each calculation."}]'::jsonb
    )
)
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
)
SELECT
  definitions.type,
  'TRANSFORM',
  definitions.label,
  definitions.description,
  definitions.icon_key,
  true,
  'SPARK_DATAFRAME',
  catalog_defaults.input_ports,
  COALESCE(definitions.output_ports, catalog_defaults.output_ports),
  jsonb_build_object(
    'sections',
    jsonb_build_array(
      catalog_defaults.general_section,
      jsonb_build_object(
        'id', 'transformation',
        'title', 'Transformation',
        'fields', definitions.transformation_fields
      )
    )
  )
FROM definitions
CROSS JOIN catalog_defaults
ON CONFLICT ("type") DO NOTHING;

-- Return to the login role before Prisma records the migration result.
RESET ROLE;
