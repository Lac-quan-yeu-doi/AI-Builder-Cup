import { Client, type ClientConfig } from 'pg';
import { createConnection, type ConnectionOptions } from 'mysql2/promise';
import { connect as openTcpConnection } from 'node:net';

import type { CdcConnectionRuntimeProfile } from '@application/database-service/read-models/cdc-connection-runtime-profile';
import { CdcConnectionSetupMode } from '@domain/database-service/value-objects/cdc-connection-profile';
import type { CdcPreflightResult } from '@domain/data-workflow-watch-source/models/cdc-connector';

interface PostgresPreflightClient {
  connect(): Promise<unknown>;
  query(
    statement: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Record<string, unknown>[] }>;
  end(): Promise<void>;
}

interface MysqlPreflightClient {
  query(statement: string): Promise<readonly unknown[]>;
  end(): Promise<void>;
}

export interface CdcSourcePreflightDependencies {
  readonly createPostgresClient?: (config: ClientConfig) => PostgresPreflightClient;
  readonly createMysqlClient?: (options: ConnectionOptions) => Promise<MysqlPreflightClient>;
  readonly timeoutMilliseconds?: number;
}

/**
 * Verifies source-side CDC prerequisites without reading source rows.
 * The class is deliberately infrastructure-only: connection material never
 * crosses the application boundary and query results are reduced to safe codes.
 */
export class CdcSourcePreflight {
  private readonly createPostgresClient: NonNullable<
    CdcSourcePreflightDependencies['createPostgresClient']
  >;
  private readonly createMysqlClient: NonNullable<
    CdcSourcePreflightDependencies['createMysqlClient']
  >;
  private readonly timeoutMilliseconds: number;

  public constructor(dependencies: CdcSourcePreflightDependencies = {}) {
    this.createPostgresClient =
      dependencies.createPostgresClient ??
      ((config: ClientConfig): PostgresPreflightClient => new Client(config));
    this.createMysqlClient =
      dependencies.createMysqlClient ??
      (async (options: ConnectionOptions): Promise<MysqlPreflightClient> =>
        await createConnection(options));
    this.timeoutMilliseconds = Math.max(1_000, dependencies.timeoutMilliseconds ?? 5_000);
  }

  public async check(profile: CdcConnectionRuntimeProfile): Promise<CdcPreflightResult> {
    const connectorType = profile.connectorType.trim().toUpperCase();
    if (connectorType === 'POSTGRESQL') {
      if (isKnownPooler(profile.destinationHost)) return directConnectionRequired();
      return this.checkPostgres(profile);
    }
    if (connectorType === 'MYSQL') return this.checkMysql(profile);
    return {
      available: false,
      code: 'UNSUPPORTED_CONNECTOR',
      message: 'CDC is available only for PostgreSQL and MySQL sources.',
      remediation: 'Use polling for this source type.',
    };
  }

