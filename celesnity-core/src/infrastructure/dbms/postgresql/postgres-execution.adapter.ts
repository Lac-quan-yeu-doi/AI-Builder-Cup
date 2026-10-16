import type { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { IExecutionConnectionAdapter } from '@application/database-service/interfaces/i-execution-connection-adapter';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import type { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  POSTGRESQL_CONFIG_SCHEMA_VERSION,
  type PostgresConfigCodec,
} from '@infrastructure/dbms/postgresql/postgres-config.codec';

/** Builds the DBMS-neutral execution descriptor consumed by Spark. */
export class PostgresExecutionAdapter implements IExecutionConnectionAdapter {
  public constructor(private readonly codec: PostgresConfigCodec) {}

  public build(
    config: NormalizedConnectionConfig,
    credential: PlaintextCredentialPayload,
  ): ExecutionConnectionDescriptor {
    if (credential.schemaVersion !== POSTGRESQL_CONFIG_SCHEMA_VERSION) {
      throw ConnectionError.validation(ConnectionMessage.credentialPayloadInvalid);
    }

    const values = this.codec.decode(config);
    const jdbcUrl = buildPostgresJdbcUrl({
      host: values.endpoint.host,
      port: values.endpoint.port,
      databaseName: values.databaseName.value,
      sslMode: values.sslMode.value,
    });

    return ExecutionConnectionDescriptor.create({
      driverClass: 'org.postgresql.Driver',
      jdbcUrl,
      publicOptions: {
        SOURCE_POSTGRES_URL: jdbcUrl,
        SOURCE_POSTGRES_USER: values.username.value,
        POSTGRES_URL: jdbcUrl,
        POSTGRES_USER: values.username.value,
        CELESNITY_DB_HOST: values.endpoint.host,
        CELESNITY_DB_PORT: String(values.endpoint.port),
        CELESNITY_DB_NAME: values.databaseName.value,
        CELESNITY_DB_SSLMODE: values.sslMode.value,
        CELESNITY_DB_JDBC_URL: jdbcUrl,
      },
      secretOptions: {
        SOURCE_POSTGRES_PASSWORD: credential.value,
        POSTGRES_PASSWORD: credential.value,
      },
    });
  }
}

/** Builds a credential-free JDBC URL using PostgreSQL's URL grammar. */
function buildPostgresJdbcUrl(source: {
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly sslMode: string;
}): string {
  const authority = source.host.includes(':') ? `[${source.host}]` : source.host;
  return `jdbc:postgresql://${authority}:${source.port}/${encodeURIComponent(source.databaseName)}?sslmode=${source.sslMode}`;
}
