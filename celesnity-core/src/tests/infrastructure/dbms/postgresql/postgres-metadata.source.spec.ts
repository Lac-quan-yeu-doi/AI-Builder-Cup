import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { DatabaseServiceRuntimeProfileValue } from '@application/database-service/read-models/database-service-runtime-profile';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  PostgresMetadataSourceFactory,
  type PostgresMetadataClient,
} from '@infrastructure/dbms/postgresql/postgres-metadata.source';

const profile = new DatabaseServiceRuntimeProfileValue(
  '11111111-1111-4111-8111-111111111111',
  'POSTGRESQL',
  NormalizedConnectionConfig.create(1, {
    databaseName: 'analytics',
    host: 'db.internal',
    port: 5432,
    sslMode: 'disable',
    username: 'crawler',
  }),
  PlaintextCredentialPayload.create(1, 'test-password'),
  'db.internal',
  5432,
  ['10.20.30.40'],
);

describe('PostgresMetadataSourceFactory', () => {
  it('discovers stable namespaces and relation metadata without exposing credentials', async () => {
    const client: PostgresMetadataClient = {
      connect: jest.fn(),
      end: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('pg_class')) {
          return { rows: [{ schema_name: 'public', relation_name: 'orders', relation_kind: 'r' }] };
        }
        if (sql.includes('pg_namespace')) {
          return { rows: [{ schema_name: 'public', description: 'Public schema' }] };
        }
        if (sql.includes('information_schema.columns')) {
          return {
            rows: [
              {
                column_name: 'id',
                ordinal_position: 1,
                data_type: 'integer',
                is_nullable: 'NO',
                column_default: null,
                description: 'identifier',
              },
            ],
          };
        }
        if (sql.includes('pg_constraint')) return { rows: [] };
        return { rows: [] };
      }),
    };
    const factory = new PostgresMetadataSourceFactory(
      {
        decode: jest.fn(() => ({
          endpoint: { host: 'db.internal', port: 5432 },
          databaseName: { value: 'analytics' },
          username: { value: 'crawler' },
          sslMode: { value: 'disable' },
          options: { applicationName: undefined },
        })),
      } as never,
      () => client,
    );
    const source = await factory.create({
      profile,
      discovery: {
        includeViews: true,
        includeMaterializedViews: true,
        includeDdl: false,
        databaseIncludes: [],
        databaseExcludes: [],
        schemaIncludes: [],
        schemaExcludes: [],
        relationIncludes: [],
        relationExcludes: [],
      },
      deadline: new Date(Date.now() + 60_000),
      signal: new AbortController().signal,
      logger: { info: jest.fn(), warn: jest.fn() },
    });

    const namespaces = [];
    for await (const namespace of source.listNamespaces()) namespaces.push(namespace);
    const schema = namespaces.find((item) => item.type === 'SCHEMA');
    const relations = [];
    for await (const relation of source.listRelations(schema!)) relations.push(relation);
    const metadata = await source.describeRelation(relations[0]!);

    expect(namespaces.map((item) => item.canonicalPath)).toEqual([
      'database=analytics',
      'database=analytics/schema=public',
    ]);
    expect(relations[0]!.canonicalPath).toBe('database=analytics/schema=public/relation=orders');
    expect(metadata.columns[0]!.canonicalType).toBe('INTEGER');
    expect(JSON.stringify(source)).not.toContain('test-password');
    await source.close();
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
