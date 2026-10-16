import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type {
  IConnectionConfigCodec,
  NormalizedConnectionDetails,
} from '@application/database-service/interfaces/i-connection-config-codec';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { ConnectionEndpoint } from '@domain/database-service/value-objects/connection-value-objects';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { PostgresConnectionMessage } from '@infrastructure/dbms/postgresql/postgres-connection.messages';
import {
  DEFAULT_POSTGRES_PORT,
  PostgresConnectionUrl,
} from '@infrastructure/dbms/postgresql/postgres-connection-url';
import {
  PostgresConnectionOptions,
  PostgresDatabaseName,
  PostgresDatabaseUsername,
  PostgresSslMode,
  type PostgresConnectionOptionsValue,
} from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';
import { PostgresPassword } from '@infrastructure/dbms/postgresql/postgres-password';

export const POSTGRESQL_CONFIG_SCHEMA_VERSION = 1;

export interface PostgresConfigValues {
  readonly endpoint: ConnectionEndpoint;
  readonly databaseName: PostgresDatabaseName;
  readonly username: PostgresDatabaseUsername;
  readonly sslMode: PostgresSslMode;
  readonly options: PostgresConnectionOptions;
}

interface PostgresDetailsInput {
  readonly connectionUrl?: string;
  readonly host?: string;
  readonly port?: number;
  readonly databaseName?: string;
  readonly username?: string;
  readonly password?: string;
  readonly sslMode?: string;
  readonly options?: PostgresConnectionOptionsValue;
}

interface ExistingPostgresDetails {
  readonly endpoint: ConnectionEndpoint;
  readonly databaseName: PostgresDatabaseName;
  readonly username: PostgresDatabaseUsername;
  readonly sslMode: PostgresSslMode;
  readonly options: PostgresConnectionOptions;
}

interface AssembledPostgresDetails extends ExistingPostgresDetails {
  readonly password?: PostgresPassword;
}

/**
 * PostgreSQL's adapter for the DBMS-neutral configuration contract.
 *
 * URL parsing, structured-field merging, and PostgreSQL value-object assembly
 * live here with the adapter. The generic application layer only knows that a
 * codec accepts an unknown payload and returns canonical config plus an opaque
 * credential.
 */
export class PostgresConfigCodec implements IConnectionConfigCodec {
  public normalize(
    input: unknown,
    existing?: NormalizedConnectionConfig,
  ): NormalizedConnectionDetails {
    const existingDetails = existing === undefined ? undefined : this.decode(existing);
    const details = this.assemble(this.asInput(input), existingDetails);
    const config = this.toConfig(details);

    return {
      config,
      destination: this.destination(details.endpoint),
      credential:
        details.password === undefined
          ? undefined
          : PlaintextCredentialPayload.create(
              POSTGRESQL_CONFIG_SCHEMA_VERSION,
              details.password.value,
            ),
    };
  }

  public restore(
    config: NormalizedConnectionConfig,
  ): Omit<NormalizedConnectionDetails, 'credential'> {
    const details = this.decode(config);
    return {
      config,
      destination: this.destination(details.endpoint),
    };
  }

  /** Decodes validated generic state for the PostgreSQL probe and adapter. */
  public decode(config: NormalizedConnectionConfig): PostgresConfigValues {
    if (config.schemaVersion !== POSTGRESQL_CONFIG_SCHEMA_VERSION) {
      throw ConnectionError.validation(ConnectionMessage.configSchemaVersionInvalid);
    }

    const record = config.toRecord();
    const options = this.options(record.options);
    const details = this.assemble({
      host: this.stringField(record.host),
      port: this.numberField(record.port),
      databaseName: this.stringField(record.databaseName),
      username: this.stringField(record.username),
      sslMode: this.stringField(record.sslMode),
      options,
    });

    return {
      endpoint: details.endpoint,
      databaseName: details.databaseName,
      username: details.username,
      sslMode: details.sslMode,
      options: details.options,
    };
  }

