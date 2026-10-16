-- Celesnity application tables are isolated from the Iceberg JDBC catalog
-- while sharing the same PostgreSQL database for this PoC.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'celesnity_app_owner') THEN
        CREATE ROLE celesnity_app_owner NOLOGIN;
    END IF;
END
$$;

GRANT celesnity_app_owner TO CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS celesnity_app AUTHORIZATION celesnity_app_owner;
ALTER SCHEMA celesnity_app OWNER TO celesnity_app_owner;
GRANT USAGE, CREATE ON SCHEMA celesnity_app TO CURRENT_USER;
ALTER DEFAULT PRIVILEGES FOR ROLE celesnity_app_owner IN SCHEMA celesnity_app
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO CURRENT_USER;
ALTER DEFAULT PRIVILEGES FOR ROLE celesnity_app_owner IN SCHEMA celesnity_app
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS iceberg_tables (
    catalog_name VARCHAR(255) NOT NULL,
    table_namespace VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    metadata_location VARCHAR(1000),
    previous_metadata_location VARCHAR(1000),
    record_type VARCHAR(5),
    PRIMARY KEY (catalog_name, table_namespace, table_name)
);

CREATE TABLE IF NOT EXISTS iceberg_namespace_properties (
    catalog_name VARCHAR(255) NOT NULL,
    namespace VARCHAR(255) NOT NULL,
    property_key VARCHAR(255),
    property_value VARCHAR(1000),
    PRIMARY KEY (catalog_name, namespace, property_key)
);
