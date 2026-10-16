import type { DatabaseServiceConnector } from '@application/database-service/interfaces/i-database-service-connector-registry';
import { ConnectorType } from '@domain/database-service/value-objects/connector-type';
import type { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import type { MysqlConnectionProbe } from '@infrastructure/dbms/mysql/mysql-connection.probe';
import type { MysqlExecutionAdapter } from '@infrastructure/dbms/mysql/mysql-execution.adapter';

export const MYSQL_TYPE = ConnectorType.create('MYSQL');

const MYSQL_DESCRIPTOR = {
  connectorType: MYSQL_TYPE.value,
  label: 'MySQL',
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
          { value: 'DISABLED', label: 'Disabled' },
          { value: 'PREFERRED', label: 'Preferred' },
          { value: 'REQUIRED', label: 'Required' },
          { value: 'VERIFY_CA', label: 'Verify CA' },
          { value: 'VERIFY_IDENTITY', label: 'Verify identity' },
        ],
      },
    ],
  },
} as const;

export interface MysqlPluginDependencies {
  readonly configCodec: MysqlConfigCodec;
  readonly probe: MysqlConnectionProbe;
  readonly executionAdapter: MysqlExecutionAdapter;
}

export function createMysqlPlugin(dependencies: MysqlPluginDependencies): DatabaseServiceConnector {
  return {
    connectorType: MYSQL_TYPE,
    descriptor: MYSQL_DESCRIPTOR,
    configCodec: dependencies.configCodec,
    probe: dependencies.probe,
    executionAdapter: dependencies.executionAdapter,
  };
}
