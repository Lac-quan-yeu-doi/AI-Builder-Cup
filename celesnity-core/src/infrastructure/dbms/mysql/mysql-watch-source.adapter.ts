import { createConnection, type ConnectionOptions } from 'mysql2/promise';
import { connect as openTcpConnection } from 'node:net';
import type {
  IWatchSourcePollingAdapter,
  WatchSourcePollingInput,
  WatchSourcePollingObservation,
} from '@application/data-workflow-watch-source/interfaces/i-watch-source-polling-adapter';
import { WatchSourcePollingError } from '@application/data-workflow-watch-source/watch-source-polling.errors';
import {
  assertPollInput,
  baselineFromRows,
  cursorValues,
  observationFromRows,
  type WatchSourceCursorRow,
} from '@infrastructure/data-workflow-watch-source/sql-watch-source-polling';
import type { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlSslModeValue } from '@infrastructure/dbms/mysql/mysql-connection.value-objects';

export interface MysqlWatchSourceClient {
  query(statement: string, parameters?: readonly unknown[]): Promise<readonly unknown[]>;
  end(): Promise<void>;
}

export type MysqlWatchSourceClientFactory = (
  options: ConnectionOptions,
) => Promise<MysqlWatchSourceClient>;

export const MYSQL_WATCH_SOURCE_ADAPTER_KEY = 'MYSQL_POLLING';
export const MYSQL_WATCH_SOURCE_ADAPTER_VERSION = '1';

export class MysqlWatchSourceAdapter implements IWatchSourcePollingAdapter {
  public readonly adapterKey = MYSQL_WATCH_SOURCE_ADAPTER_KEY;
  public readonly adapterVersion = MYSQL_WATCH_SOURCE_ADAPTER_VERSION;
  public readonly connectorType = 'MYSQL';

  public constructor(
    private readonly codec: Pick<MysqlConfigCodec, 'decode'>,
    private readonly createClient: MysqlWatchSourceClientFactory = async (options) =>
      await createConnection(options),
  ) {}

  public async establishBaseline(input: WatchSourcePollingInput): Promise<string> {
    assertPollInput(input);
    const values = this.codec.decode(input.profile.config);
    const client = await this.open(input, values);
    try {
      const result = await this.query(
        client,
        baselineSql(
          input.relation.schema,
          input.relation.table,
          input.cursor.changeColumn,
          input.cursor.tieBreakerColumn,
        ),
        [],
        input,
      );
      return baselineFromRows(rowsOf(result));
    } finally {
      await client.end();
    }
  }

  public async poll(
    input: WatchSourcePollingInput,
  ): Promise<WatchSourcePollingObservation | undefined> {
    assertPollInput(input);
    const values = this.codec.decode(input.profile.config);
    const client = await this.open(input, values);
    try {
      const decoded = safeCursorValues(input.checkpoint);
      const result = await this.query(
        client,
        pollSql(
          input.relation.schema,
          input.relation.table,
          input.cursor.changeColumn,
          input.cursor.tieBreakerColumn,
          decoded.length > 0,
        ),
        decoded.length > 0 ? [decoded[0], decoded[0], decoded[1], input.limit] : [input.limit],
        input,
      );
      return observationFromRows(input, rowsOf(result));
    } finally {
      await client.end();
    }
  }

  private async open(
    input: WatchSourcePollingInput,
    values: ReturnType<MysqlConfigCodec['decode']>,
  ): Promise<MysqlWatchSourceClient> {
    const address = input.profile.resolvedAddresses[0] ?? input.profile.destinationHost;
    const timeout = Math.max(1_000, input.deadline.getTime() - Date.now());
    try {
      return await this.createClient({
        host: values.endpoint.host,
        port: values.endpoint.port,
        database: values.databaseName.value,
        user: values.username.value,
        password: input.profile.credential.value,
        connectTimeout: timeout,
        multipleStatements: false,
        enableKeepAlive: false,
        ssl: sslConfiguration(values.sslMode.value),
        stream: () => openTcpConnection({ host: address, port: values.endpoint.port }),
      });
    } catch {
      throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    }
  }

  private async query(
    client: MysqlWatchSourceClient,
    statement: string,
    parameters: readonly unknown[],
    input: WatchSourcePollingInput,
  ): Promise<readonly unknown[]> {
    if (input.signal.aborted || input.deadline.getTime() <= Date.now()) {
      throw new WatchSourcePollingError('SOURCE_TIMEOUT');
    }
    try {
      return await client.query(statement, parameters);
    } catch {
      if (input.signal.aborted || input.deadline.getTime() <= Date.now()) {
        throw new WatchSourcePollingError('SOURCE_TIMEOUT');
      }
      throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    }
  }
}

function baselineSql(schema: string, table: string, change: string, tie: string): string {
  return `SELECT ${quoteIdentifier(change)} AS __watch_change, ${quoteIdentifier(tie)} AS __watch_tie
    FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
    ORDER BY ${quoteIdentifier(change)} DESC, ${quoteIdentifier(tie)} DESC
    LIMIT 1`;
}

function pollSql(
  schema: string,
  table: string,
  change: string,
  tie: string,
  hasCheckpoint: boolean,
): string {
  const changeIdentifier = quoteIdentifier(change);
  const tieIdentifier = quoteIdentifier(tie);
  const predicate = hasCheckpoint
    ? `WHERE (${changeIdentifier} > ? OR (${changeIdentifier} = ? AND ${tieIdentifier} > ?))`
    : '';
  return `SELECT ${changeIdentifier} AS __watch_change, ${tieIdentifier} AS __watch_tie
    FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
    ${predicate}
    ORDER BY ${changeIdentifier} ASC, ${tieIdentifier} ASC
    LIMIT ?`;
}

function safeCursorValues(checkpoint: string): readonly string[] {
  try {
    return cursorValues(checkpoint);
  } catch {
    throw new WatchSourcePollingError('INVALID_CHECKPOINT');
  }
}

function rowsOf(value: readonly unknown[]): readonly WatchSourceCursorRow[] {
  const rows = Array.isArray(value[0]) ? (value[0] as readonly Record<string, unknown>[]) : [];
  return rows.map((row) => ({ change: row.__watch_change, tie: row.__watch_tie }));
}

function quoteIdentifier(value: string): string {
  if (value.trim() === '' || value.includes('\0')) {
    throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
  }
  return `\`${value.replaceAll('`', '``')}\``;
}

function sslConfiguration(mode: MysqlSslModeValue): ConnectionOptions['ssl'] {
  switch (mode) {
    case MysqlSslModeValue.DISABLED:
      return false as unknown as ConnectionOptions['ssl'];
    case MysqlSslModeValue.PREFERRED:
    case MysqlSslModeValue.REQUIRED:
      return { rejectUnauthorized: false, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_CA:
      return { rejectUnauthorized: true, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_IDENTITY:
      return { rejectUnauthorized: true, verifyIdentity: true };
  }
}
