ALTER TABLE celesnity_app.executions
  ADD COLUMN output_condition_plan JSONB,
  ADD COLUMN output_facts JSONB,
  ADD COLUMN output_facts_error TEXT;

ALTER TABLE celesnity_app.executions
  ADD CONSTRAINT executions_output_condition_plan_object_check
    CHECK (output_condition_plan IS NULL OR jsonb_typeof(output_condition_plan) = 'object'),
  ADD CONSTRAINT executions_output_facts_object_check
    CHECK (output_facts IS NULL OR jsonb_typeof(output_facts) = 'object');
