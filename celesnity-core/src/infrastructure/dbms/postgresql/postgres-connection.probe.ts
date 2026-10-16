import { Client, type ClientConfig } from 'pg';

import type {
  ConnectionProbeInput,
  ConnectionTestResult,
  IConnectionProbe,
} from '@application/database-service/interfaces/i-connection-probe';
import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { ConnectionMessage } from '@domain/database-service/errors/connection.messages';
import { VerificationStatusValue } from '@domain/database-service/value-objects/connection-value-objects';
import {
  POSTGRESQL_CONFIG_SCHEMA_VERSION,
  type PostgresConfigCodec,
  type PostgresConfigValues,
} from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresSslModeValue } from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';

type EffectiveSslMode = Exclude<PostgresSslModeValue, PostgresSslModeValue.PREFER>;

export interface PostgresClient {
  connect(): Promise<unknown>;
  query(statement: string): Promise<unknown>;
  end(): Promise<void>;
}

export type PostgresClientFactory = (config: ClientConfig) => PostgresClient;

export interface PostgresConnectionProbeDependencies {
  readonly timeoutMilliseconds: number;
  readonly createClient?: PostgresClientFactory;
  readonly now?: () => Date;
}

/** PostgreSQL connection verification behind the generic probe port. */
export class PostgresConnectionProbe implements IConnectionProbe {
  private readonly createClient: PostgresClientFactory;
  private readonly now: () => Date;

  public constructor(
    private readonly codec: PostgresConfigCodec,
    private readonly dependencies: PostgresConnectionProbeDependencies,
  ) {
    this.createClient =
      dependencies.createClient ?? ((config: ClientConfig): PostgresClient => new Client(config));
    this.now = dependencies.now ?? ((): Date => new Date());
  }

  public async test(input: ConnectionProbeInput): Promise<ConnectionTestResult> {
    if (input.credential.schemaVersion !== POSTGRESQL_CONFIG_SCHEMA_VERSION) {
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
    values: PostgresConfigValues,
    password: string,
    address: string,
  ): Promise<void> {
    if (values.sslMode.value === PostgresSslModeValue.PREFER) {
      try {
        await this.connectAndQuery(values, password, address, PostgresSslModeValue.REQUIRE);
        return;
      } catch (error: unknown) {
        if (!serverDoesNotSupportSsl(error)) {
          throw error;
        }
      }
      await this.connectAndQuery(values, password, address, PostgresSslModeValue.DISABLE);
      return;
    }

    await this.connectAndQuery(values, password, address, values.sslMode.value);
  }

  private async connectAndQuery(
    values: PostgresConfigValues,
    password: string,
    address: string,
    sslMode: EffectiveSslMode,
  ): Promise<void> {
    const client = this.createClient(this.clientConfig(values, password, address, sslMode));
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      try {
        await client.end();
      } catch {
        // Closing is best effort after a failed or timed-out connection attempt.
      }
    }
  }

  private clientConfig(
    values: PostgresConfigValues,
    password: string,
    address: string,
    sslMode: EffectiveSslMode,
  ): ClientConfig {
    return {
      host: address,
      port: values.endpoint.port,
      database: values.databaseName.value,
      user: values.username.value,
      password,
      application_name: values.options.applicationName ?? 'celesnity-connection-test',
      connectionTimeoutMillis: this.dependencies.timeoutMilliseconds,
      query_timeout: this.dependencies.timeoutMilliseconds,
      statement_timeout: this.dependencies.timeoutMilliseconds,
      ssl: sslConfiguration(sslMode, values.endpoint.host),
    };
  }
}

function sslConfiguration(mode: EffectiveSslMode, serverName: string): ClientConfig['ssl'] {
  switch (mode) {
    case PostgresSslModeValue.DISABLE:
      return false;
    case PostgresSslModeValue.REQUIRE:
      return { rejectUnauthorized: false, servername: serverName };
    case PostgresSslModeValue.VERIFY_CA:
      return {
        rejectUnauthorized: true,
        servername: serverName,
        checkServerIdentity: () => undefined,
      };
    case PostgresSslModeValue.VERIFY_FULL:
      return { rejectUnauthorized: true, servername: serverName };
  }
}

function failedResult(error: unknown, testedAt: Date): ConnectionTestResult {
  return {
    status: VerificationStatusValue.FAILED,
    testedAt,
    failureReason: safePostgreSqlFailure(error),
  };
}

function safePostgreSqlFailure(error: unknown): string {
  const code = errorCode(error);
  if (code === '28P01' || code === '28000') {
    return 'PostgreSQL rejected the supplied username or password.';
  }
  if (code === '3D000') {
    return 'The requested PostgreSQL database does not exist.';
  }
  if (code === 'ECONNREFUSED') {
    return 'The PostgreSQL destination refused the connection.';
  }
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return 'The PostgreSQL destination could not be reached before the timeout.';
  }
  if (code.startsWith('CERT_') || code.includes('CERT') || code.includes('SELF_SIGNED')) {
    return 'PostgreSQL TLS certificate verification failed.';
  }
  if (serverDoesNotSupportSsl(error)) {
    return 'The PostgreSQL server does not support the selected SSL mode.';
  }
  return 'PostgreSQL connection verification failed.';
}

function isAddressRetryable(error: unknown): boolean {
  return ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(errorCode(error));
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return '';
  }
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code.toUpperCase() : '';
}

function serverDoesNotSupportSsl(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.toLowerCase() === 'the server does not support ssl connections';
}
