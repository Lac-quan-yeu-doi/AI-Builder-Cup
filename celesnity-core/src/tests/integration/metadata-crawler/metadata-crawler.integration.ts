import { PlaintextCredentialPayload } from '@application/database-service/connection-credential-payload';
import { DatabaseServiceRuntimeProfileValue } from '@application/database-service/read-models/database-service-runtime-profile';
import { MysqlConfigCodec } from '@infrastructure/dbms/mysql/mysql-config.codec';
import { MysqlMetadataSourceFactory } from '@infrastructure/dbms/mysql/mysql-metadata.source';
import { PostgresConfigCodec } from '@infrastructure/dbms/postgresql/postgres-config.codec';
import { PostgresMetadataSourceFactory } from '@infrastructure/dbms/postgresql/postgres-metadata.source';
import { DEFAULT_DATABASE_DISCOVERY_CONFIG } from '@application/metadata-crawler/metadata-crawler.use-cases';

const deadline = () => new Date(Date.now() + 20_000);

describe('Metadata Crawler source adapters (disposable DBMS fixtures)', () => {
  it('discovers PostgreSQL schemas, relations, ordered columns, and constraints', async () => {
    const codec = new PostgresConfigCodec();
    const config = codec.normalize({
      host: '127.0.0.1',
      port: 15433,
      databaseName: 'analytics',
      username: 'crawler',
      password: 'source-test-only',
      sslMode: 'DISABLED',
    }).config;
    const profile = new DatabaseServiceRuntimeProfileValue(
      '00000000-0000-4000-8000-000000000001',
      'POSTGRESQL',
      config,
      PlaintextCredentialPayload.create(1, 'source-test-only'),
      '127.0.0.1',
      15433,
      ['127.0.0.1'],
    );
    const source = await new PostgresMetadataSourceFactory(codec).create({
      profile,
      discovery: DEFAULT_DATABASE_DISCOVERY_CONFIG,
      deadline: deadline(),
      signal: new AbortController().signal,
      logger: { info: () => undefined, warn: () => undefined },
    });
    try {
      const namespaces = [];
      for await (const namespace of source.listNamespaces()) namespaces.push(namespace);
      expect(
        namespaces.some((namespace) => namespace.canonicalPath === 'analytics/schema=reporting'),
      ).toBe(true);
      const reporting = namespaces.find(
        (namespace) => namespace.canonicalPath === 'analytics/schema=reporting',
      );
      expect(reporting).toBeDefined();
      const relations = [];
      for await (const relation of source.listRelations(reporting!)) relations.push(relation);
      expect(relations.map((relation) => relation.name)).toEqual([
        'customers',
        'order_totals',
        'orders',
      ]);
      const orders = await source.describeRelation(
        relations.find((relation) => relation.name === 'orders')!,
      );
      expect(orders.columns.map((column) => column.name)).toEqual(['id', 'customer_id', 'total']);
      expect(orders.constraints.map((constraint) => constraint.type)).toEqual(
        expect.arrayContaining(['PRIMARY_KEY', 'FOREIGN_KEY', 'CHECK']),
      );
    } finally {
      await source.close();
    }
  });

  it('discovers a MySQL database as one namespace and supports safe DDL extraction', async () => {
    const codec = new MysqlConfigCodec();
    const config = codec.normalize({
      host: '127.0.0.1',
      port: 13309,
      databaseName: 'analytics',
      username: 'crawler',
      password: 'source-test-only',
      sslMode: 'DISABLED',
    }).config;
    const profile = new DatabaseServiceRuntimeProfileValue(
      '00000000-0000-4000-8000-000000000002',
      'MYSQL',
      config,
      PlaintextCredentialPayload.create(1, 'source-test-only'),
      '127.0.0.1',
      13309,
      ['127.0.0.1'],
    );
    const source = await new MysqlMetadataSourceFactory(codec).create({
      profile,
      discovery: { ...DEFAULT_DATABASE_DISCOVERY_CONFIG, includeDdl: true },
      deadline: deadline(),
      signal: new AbortController().signal,
      logger: { info: () => undefined, warn: () => undefined },
    });
    try {
      const namespaces = [];
      for await (const namespace of source.listNamespaces()) namespaces.push(namespace);
      expect(namespaces.map((namespace) => namespace.canonicalPath)).toEqual(['analytics']);
      const relations = [];
      for await (const relation of source.listRelations(namespaces[0]!)) relations.push(relation);
      expect(relations.map((relation) => relation.name)).toEqual([
        'customers',
        'order_totals',
        'orders',
      ]);
      const orders = await source.describeRelation(
        relations.find((relation) => relation.name === 'orders')!,
      );
      expect(orders.ddl).toContain('CREATE TABLE');
      expect(orders.columns.map((column) => column.ordinalPosition)).toEqual([1, 2, 3]);
    } finally {
      await source.close();
    }
  });
});
