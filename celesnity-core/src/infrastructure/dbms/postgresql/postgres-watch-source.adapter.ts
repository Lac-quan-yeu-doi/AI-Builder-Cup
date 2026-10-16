import { Client, type ClientConfig } from 'pg';
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
import type { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresSslModeValue } from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';

export interface PostgresWatchSourceClient {
  connect(): Promise<unknown>;
  query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<{
    readonly rows: readonly Record<string, unknown>[];
  }>;
  end(): Promise<void>;
}

export type PostgresWatchSourceClientFactory = (config: ClientConfig) => PostgresWatchSourceClient;

export const POSTGRES_WATCH_SOURCE_ADAPTER_KEY = 'POSTGRESQL_POLLING';
export const POSTGRES_WATCH_SOURCE_ADAPTER_VERSION = '1';

export class PostgresWatchSourceAdapter implements IWatchSourcePollingAdapter {
  public readonly adapterKey = POSTGRES_WATCH_SOURCE_ADAPTER_KEY;
  public readonly adapterVersion = POSTGRES_WATCH_SOURCE_ADAPTER_VERSION;
  public readonly connectorType = 'POSTGRESQL';

  public constructor(
    private readonly codec: Pick<PostgresConfigCodec, 'decode'>,
    private readonly createClient: PostgresWatchSourceClientFactory = (config) =>
      new Client(config),
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
      return baselineFromRows(result.rows.map(toCursorRow));
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
        decoded.length > 0 ? [...decoded, input.limit] : [input.limit],
        input,
      );
      return observationFromRows(input, result.rows.map(toCursorRow));
    } finally {
      await client.end();
    }
  }

  private async open(
    input: WatchSourcePollingInput,
    values: ReturnType<PostgresConfigCodec['decode']>,
  ): Promise<PostgresWatchSourceClient> {
    const address = input.profile.resolvedAddresses[0] ?? input.profile.destinationHost;
    const timeout = Math.max(1_000, input.deadline.getTime() - Date.now());
    const client = this.createClient({
      host: address,
      port: values.endpoint.port,
      database: values.databaseName.value,
      user: values.username.value,
      password: input.profile.credential.value,
      application_name: 'celesnity-watch-source',
      connectionTimeoutMillis: timeout,
      query_timeout: timeout,
      statement_timeout: timeout,
      ssl: sslConfiguration(values.sslMode.value, values.endpoint.host),
    });
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => undefined);
      throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
    }
  }

  private async query(
    client: PostgresWatchSourceClient,
    statement: string,
    parameters: readonly unknown[],
    input: WatchSourcePollingInput,
  ): Promise<{ readonly rows: readonly Record<string, unknown>[] }> {
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
  return `SELECT ${quoteIdentifier(change)} AS "__watch_change", ${quoteIdentifier(tie)} AS "__watch_tie"
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
  const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const changeIdentifier = quoteIdentifier(change);
  const tieIdentifier = quoteIdentifier(tie);
  const predicate = hasCheckpoint
    ? `WHERE (${changeIdentifier} > $1 OR (${changeIdentifier} = $1 AND ${tieIdentifier} > $2))`
    : '';
  const limitParameter = hasCheckpoint ? '$3' : '$1';
  return `SELECT ${changeIdentifier} AS "__watch_change", ${tieIdentifier} AS "__watch_tie"
    FROM ${qualified}
    ${predicate}
    ORDER BY ${changeIdentifier} ASC, ${tieIdentifier} ASC
    LIMIT ${limitParameter}`;
}

function safeCursorValues(checkpoint: string): readonly string[] {
  try {
    return cursorValues(checkpoint);
  } catch {
    throw new WatchSourcePollingError('INVALID_CHECKPOINT');
  }
}

function toCursorRow(row: Record<string, unknown>): WatchSourceCursorRow {
  return { change: row.__watch_change, tie: row.__watch_tie };
}

function quoteIdentifier(value: string): string {
  if (value.trim() === '' || value.includes('\0')) {
    throw new WatchSourcePollingError('SOURCE_QUERY_FAILED');
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function sslConfiguration(mode: PostgresSslModeValue, serverName: string): ClientConfig['ssl'] {
  if (mode === PostgresSslModeValue.DISABLE) return false;
  if (mode === PostgresSslModeValue.VERIFY_FULL)
    return { rejectUnauthorized: true, servername: serverName };
  if (mode === PostgresSslModeValue.VERIFY_CA)
    return {
      rejectUnauthorized: true,
      servername: serverName,
      checkServerIdentity: () => undefined,
    };
  return { rejectUnauthorized: false, servername: serverName };
}
