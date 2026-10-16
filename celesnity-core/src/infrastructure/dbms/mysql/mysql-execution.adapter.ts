import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { IExecutionConnectionAdapter } from '@application/database-service/interfaces/i-execution-connection-adapter';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  MYSQL_CONFIG_SCHEMA_VERSION,
  type MysqlConfigCodec,
} from '@infrastructure/dbms/mysql/mysql-config.codec';

/** Builds the DBMS-neutral execution descriptor consumed by Spark. */
export class MysqlExecutionAdapter implements IExecutionConnectionAdapter {
  public constructor(private readonly codec: MysqlConfigCodec) {}

  public build(
    config: NormalizedConnectionConfig,
    credential: PlaintextCredentialPayload,
  ): ExecutionConnectionDescriptor {
    if (credential.schemaVersion !== MYSQL_CONFIG_SCHEMA_VERSION) {
      throw ConnectionError.validation(ConnectionMessage.credentialPayloadInvalid);
    }

    const values = this.codec.decode(config);
    const authority = values.endpoint.host.includes(':')
      ? `[${values.endpoint.host}]`
      : values.endpoint.host;
    const jdbcUrl = `jdbc:mysql://${authority}:${values.endpoint.port}/${encodeURIComponent(
      values.databaseName.value,
    )}?sslMode=${values.sslMode.value}`;

    return ExecutionConnectionDescriptor.create({
      driverClass: 'com.mysql.cj.jdbc.Driver',
      jdbcUrl,
      publicOptions: {
        SOURCE_MYSQL_URL: jdbcUrl,
        SOURCE_MYSQL_USER: values.username.value,
        MYSQL_URL: jdbcUrl,
        MYSQL_USER: values.username.value,
        CELESNITY_DB_HOST: values.endpoint.host,
        CELESNITY_DB_PORT: String(values.endpoint.port),
        CELESNITY_DB_NAME: values.databaseName.value,
        CELESNITY_DB_SSLMODE: values.sslMode.value,
        CELESNITY_DB_JDBC_URL: jdbcUrl,
      },
      secretOptions: {
        SOURCE_MYSQL_PASSWORD: credential.value,
        MYSQL_PASSWORD: credential.value,
      },
    });
  }
}
