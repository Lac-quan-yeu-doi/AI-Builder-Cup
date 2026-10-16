import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import type {
  IConnectionConfigCodec,
  NormalizedConnectionDetails,
} from '@application/database-service/interfaces/i-connection-config-codec';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { ConnectionEndpoint } from '@domain/database-service/value-objects/connection-value-objects';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import { MysqlConnectionMessage } from '@infrastructure/dbms/mysql/mysql-connection.messages';
import {
  DEFAULT_MYSQL_PORT,
  MysqlConnectionUrl,
} from '@infrastructure/dbms/mysql/mysql-connection-url';
import {
  MysqlDatabaseName,
  MysqlDatabaseUsername,
  MysqlSslMode,
} from '@infrastructure/dbms/mysql/mysql-connection.value-objects';
import { MysqlPassword } from '@infrastructure/dbms/mysql/mysql-password';

export const MYSQL_CONFIG_SCHEMA_VERSION = 1;

const ALLOWED_INPUT_FIELDS = new Set([
  'connectionUrl',
  'host',
  'port',
  'databaseName',
  'username',
  'password',
  'sslMode',
]);

const CANONICAL_CONFIG_FIELDS = new Set(['databaseName', 'host', 'port', 'sslMode', 'username']);

export interface MysqlConfigValues {
  readonly endpoint: ConnectionEndpoint;
  readonly databaseName: MysqlDatabaseName;
  readonly username: MysqlDatabaseUsername;
  readonly sslMode: MysqlSslMode;
}

interface MysqlDetailsInput {
  readonly connectionUrl?: string;
  readonly host?: string;
  readonly port?: number;
  readonly databaseName?: string;
  readonly username?: string;
  readonly password?: string;
  readonly sslMode?: string;
}

interface ExistingMysqlDetails {
  readonly endpoint: ConnectionEndpoint;
  readonly databaseName: MysqlDatabaseName;
  readonly username: MysqlDatabaseUsername;
  readonly sslMode: MysqlSslMode;
}

interface AssembledMysqlDetails extends ExistingMysqlDetails {
  readonly password?: MysqlPassword;
}

/** MySQL's adapter for the DBMS-neutral connection configuration contract. */
export class MysqlConfigCodec implements IConnectionConfigCodec {
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
          : PlaintextCredentialPayload.create(MYSQL_CONFIG_SCHEMA_VERSION, details.password.value),
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

  /** Decodes validated generic state for the MySQL probe and execution adapter. */
  public decode(config: NormalizedConnectionConfig): MysqlConfigValues {
    if (config.schemaVersion !== MYSQL_CONFIG_SCHEMA_VERSION) {
      throw ConnectionError.validation(ConnectionMessage.configSchemaVersionInvalid);
    }

    const record = config.toRecord();
    this.assertAllowedFields(record, CANONICAL_CONFIG_FIELDS);
    const details = this.assemble({
      host: this.stringField(record.host),
      port: this.numberField(record.port),
      databaseName: this.stringField(record.databaseName),
      username: this.stringField(record.username),
      sslMode: this.stringField(record.sslMode),
    });

    return {
      endpoint: details.endpoint,
      databaseName: details.databaseName,
      username: details.username,
      sslMode: details.sslMode,
    };
  }

  private assemble(
    input: MysqlDetailsInput,
    existing?: ExistingMysqlDetails,
  ): AssembledMysqlDetails {
    if (input.connectionUrl !== undefined) {
      this.assertUrlOnly(input);
      return this.fromUrl(input.connectionUrl);
    }
    return this.fromFields(input, existing);
  }

  private fromUrl(connectionUrl: string): AssembledMysqlDetails {
    const parsed = MysqlConnectionUrl.parse(connectionUrl);
    return {
      endpoint: parsed.endpoint,
      databaseName: parsed.databaseName,
      username: parsed.username,
      password: parsed.password,
      sslMode: parsed.sslMode,
    };
  }

  private fromFields(
    input: MysqlDetailsInput,
    existing?: ExistingMysqlDetails,
  ): AssembledMysqlDetails {
    return {
      endpoint: ConnectionEndpoint.create(
        input.host ?? existing?.endpoint.host ?? '',
        input.port ?? existing?.endpoint.port ?? DEFAULT_MYSQL_PORT,
      ),
      databaseName: MysqlDatabaseName.create(
        input.databaseName ?? existing?.databaseName.value ?? '',
      ),
      username: MysqlDatabaseUsername.create(input.username ?? existing?.username.value ?? ''),
      // An omitted password means "leave the stored credential alone" on update.
      password: MysqlPassword.createOptional(input.password),
      sslMode: MysqlSslMode.create(input.sslMode ?? existing?.sslMode.value ?? 'DISABLED'),
    };
  }

  private toConfig(details: AssembledMysqlDetails): NormalizedConnectionConfig {
    return NormalizedConnectionConfig.create(MYSQL_CONFIG_SCHEMA_VERSION, {
      databaseName: details.databaseName.value,
      host: details.endpoint.host,
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
    return { host: endpoint.host, port: endpoint.port, engineLabel: 'MySQL' };
  }

  private asInput(input: unknown): MysqlDetailsInput {
    if (!isRecord(input)) {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }

    this.assertAllowedFields(input, ALLOWED_INPUT_FIELDS);
    this.optionalString(input, 'connectionUrl');
    this.optionalString(input, 'host');
    this.optionalString(input, 'databaseName');
    this.optionalString(input, 'username');
    this.optionalString(input, 'password');
    this.optionalString(input, 'sslMode');
    if (input.port !== undefined && typeof input.port !== 'number') {
      throw ConnectionError.validation(ConnectionMessage.configValueInvalid);
    }
    return input;
  }

  private assertAllowedFields(
    record: Record<string, unknown>,
    allowedFields: ReadonlySet<string>,
  ): void {
    for (const key of Object.keys(record)) {
      if (!allowedFields.has(key)) {
        throw ConnectionError.validation(MysqlConnectionMessage.fieldUnsupported(key));
      }
    }
  }

  private assertUrlOnly(input: MysqlDetailsInput): void {
    if (this.hasStructuredFields(input)) {
      throw ConnectionError.validation(MysqlConnectionMessage.urlAndStructuredFields);
    }
  }

  private hasStructuredFields(input: MysqlDetailsInput): boolean {
    return (
      input.host !== undefined ||
      input.port !== undefined ||
      input.databaseName !== undefined ||
      input.username !== undefined ||
      input.password !== undefined ||
      input.sslMode !== undefined
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
