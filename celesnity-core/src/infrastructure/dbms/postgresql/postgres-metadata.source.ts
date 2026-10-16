import { Client, type ClientConfig } from 'pg';
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
  PostgresConfigCodec,
  PostgresConfigValues,
} from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresSslModeValue } from '@infrastructure/dbms/postgresql/postgres-connection.value-objects';

export interface PostgresQueryResult {
  readonly rows: readonly Record<string, unknown>[];
}

export interface PostgresMetadataClient {
  connect(): Promise<unknown>;
  query(statement: string, parameters?: readonly unknown[]): Promise<PostgresQueryResult>;
  end(): Promise<void>;
}

export type PostgresMetadataClientFactory = (config: ClientConfig) => PostgresMetadataClient;

export class PostgresMetadataSourceFactory implements DatabaseMetadataSourceFactory {
  public readonly connectorType = 'POSTGRESQL';
  public readonly capabilities = {
    descriptions: true,
    materializedViews: true,
    ddl: false,
  } as const;

  public constructor(
    private readonly codec: Pick<PostgresConfigCodec, 'decode'>,
    private readonly createClient: PostgresMetadataClientFactory = (config) => new Client(config),
  ) {}

  public async create(input: DatabaseMetadataSourceInput): Promise<DatabaseMetadataSource> {
    const values = this.codec.decode(input.profile.config);
    const address = input.profile.resolvedAddresses[0] ?? input.profile.destinationHost;
    const timeout = Math.max(1_000, input.deadline.getTime() - Date.now());
    const client = this.createClient({
      host: address,
      port: values.endpoint.port,
      database: values.databaseName.value,
      user: values.username.value,
      password: input.profile.credential.value,
      application_name: 'celesnity-metadata-crawler',
      connectionTimeoutMillis: timeout,
      query_timeout: timeout,
      statement_timeout: timeout,
      ssl: sslConfiguration(values.sslMode.value, values.endpoint.host),
    });
    await client.connect();
    return new PostgresMetadataSource(client, values, input);
  }
}

class PostgresMetadataSource implements DatabaseMetadataSource {
  private closed = false;

  public constructor(
    private readonly client: PostgresMetadataClient,
    private readonly values: PostgresConfigValues,
    private readonly input: DatabaseMetadataSourceInput,
  ) {}

  public async *listNamespaces(): AsyncIterable<DiscoveredNamespace> {
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
    const result = await this.query(
      `SELECT n.nspname AS schema_name,
              obj_description(n.oid, 'pg_namespace') AS description
         FROM pg_namespace n
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp_%'
        ORDER BY n.nspname`,
      [],
    );
    for (const row of result.rows) {
      const name = text(row.schema_name);
      const path = `${databasePath(database)}/schema=${segment(name)}`;
      yield {
        type: 'SCHEMA',
        name,
        canonicalPath: path,
        nativeIdentifier: name,
        deletionScopeKey: path,
        parentCanonicalPath: databasePath(database),
        description: optionalText(row.description),
        properties: {},
      };
    }
  }

  public async *listRelations(scope: DiscoveredNamespace): AsyncIterable<DiscoveredRelation> {
    this.ensureOpen();
    if (scope.type !== 'SCHEMA') return;
    const result = await this.query(
      `SELECT n.nspname AS schema_name,
              c.relname AS relation_name,
              c.relkind AS relation_kind,
              obj_description(c.oid, 'pg_class') AS description
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        ORDER BY c.relname`,
      [scope.name],
    );
    const database = this.values.databaseName.value;
    for (const row of result.rows) {
      const name = text(row.relation_name);
      const relationType = relationKind(row.relation_kind);
      if (relationType === undefined) continue;
      const path = `${databasePath(database)}/schema=${segment(scope.name)}/relation=${segment(name)}`;
      yield {
        namespaceCanonicalPath: scope.canonicalPath,
        namespaceType: scope.type,
        name,
        type: relationType,
        canonicalPath: path,
        nativeIdentifier: `${scope.name}.${name}`,
        deletionScopeKey: scope.deletionScopeKey,
        description: optionalText(row.description),
        properties: {},
      };
    }
  }

