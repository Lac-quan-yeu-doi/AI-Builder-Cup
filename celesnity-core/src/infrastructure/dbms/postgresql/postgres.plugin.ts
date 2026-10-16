import type { DatabaseServiceConnector } from '@application/database-service/interfaces/i-database-service-connector-registry';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import type { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import type { PostgresConnectionProbe } from '@infrastructure/dbms/postgresql/postgres-connection.probe';
import type { PostgresExecutionAdapter } from '@infrastructure/dbms/postgresql/postgres-execution.adapter';

export const POSTGRESQL_TYPE = ConnectorType.create('POSTGRESQL');

const POSTGRESQL_DESCRIPTOR = {
  connectorType: POSTGRESQL_TYPE.value,
  label: 'PostgreSQL',
  configSchemaVersion: 1,
  formSchema: {
    fields: [
      { key: 'connectionUrl', label: 'Connection URL', type: 'url', mode: 'url' },
      { key: 'host', label: 'Host', type: 'text', required: true, mode: 'structured' },
      { key: 'port', label: 'Port', type: 'number', required: true, mode: 'structured' },
      {
        key: 'databaseName',
        label: 'Database name',
        type: 'text',
        required: true,
        mode: 'structured',
      },
      { key: 'username', label: 'Username', type: 'text', required: true, mode: 'structured' },
      {
        key: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        secret: true,
        mode: 'structured',
      },
      {
        key: 'sslMode',
        label: 'SSL mode',
        type: 'select',
        required: true,
        mode: 'structured',
        options: [
          { value: 'disable', label: 'Disable' },
          { value: 'prefer', label: 'Prefer' },
          { value: 'require', label: 'Require' },
          { value: 'verify-ca', label: 'Verify CA' },
          { value: 'verify-full', label: 'Verify full' },
        ],
      },
    ],
  },
} as const;

export interface PostgresPluginDependencies {
  readonly configCodec: PostgresConfigCodec;
  readonly probe: PostgresConnectionProbe;
  readonly executionAdapter: PostgresExecutionAdapter;
}

export function createPostgresPlugin(
  dependencies: PostgresPluginDependencies,
): DatabaseServiceConnector {
  return {
    connectorType: POSTGRESQL_TYPE,
    descriptor: POSTGRESQL_DESCRIPTOR,
    configCodec: dependencies.configCodec,
    probe: dependencies.probe,
    executionAdapter: dependencies.executionAdapter,
  };
}