  private async checkPostgres(profile: CdcConnectionRuntimeProfile): Promise<CdcPreflightResult> {
    const config = profile.config.toRecord();
    const values = sourceConfig(config, 'disable');
    if (values === undefined) return invalidSourceConfiguration();
    const address = profile.resolvedAddresses[0] ?? profile.destinationHost;
    const client = this.createPostgresClient({
      host: address,
      port: values.port,
      database: values.databaseName,
      user: values.username,
      password: profile.credential.value,
      application_name: 'celesnity-cdc-preflight',
      connectionTimeoutMillis: this.timeoutMilliseconds,
      query_timeout: this.timeoutMilliseconds,
      statement_timeout: this.timeoutMilliseconds,
      ssl: postgresSsl(values.sslMode, values.host),
    });
    try {
      await client.connect();
      const walLevel = await client.query('SHOW wal_level');
      const replication = await client.query(
        'SELECT rolreplication FROM pg_roles WHERE rolname = current_user',
      );
      const wal = stringValue(walLevel.rows[0]?.wal_level).toLowerCase();
      if (wal !== 'logical') {
        return {
          available: false,
          code: 'WAL_LEVEL_NOT_LOGICAL',
          message: 'PostgreSQL logical replication is not enabled.',
          remediation: "Set wal_level to 'logical' and restart PostgreSQL.",
        };
      }
      if (replication.rows[0]?.rolreplication !== true) {
        return {
          available: false,
          code: 'REPLICATION_PRIVILEGE_MISSING',
          message: 'The PostgreSQL user does not have replication privilege.',
          remediation: 'Grant REPLICATION to the Debezium user and retry preflight.',
        };
      }
      if (profile.setupMode === CdcConnectionSetupMode.EXISTING) {
        const publication = await client.query(
          'SELECT 1 FROM pg_publication WHERE pubname = $1',
          [profile.publicationName],
        );
        if (publication.rows.length === 0) {
          return {
            available: false,
            code: 'CDC_PUBLICATION_REQUIRED',
            message: 'The configured PostgreSQL publication is not visible.',
            remediation: 'Create the publication outside Celesnity or update its configured name.',
          };
        }
        const slot = await client.query(
          "SELECT 1 FROM pg_replication_slots WHERE slot_name = $1 AND database = current_database() AND plugin = 'pgoutput'",
          [profile.slotName],
        );
        if (slot.rows.length === 0) {
          return {
            available: false,
            code: 'CDC_SLOT_REQUIRED',
            message: 'The configured PostgreSQL replication slot is not visible or incompatible.',
            remediation: 'Create a pgoutput slot for this database or update its configured name.',
          };
        }
      }
      return ready('PostgreSQL logical replication is available.');
    } catch (error: unknown) {
      return sourceFailure(error, 'PostgreSQL source preflight failed.');
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async checkMysql(profile: CdcConnectionRuntimeProfile): Promise<CdcPreflightResult> {
    const config = profile.config.toRecord();
    const values = sourceConfig(config, 'DISABLED');
    if (values === undefined) return invalidSourceConfiguration();
    const address = profile.resolvedAddresses[0] ?? profile.destinationHost;
    let client: MysqlPreflightClient | undefined;
    try {
      client = await this.createMysqlClient({
        host: values.host,
        port: values.port,
        database: values.databaseName,
        user: values.username,
        password: profile.credential.value,
        connectTimeout: this.timeoutMilliseconds,
        multipleStatements: false,
        enableKeepAlive: false,
        ssl: mysqlSsl(values.sslMode),
        stream: () => openTcpConnection({ host: address, port: values.port }),
      });
      const logBin = rowsFromMysql(await client.query("SHOW VARIABLES LIKE 'log_bin'"));
      const binlogFormat = rowsFromMysql(await client.query("SHOW VARIABLES LIKE 'binlog_format'"));
      if (!isEnabled(variableValue(logBin, 'log_bin'))) {
        return {
          available: false,
          code: 'BINLOG_DISABLED',
          message: 'MySQL binary logging is not enabled.',
          remediation: 'Enable log_bin and restart MySQL before using CDC.',
        };
      }
      if (variableValue(binlogFormat, 'binlog_format').toUpperCase() !== 'ROW') {
        return {
          available: false,
          code: 'BINLOG_FORMAT_NOT_ROW',
          message: 'MySQL binlog_format must be ROW for CDC.',
          remediation: "Set binlog_format to 'ROW' and restart MySQL.",
        };
      }
      const grants = rowsFromMysql(await client.query('SHOW GRANTS FOR CURRENT_USER()'));
      if (!hasReplicationPrivilege(grants)) {
        return {
          available: false,
          code: 'REPLICATION_PRIVILEGE_MISSING',
          message: 'The MySQL user does not have replication privilege.',
          remediation: 'Grant REPLICATION SLAVE and REPLICATION CLIENT to the Debezium user.',
        };
      }
      return ready('MySQL row-based binary logging is available.');
    } catch (error: unknown) {
      return sourceFailure(error, 'MySQL source preflight failed.');
    } finally {
      await client?.end().catch(() => undefined);
    }
  }
}

interface SourceConfigValues {
  readonly host: string;
  readonly port: number;
  readonly databaseName: string;
  readonly username: string;
  readonly sslMode: string;
}

function sourceConfig(
  record: Readonly<Record<string, unknown>>,
  defaultSsl: string,
): SourceConfigValues | undefined {
  const host = stringValue(record.host);
  const databaseName = stringValue(record.databaseName);
  const username = stringValue(record.username);
  const port = record.port;
  if (
    host === '' ||
    databaseName === '' ||
    username === '' ||
    typeof port !== 'number' ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    return undefined;
  }
  return {
    host,
    port,
    databaseName,
    username,
    sslMode: stringValue(record.sslMode) || defaultSsl,
  };
}

function ready(message: string): CdcPreflightResult {
  return { available: true, code: 'READY', message };
}

function directConnectionRequired(): CdcPreflightResult {
  return {
    available: false,
    code: 'DIRECT_CONNECTION_REQUIRED',
    message: 'CDC requires a direct PostgreSQL endpoint; the configured host is a pooler.',
    remediation: 'Use the provider direct connection endpoint for the dedicated CDC profile.',
  };
}

function invalidSourceConfiguration(): CdcPreflightResult {
  return {
    available: false,
    code: 'SOURCE_CONFIGURATION_INVALID',
    message: 'The verified source connection configuration is incomplete.',
    remediation: 'Re-verify the database connection before enabling CDC.',
  };
}

function sourceFailure(error: unknown, message: string): CdcPreflightResult {
  const code = errorCode(error);
  if (code === '28P01' || code === '1045') {
    return {
      available: false,
      code: 'AUTHENTICATION_FAILED',
      message: 'The CDC credential was rejected by the source database.',
      remediation: 'Verify the dedicated CDC username and password.',
    };
  }
  if (code === '42501' || code === '1227' || code === '1142') {
    return {
      available: false,
      code: 'REPLICATION_PRIVILEGE_MISSING',
      message: 'The source user cannot inspect or use the replication settings.',
      remediation: 'Grant the required replication privileges to the Debezium user.',
    };
  }
  return {
    available: false,
    code: 'SOURCE_UNREACHABLE',
    message,
    remediation: 'Verify the source is reachable and the stored connection is still valid.',
  };
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const record = error as { readonly code?: unknown; readonly errno?: unknown };
  if (typeof record.code === 'string') return record.code.toUpperCase();
  if (typeof record.errno === 'number') return String(record.errno);
  return '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function postgresSsl(mode: string, serverName: string): ClientConfig['ssl'] {
  const normalized = mode.trim().toLowerCase();
  if (normalized === 'disable') return false;
  if (normalized === 'verify-ca' || normalized === 'verify-full') {
    return { rejectUnauthorized: true, servername: serverName };
  }
  return { rejectUnauthorized: false, servername: serverName };
}

function mysqlSsl(mode: string): ConnectionOptions['ssl'] {
  const normalized = mode.trim().toUpperCase().replaceAll('-', '_');
  if (normalized === 'DISABLED') return false as unknown as ConnectionOptions['ssl'];
  return {
    rejectUnauthorized: normalized === 'VERIFY_CA' || normalized === 'VERIFY_IDENTITY',
    verifyIdentity: normalized === 'VERIFY_IDENTITY',
  };
}

function rowsFromMysql(value: readonly unknown[]): readonly Record<string, unknown>[] {
  return Array.isArray(value[0]) ? (value[0] as readonly Record<string, unknown>[]) : [];
}

function variableValue(rows: readonly Record<string, unknown>[], name: string): string {
  const row = rows.find((candidate) => stringValue(candidate.Variable_name).toLowerCase() === name);
  return stringValue(row?.Value ?? row?.value);
}

function isEnabled(value: string): boolean {
  return ['1', 'ON', 'TRUE', 'YES'].includes(value.trim().toUpperCase());
}

function hasReplicationPrivilege(rows: readonly Record<string, unknown>[]): boolean {
  const grants = rows
    .flatMap((row) => Object.values(row))
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  return (
    (grants.includes('REPLICATION SLAVE') && grants.includes('REPLICATION CLIENT')) ||
    (grants.includes('BINLOG ADMIN') && grants.includes('BINLOG MONITOR'))
  );
}

function isKnownPooler(host: string): boolean {
  return host.trim().toLowerCase().endsWith('.pooler.supabase.com');
}