  public async describeRelation(relation: DiscoveredRelation): Promise<RelationMetadata> {
    this.ensureOpen();
    const parts = relation.namespaceCanonicalPath.split('/');
    const schema = decodeSegment(parts.find((part) => part.startsWith('schema='))?.slice(7) ?? '');
    const columnsResult = await this.query(
      `SELECT column_name,
              ordinal_position,
              data_type,
              is_nullable,
              column_default,
              col_description(($1 || '.' || $2)::regclass::oid, ordinal_position) AS description
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
      [schema, relation.name],
    );
    const constraintsResult = await this.query(
      `SELECT conname AS constraint_name,
              CASE contype WHEN 'p' THEN 'PRIMARY_KEY'
                           WHEN 'f' THEN 'FOREIGN_KEY'
                           WHEN 'u' THEN 'UNIQUE'
                           WHEN 'c' THEN 'CHECK' END AS constraint_type,
              pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = ($1 || '.' || $2)::regclass::oid
        ORDER BY conname`,
      [schema, relation.name],
    );
    const columns: DiscoveredColumn[] = columnsResult.rows.map((row) => ({
      name: text(row.column_name),
      ordinalPosition: number(row.ordinal_position),
      nativeType: text(row.data_type),
      canonicalType: canonicalType(text(row.data_type)),
      nullable: text(row.is_nullable).toUpperCase() === 'YES',
      defaultValue: optionalText(row.column_default),
      description: optionalText(row.description),
      properties: {},
    }));
    return {
      relation,
      columns,
      constraints: constraintsResult.rows.map((row) => ({
        name: text(row.constraint_name),
        type: (text(row.constraint_type) || 'CHECK') as
          'PRIMARY_KEY' | 'FOREIGN_KEY' | 'UNIQUE' | 'CHECK',
        columns: [],
        checkExpression: optionalText(row.definition),
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
    return { connectorType: 'POSTGRESQL', database: this.values.databaseName.value };
  }

  private async query(
    statement: string,
    parameters: readonly unknown[],
  ): Promise<PostgresQueryResult> {
    this.ensureOpen();
    if (this.input.signal.aborted) throw new PostgresMetadataSourceError('TIMEOUT');
    try {
      return await this.client.query(statement, parameters);
    } catch (error) {
      throw classifyPostgresError(error);
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new PostgresMetadataSourceError('INTERNAL');
  }
}

export class PostgresMetadataSourceError extends Error {
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
    super(`PostgreSQL metadata discovery failed (${category}).`);
    this.name = 'PostgresMetadataSourceError';
  }
}

function classifyPostgresError(error: unknown): PostgresMetadataSourceError {
  const code = errorCode(error);
  if (code === '28P01' || code === '28000')
    return new PostgresMetadataSourceError('AUTHENTICATION');
  if (code === '42501') return new PostgresMetadataSourceError('PERMISSION');
  if (code === '3D000' || code === '3F000') return new PostgresMetadataSourceError('CONFIGURATION');
  if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code))
    return new PostgresMetadataSourceError('NETWORK');
  return new PostgresMetadataSourceError('DISCOVERY');
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code.toUpperCase() : '';
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

function relationKind(kind: unknown): DiscoveredRelation['type'] | undefined {
  return relationKindMap[text(kind) as keyof typeof relationKindMap];
}
const relationKindMap = {
  r: 'TABLE',
  p: 'PARTITIONED_TABLE',
  v: 'VIEW',
  m: 'MATERIALIZED_VIEW',
  f: 'FOREIGN_TABLE',
} as const;

function databasePath(database: string): string {
  return `database=${segment(database)}`;
}
function segment(value: string): string {
  return encodeURIComponent(value);
}
function decodeSegment(value: string): string {
  return decodeURIComponent(value);
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
function canonicalType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('int')) return normalized.includes('big') ? 'BIGINT' : 'INTEGER';
  if (normalized.includes('numeric') || normalized.includes('decimal')) return 'DECIMAL';
  if (normalized.includes('bool')) return 'BOOLEAN';
  if (normalized.includes('timestamp')) return 'TIMESTAMP';
  if (normalized.includes('date')) return 'DATE';
  if (normalized.includes('json')) return 'JSON';
  return normalized.toUpperCase();
}
