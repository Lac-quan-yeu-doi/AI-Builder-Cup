import { createConnection, type Connection, type ConnectionOptions } from 'mysql2/promise';
import { connect as openTcpConnection } from 'node:net';
import type { Duplex } from 'node:stream';

import type {
  ConnectionProbeInput,
  ConnectionTestResult,
  IConnectionProbe,
} from '@application/database-service/interfaces/i-connection-probe';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import {
  MYSQL_CONFIG_SCHEMA_VERSION,
  type MysqlConfigCodec,
  type MysqlConfigValues,
} from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlSslModeValue } from '@infrastructure/dbms/mysql/mysql-connection.value-objects';

type EffectiveSslMode = Exclude<MysqlSslModeValue, MysqlSslModeValue.PREFERRED>;
type MysqlSslConfig = ConnectionOptions['ssl'] | false;

export interface MysqlClient {
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
}

export type MysqlClientFactory = (options: ConnectionOptions) => Promise<MysqlClient>;
export type MysqlTcpStreamFactory = (address: string, port: number) => Duplex;

export interface MysqlConnectionProbeDependencies {
  readonly timeoutMilliseconds: number;
  readonly createClient?: MysqlClientFactory;
  readonly openStream?: MysqlTcpStreamFactory;
  readonly now?: () => Date;
}

/** MySQL connection verification behind the generic probe port. */
export class MysqlConnectionProbe implements IConnectionProbe {
  private readonly createClient: MysqlClientFactory;
  private readonly openStream: MysqlTcpStreamFactory;
  private readonly now: () => Date;

  public constructor(
    private readonly codec: MysqlConfigCodec,
    private readonly dependencies: MysqlConnectionProbeDependencies,
  ) {
    this.createClient =
      dependencies.createClient ??
      ((options: ConnectionOptions): Promise<Connection> => createConnection(options));
    this.openStream =
      dependencies.openStream ??
      ((address: string, port: number): Duplex => openTcpConnection({ host: address, port }));
    this.now = dependencies.now ?? ((): Date => new Date());
  }

  public async test(input: ConnectionProbeInput): Promise<ConnectionTestResult> {
    if (input.credential.schemaVersion !== MYSQL_CONFIG_SCHEMA_VERSION) {
      throw ConnectionError.validation(ConnectionMessage.credentialPayloadInvalid);
    }
    const values = this.codec.decode(input.config);
    let lastError: unknown;
    for (const [index, address] of input.resolvedAddresses.entries()) {
      try {
        await this.connectAtAddress(values, input.credential.value, address);
        return { status: VerificationStatusValue.SUCCEEDED, testedAt: this.now() };
      } catch (error: unknown) {
        lastError = error;
        const hasAnotherAddress = index < input.resolvedAddresses.length - 1;
        if (!hasAnotherAddress || !isAddressRetryable(error)) {
          break;
        }
      }
    }
    return failedResult(lastError, this.now());
  }

  private async connectAtAddress(
    values: MysqlConfigValues,
    password: string,
    address: string,
  ): Promise<void> {
    if (values.sslMode.value === MysqlSslModeValue.PREFERRED) {
      try {
        await this.connectAndQuery(values, password, address, MysqlSslModeValue.REQUIRED);
        return;
      } catch (error: unknown) {
        if (!serverDoesNotSupportSsl(error)) {
          throw error;
        }
      }
      await this.connectAndQuery(values, password, address, MysqlSslModeValue.DISABLED);
      return;
    }

    await this.connectAndQuery(values, password, address, values.sslMode.value);
  }

  private async connectAndQuery(
    values: MysqlConfigValues,
    password: string,
    address: string,
    sslMode: EffectiveSslMode,
  ): Promise<void> {
    let client: MysqlClient | undefined;
    try {
      client = await this.createClient(this.clientOptions(values, password, address, sslMode));
      await client.query('SELECT 1');
    } finally {
      if (client !== undefined) {
        try {
          await client.end();
        } catch {
          // Closing is best effort after a failed or timed-out connection attempt.
        }
      }
    }
  }

  private clientOptions(
    values: MysqlConfigValues,
    password: string,
    address: string,
    sslMode: EffectiveSslMode,
  ): ConnectionOptions {
    return {
      host: values.endpoint.host,
      port: values.endpoint.port,
      database: values.databaseName.value,
      user: values.username.value,
      password,
      connectTimeout: this.dependencies.timeoutMilliseconds,
      enableKeepAlive: false,
      multipleStatements: false,
      ssl: sslConfiguration(sslMode) as ConnectionOptions['ssl'],
      stream: (): Duplex => this.openStream(address, values.endpoint.port),
    };
  }
}

function sslConfiguration(mode: EffectiveSslMode): MysqlSslConfig {
  switch (mode) {
    case MysqlSslModeValue.DISABLED:
      return false;
    case MysqlSslModeValue.REQUIRED:
      return { rejectUnauthorized: false, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_CA:
      return { rejectUnauthorized: true, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_IDENTITY:
      return { rejectUnauthorized: true, verifyIdentity: true };
  }
}

function failedResult(error: unknown, testedAt: Date): ConnectionTestResult {
  return {
    status: VerificationStatusValue.FAILED,
    testedAt,
    failureReason: safeMysqlFailure(error),
  };
}

function safeMysqlFailure(error: unknown): string {
  const code = errorCode(error);
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === '1045') {
    return 'MySQL rejected the supplied username or password.';
  }
  if (code === 'ER_DBACCESS_DENIED_ERROR' || code === '1044') {
    return 'The supplied MySQL user cannot access the requested database.';
  }
  if (code === 'ER_BAD_DB_ERROR' || code === '1049') {
    return 'The requested MySQL database does not exist.';
  }
  if (code === 'ER_SECURE_TRANSPORT_REQUIRED' || code === '3159') {
    return 'The MySQL server requires TLS; choose PREFERRED or a stronger TLS mode.';
  }
  if (code === 'ECONNREFUSED') {
    return 'The MySQL destination refused the connection.';
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return 'The MySQL destination could not be reached before the timeout.';
  }
  if (code === 'HANDSHAKE_NO_SSL_SUPPORT') {
    return 'The MySQL server does not support the selected TLS mode.';
  }
  if (code === 'HANDSHAKE_SSL_ERROR' || code.includes('CERT') || code.includes('SELF_SIGNED')) {
    return 'MySQL TLS certificate verification failed.';
  }
  return 'MySQL connection verification failed.';
}

function isAddressRetryable(error: unknown): boolean {
  return ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(errorCode(error));
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const record = error as { readonly code?: unknown; readonly errno?: unknown };
  if (typeof record.code === 'string') {
    return record.code.toUpperCase();
  }
  if (typeof record.errno === 'number' && Number.isInteger(record.errno)) {
    return String(record.errno);
  }
  if (typeof record.errno === 'string') {
    return record.errno.toUpperCase();
  }
  return '';
}

function serverDoesNotSupportSsl(error: unknown): boolean {
  return errorCode(error) === 'HANDSHAKE_NO_SSL_SUPPORT';
}
