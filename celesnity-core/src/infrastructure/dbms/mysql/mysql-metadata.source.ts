import { createConnection, type ConnectionOptions } from 'mysql2/promise';
import { connect as openTcpConnection } from 'node:net';
import type {
  DatabaseMetadataSource,
  DatabaseMetadataSourceFactory,
  DatabaseMetadataSourceInput,
  DiscoveredColumn,
  DiscoveredNamespace,
  DiscoveredRelation,
  RelationMetadata,
} from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import type {
  MysqlConfigCodec,
  MysqlConfigValues,
} from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlSslModeValue } from '@infrastructure/dbms/mysql/mysql-connection.value-objects';

export type MysqlQueryResult = readonly unknown[];

export interface MysqlMetadataClient {
  query(statement: string, parameters?: readonly unknown[]): Promise<MysqlQueryResult>;
  end(): Promise<void>;
}

export type MysqlMetadataClientFactory = (
  options: ConnectionOptions,
) => Promise<MysqlMetadataClient>;

export class MysqlMetadataSourceFactory implements DatabaseMetadataSourceFactory {
  public readonly connectorType = 'MYSQL';
  public readonly capabilities = {
    descriptions: true,
    materializedViews: false,
    ddl: true,
  } as const;

  public constructor(
    private readonly codec: Pick<MysqlConfigCodec, 'decode'>,
    private readonly createClient: MysqlMetadataClientFactory = async (options) =>
      await createConnection(options),
  ) {}

  public async create(input: DatabaseMetadataSourceInput): Promise<DatabaseMetadataSource> {
    const values = this.codec.decode(input.profile.config);
    const address = input.profile.resolvedAddresses[0] ?? input.profile.destinationHost;
    const timeout = Math.max(1_000, input.deadline.getTime() - Date.now());
    const client = await this.createClient({
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
    return new MysqlMetadataSource(client, values, input);
  }
}

class MysqlMetadataSource implements DatabaseMetadataSource {
  private closed = false;

  public constructor(
    private readonly client: MysqlMetadataClient,
    private readonly values: MysqlConfigValues,
    private readonly input: DatabaseMetadataSourceInput,
  ) {}

  public async *listNamespaces(): AsyncIterable<DiscoveredNamespace> {
    await Promise.resolve();
    this.ensureOpen();
    const database = this.values.databaseName.value;
    yield {
      type: 'DATABASE',
      name: database,
      canonicalPath: databasePath(database),
      nativeIdentifier: database,
      deletionScopeKey: databasePath(database),
      properties: {},
    };
  }

  public async *listRelations(scope: DiscoveredNamespace): AsyncIterable<DiscoveredRelation> {
    this.ensureOpen();
    if (scope.type !== 'DATABASE') return;
    const rows = rowsOf(
      await this.query(
        `SELECT TABLE_NAME, TABLE_TYPE, TABLE_COMMENT
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ?
            AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
          ORDER BY TABLE_NAME`,
        [this.values.databaseName.value],
      ),
    );
    for (const row of rows) {
      const name = text(row.TABLE_NAME);
      const path = `${databasePath(this.values.databaseName.value)}/relation=${segment(name)}`;
      yield {
        namespaceCanonicalPath: scope.canonicalPath,
        namespaceType: scope.type,
        name,
        type: text(row.TABLE_TYPE).toUpperCase() === 'VIEW' ? 'VIEW' : 'TABLE',
        canonicalPath: path,
        nativeIdentifier: name,
        deletionScopeKey: scope.deletionScopeKey,
        description: optionalText(row.TABLE_COMMENT),
        properties: {},
      };
    }
  }

  public async describeRelation(relation: DiscoveredRelation): Promise<RelationMetadata> {
    this.ensureOpen();
    const database = this.values.databaseName.value;
    const columnRows = rowsOf(
      await this.query(
        `SELECT COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        [database, relation.name],
      ),
    );
    const constraintRows = rowsOf(
      await this.query(
        `SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE,
                kcu.COLUMN_NAME, kcu.ORDINAL_POSITION,
                kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
           FROM information_schema.TABLE_CONSTRAINTS tc
           LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
             ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            AND kcu.TABLE_NAME = tc.TABLE_NAME
          WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.TABLE_NAME = ?
          ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
        [database, relation.name],
      ),
    );
    const columns: DiscoveredColumn[] = columnRows.map((row) => ({
      name: text(row.COLUMN_NAME),
      ordinalPosition: number(row.ORDINAL_POSITION),
      nativeType: text(row.DATA_TYPE),
      canonicalType: canonicalType(text(row.DATA_TYPE)),
      nullable: text(row.IS_NULLABLE).toUpperCase() === 'YES',
      defaultValue: optionalText(row.COLUMN_DEFAULT),
      description: optionalText(row.COLUMN_COMMENT),
      properties: {},
    }));
    const grouped = new Map<
      string,
      {
        type: 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK';
        columns: string[];
        referencedRelationPath?: string;
        referencedColumns: string[];
      }
    >();
    for (const row of constraintRows) {
      const name = text(row.CONSTRAINT_NAME);
      const kind = mapConstraintType(text(row.CONSTRAINT_TYPE));
      const current = grouped.get(name) ?? { type: kind, columns: [], referencedColumns: [] };
      current.columns.push(text(row.COLUMN_NAME));
      if (row.REFERENCED_TABLE_NAME !== undefined && row.REFERENCED_TABLE_NAME !== null) {
        current.referencedRelationPath = `${databasePath(database)}/relation=${segment(text(row.REFERENCED_TABLE_NAME))}`;
        current.referencedColumns.push(text(row.REFERENCED_COLUMN_NAME));
      }
      grouped.set(name, current);
    }
    let ddl: string | undefined;
    if (this.input.discovery.includeDdl) {
      const escapedDatabase = escapeIdentifier(database);
      const escapedRelation = escapeIdentifier(relation.name);
      const result = rowsOf(
        await this.query(
          `SHOW CREATE ${relation.type === 'VIEW' ? 'VIEW' : 'TABLE'} ${escapedDatabase}.${escapedRelation}`,
          [],
        ),
      );
      ddl = optionalText(result[0]?.['Create Table'] ?? result[0]?.['Create View']);
    }
    return {
      relation,
      ddl,
      columns,
      constraints: [...grouped.entries()].map(([name, value]) => ({
        name,
        type: value.type,
        columns: value.columns,
        referencedRelationPath: value.referencedRelationPath,
        referencedColumns: value.referencedColumns.length > 0 ? value.referencedColumns : undefined,
        properties: {},
      })),
    };
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client.end();
  }

  public toJSON(): Readonly<Record<string, unknown>> {
    return { connectorType: 'MYSQL', database: this.values.databaseName.value };
  }

  private async query(
    statement: string,
    parameters: readonly unknown[],
  ): Promise<MysqlQueryResult> {
    this.ensureOpen();
    if (this.input.signal.aborted) throw new MysqlMetadataSourceError('TIMEOUT');
    try {
      return await this.client.query(statement, parameters);
    } catch (error) {
      throw classifyMysqlError(error);
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new MysqlMetadataSourceError('INTERNAL');
  }
}

export class MysqlMetadataSourceError extends Error {
  public constructor(
    public readonly category:
      | 'AUTHENTICATION'
      | 'PERMISSION'
      | 'CONFIGURATION'
      | 'NETWORK'
      | 'TIMEOUT'
      | 'DISCOVERY'
      | 'INTERNAL',
  ) {
    super(`MySQL metadata discovery failed (${category}).`);
    this.name = 'MysqlMetadataSourceError';
  }
}

function classifyMysqlError(error: unknown): MysqlMetadataSourceError {
  const code = errorCode(error);
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === '1045')
    return new MysqlMetadataSourceError('AUTHENTICATION');
  if (['ER_DBACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR', '1044', '1142'].includes(code))
    return new MysqlMetadataSourceError('PERMISSION');
  if (code === 'ER_BAD_DB_ERROR' || code === '1049')
    return new MysqlMetadataSourceError('CONFIGURATION');
  if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code))
    return new MysqlMetadataSourceError('NETWORK');
  return new MysqlMetadataSourceError('DISCOVERY');
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const record = error as { readonly code?: unknown; readonly errno?: unknown };
  if (typeof record.code === 'string') return record.code.toUpperCase();
  return typeof record.errno === 'number' ? String(record.errno) : '';
}

