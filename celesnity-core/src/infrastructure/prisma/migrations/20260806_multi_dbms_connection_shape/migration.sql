-- This migration introduces the DBMS-neutral connection shape while retaining
-- the old PostgreSQL columns for the compatibility window.
--
-- Credential ciphertext is copied byte-for-byte; no key material is needed by
-- this migration.
SET ROLE celesnity_app_owner;
SET search_path TO celesnity_app;

ALTER TABLE "data_connections"
    ADD COLUMN "dbms_type" VARCHAR(50),
    ADD COLUMN "config" JSONB,
    ADD COLUMN "config_schema_version" INTEGER,
    ADD COLUMN "encrypted_credential_payload" TEXT,
    ADD COLUMN "credential_schema_version" INTEGER;

UPDATE "data_connections"
SET
    "dbms_type" = 'POSTGRESQL',
    "config" = jsonb_build_object(
        'databaseName', "database_name",
        'host', "host",
        'options', COALESCE("connection_options", '{}'::jsonb),
        'port', "port",
        'sslMode', "ssl_mode",
        'username', "username"
    ),
    "config_schema_version" = 1,
    "encrypted_credential_payload" = "encrypted_password",
    "credential_schema_version" = 1;

ALTER TABLE "data_connections"
    ALTER COLUMN "dbms_type" SET NOT NULL,
    ALTER COLUMN "config" SET NOT NULL,
    ALTER COLUMN "config_schema_version" SET NOT NULL,
    ALTER COLUMN "encrypted_credential_payload" SET NOT NULL,
    ALTER COLUMN "credential_schema_version" SET NOT NULL,
    ALTER COLUMN "type" DROP DEFAULT,
    ALTER COLUMN "type" DROP NOT NULL,
    ALTER COLUMN "host" DROP NOT NULL,
    ALTER COLUMN "port" DROP NOT NULL,
    ALTER COLUMN "database_name" DROP NOT NULL,
    ALTER COLUMN "username" DROP NOT NULL,
    ALTER COLUMN "encrypted_password" DROP NOT NULL,
    ALTER COLUMN "ssl_mode" DROP NOT NULL;

-- Return to the login role before Prisma records the migration result.
RESET ROLE;