  private assemble(
    input: PostgresDetailsInput,
    existing?: ExistingPostgresDetails,
  ): AssembledPostgresDetails {
    if (input.connectionUrl !== undefined) {
      this.assertUrlOnly(input);
      return this.fromUrl(input.connectionUrl);
    }
    return this.fromFields(input, existing);
  }

  private fromUrl(connectionUrl: string): AssembledPostgresDetails {
    const parsed = PostgresConnectionUrl.parse(connectionUrl);
    return {
      endpoint: parsed.endpoint,
      databaseName: parsed.databaseName,
      username: parsed.username,
      password: parsed.password,
      sslMode: parsed.sslMode,
      options: parsed.options,
    };
  }

  private fromFields(
    input: PostgresDetailsInput,
    existing?: ExistingPostgresDetails,
  ): AssembledPostgresDetails {
    return {
      endpoint: ConnectionEndpoint.create(
        input.host ?? existing?.endpoint.host ?? '',
        input.port ?? existing?.endpoint.port ?? DEFAULT_POSTGRES_PORT,
      ),
      databaseName: PostgresDatabaseName.create(
        input.databaseName ?? existing?.databaseName.value ?? '',
      ),
      username: PostgresDatabaseUsername.create(input.username ?? existing?.username.value ?? ''),
      // An omitted password means "leave the stored credential alone" on update.
      password: PostgresPassword.createOptional(input.password),
      sslMode: PostgresSslMode.create(input.sslMode ?? existing?.sslMode.value ?? 'disable'),
      options: PostgresConnectionOptions.create(input.options ?? existing?.options.toRecord()),
    };
  }

  private toConfig(details: AssembledPostgresDetails): NormalizedConnectionConfig {
    return NormalizedConnectionConfig.create(POSTGRESQL_CONFIG_SCHEMA_VERSION, {
      databaseName: details.databaseName.value,
      host: details.endpoint.host,
      options:
        details.options.applicationName === undefined
          ? {}
          : { applicationName: details.options.applicationName },
      port: details.endpoint.port,
      sslMode: details.sslMode.value,
      username: details.username.value,
    });
  }

  private destination(endpoint: ConnectionEndpoint): {
    host: string;
    port: number;
    engineLabel: string;
  } {
    return { host: endpoint.host, port: endpoint.port, engineLabel: 'PostgreSQL' };
  }

  private asInput(input: unknown): PostgresDetailsInput {
    if (!isRecord(input)) {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }

    this.optionalString(input, 'connectionUrl');
    this.optionalString(input, 'host');
    this.optionalString(input, 'databaseName');
    this.optionalString(input, 'username');
    this.optionalString(input, 'password');
    this.optionalString(input, 'sslMode');
    if (input.port !== undefined && typeof input.port !== 'number') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    if (input.options !== undefined) {
      this.options(input.options);
    }
    return input;
  }

  private assertUrlOnly(input: PostgresDetailsInput): void {
    if (this.hasStructuredFields(input)) {
      throw ConnectionError.validation(PostgresConnectionMessage.urlAndStructuredFields);
    }
  }

  private hasStructuredFields(input: PostgresDetailsInput): boolean {
    return (
      input.host !== undefined ||
      input.port !== undefined ||
      input.databaseName !== undefined ||
      input.username !== undefined ||
      input.password !== undefined ||
      input.sslMode !== undefined ||
      input.options !== undefined
    );
  }

  private optionalString(record: Record<string, unknown>, key: string): void {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
  }

  private stringField(value: unknown): string {
    if (typeof value !== 'string') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    return value;
  }

  private numberField(value: unknown): number {
    if (typeof value !== 'number') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    return value;
  }

  private options(value: unknown): PostgresConnectionOptionsValue {
    if (!isRecord(value)) {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    if (value.applicationName !== undefined && typeof value.applicationName !== 'string') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    return { applicationName: value.applicationName };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
