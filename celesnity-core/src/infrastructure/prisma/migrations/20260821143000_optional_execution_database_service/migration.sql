SET ROLE celesnity_app_owner;

ALTER TABLE celesnity_app.executions
  ALTER COLUMN database_service_id DROP NOT NULL;

RESET ROLE;
