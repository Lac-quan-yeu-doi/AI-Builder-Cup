SET ROLE celesnity_app_owner;

-- A source and a pipeline now state which Iceberg database they belong to,
-- rather than the answer being derived from a pipeline's target node. Deriving
-- it left a freshly connected source belonging to nothing until some pipeline
-- happened to read it, and a draft pipeline belonging to nothing at all.
--
-- Nullable on purpose: the column names a Trino namespace, which lives outside
-- this database and cannot be foreign-keyed, and every existing row predates
-- the concept. A null reads as "not filed under any database yet".
ALTER TABLE celesnity_app.database_services
  ADD COLUMN database_name VARCHAR(120);

ALTER TABLE celesnity_app.pipelines
  ADD COLUMN database_name VARCHAR(120);

CREATE INDEX database_services_database_name_idx
  ON celesnity_app.database_services (database_name);

CREATE INDEX pipelines_database_name_idx
  ON celesnity_app.pipelines (database_name);

RESET ROLE;
