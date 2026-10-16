import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { DatabaseServiceRuntimeProfileValue } from '@application/database-service/read-models/database-service-runtime-profile';
import { NormalizedConnectionConfig } from '@domain/database-service/value-objects/normalized-connection-config';
import {
  MysqlMetadataSourceFactory,
  type MysqlMetadataClient,
} from '@infrastructure/dbms/mysql/mysql-metadata.source';

const profile = new DatabaseServiceRuntimeProfileValue(
  '11111111-1111-4111-8111-111111111111',
  'MYSQL',
  NormalizedConnectionConfig.create(1, {
    databaseName: 'analytics',
    host: 'db.internal',
    port: 3306,
    sslMode: 'DISABLED',
    username: 'crawler',
  }),
  PlaintextCredentialPayload.create(1, 'test-password'),
  'db.internal',
  3306,
  ['10.20.30.40'],
);

describe('MysqlMetadataSourceFactory', () => {
  it('discovers one database namespace and ordered table columns', async () => {
    const client: MysqlMetadataClient = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM information_schema.TABLES')) {
          return [
            [{ TABLE_NAME: 'orders', TABLE_TYPE: 'BASE TABLE', TABLE_COMMENT: 'Orders' }],
            [],
          ];
        }
        if (sql.includes('FROM information_schema.COLUMNS')) {
          return [
            [
              {
                COLUMN_NAME: 'id',
                ORDINAL_POSITION: 1,
                DATA_TYPE: 'int',
                IS_NULLABLE: 'NO',
                COLUMN_DEFAULT: null,
                COLUMN_COMMENT: 'identifier',
              },
            ],
            [],
          ];
        }
        if (sql.includes('FROM information_schema.TABLE_CONSTRAINTS')) return [[], []];
        if (sql.includes('SHOW CREATE'))
          return [[{ 'Create Table': 'CREATE TABLE orders (id int)' }], []];
        return [[], []];
      }),
      end: jest.fn(async () => undefined),
    };
    const factory = new MysqlMetadataSourceFactory(
      {
        decode: jest.fn(() => ({
          endpoint: { host: 'db.internal', port: 3306 },
          databaseName: { value: 'analytics' },
          username: { value: 'crawler' },
          sslMode: { value: 'DISABLED' },
        })),
      } as never,
      async () => client,
    );
    const source = await factory.create({
      profile,
      discovery: {
        includeViews: true,
        includeMaterializedViews: false,
        includeDdl: true,
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
    const relations = [];
    for await (const relation of source.listRelations(namespaces[0]!)) relations.push(relation);
    const metadata = await source.describeRelation(relations[0]!);

    expect(namespaces.map((item) => item.canonicalPath)).toEqual(['database=analytics']);
    expect(relations[0]!.type).toBe('TABLE');
    expect(metadata.columns[0]!.canonicalType).toBe('INTEGER');
    expect(JSON.stringify(source)).not.toContain('test-password');
    await source.close();
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