function sslConfiguration(mode: MysqlSslModeValue): ConnectionOptions['ssl'] {
  switch (mode) {
    case MysqlSslModeValue.DISABLED:
      return false as unknown as ConnectionOptions['ssl'];
    case MysqlSslModeValue.REQUIRED:
    case MysqlSslModeValue.PREFERRED:
      return { rejectUnauthorized: false, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_CA:
      return { rejectUnauthorized: true, verifyIdentity: false };
    case MysqlSslModeValue.VERIFY_IDENTITY:
      return { rejectUnauthorized: true, verifyIdentity: true };
  }
}

function rowsOf(value: MysqlQueryResult): readonly Record<string, unknown>[] {
  return Array.isArray(value[0]) ? (value[0] as readonly Record<string, unknown>[]) : [];
}
function databasePath(database: string): string {
  return `database=${segment(database)}`;
}
function segment(value: string): string {
  return encodeURIComponent(value);
}
function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
    return value.toString();
  return '';
}
function optionalText(value: unknown): string | undefined {
  const result = text(value);
  return result === '' ? undefined : result;
}
function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
function escapeIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}
function canonicalType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('int')) return normalized.includes('big') ? 'BIGINT' : 'INTEGER';
  if (normalized.includes('decimal') || normalized.includes('numeric')) return 'DECIMAL';
  if (normalized.includes('bool')) return 'BOOLEAN';
  if (normalized.includes('json')) return 'JSON';
  if (normalized.includes('date')) return normalized.includes('time') ? 'TIMESTAMP' : 'DATE';
  return normalized.toUpperCase();
}
function mapConstraintType(value: string): 'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK' {
  if (value === 'PRIMARY KEY') return 'PRIMARY_KEY';
  if (value === 'FOREIGN KEY') return 'FOREIGN_KEY';
  if (value === 'UNIQUE') return 'UNIQUE';
  return 'CHECK';
}
