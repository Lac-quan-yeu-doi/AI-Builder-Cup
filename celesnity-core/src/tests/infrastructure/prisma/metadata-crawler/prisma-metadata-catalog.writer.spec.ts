import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import type { RelationMetadata } from '@application/metadata-crawler/interfaces/i-database-metadata-source';
import { PrismaMetadataCatalogWriter } from '@infrastructure/prisma/metadata-crawler/prisma-metadata-catalog.writer';

describe('PrismaMetadataCatalogWriter', () => {
  it('hashes a canonical relation graph independent of property order', () => {
    expect(PrismaMetadataCatalogWriter.sourceHash({ b: 2, a: 1 })).toBe(
      PrismaMetadataCatalogWriter.sourceHash({ a: 1, b: 2 }),
    );
  });

  it('starts a scope through the celesnity_app run-scope delegate', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = {
      metadataCrawlerRunScope: { upsert: create },
      metadataCrawlerRun: {
        findUnique: jest.fn(async () => ({
          crawler: {
            databaseMetadataCrawler: { databaseServiceId: '11111111-1111-4111-8111-111111111111' },
          },
        })),
      },
      catalogNamespace: { findUnique: jest.fn(async () => undefined), upsert: jest.fn() },
    };
    const prisma = {
      transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const writer = new PrismaMetadataCatalogWriter(prisma, {
      next: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await writer.beginScope(
      '33333333-3333-4333-8333-333333333333',
      {
        type: 'SCHEMA',
        name: 'public',
        canonicalPath: 'db=analytics/schema=public',
        nativeIdentifier: 'public',
        deletionScopeKey: 'db=analytics/schema=public',
        properties: {},
      },
      new Date('2026-08-18T01:00:00.000Z'),
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ where: expect.any(Object) }));
  });

  it('stores constraint column positions as one-based values', async () => {
    const createdConstraintColumns: Array<{
      readonly data: { readonly position: number; readonly referencedColumnName: string | null };
    }> = [];
    const constraintColumnCreate = jest.fn(
      async (args: (typeof createdConstraintColumns)[number]) => {
        createdConstraintColumns.push(args);
      },
    );
    const tx = {
      metadataCrawlerRun: {
        findUnique: jest.fn(async () => ({
          crawler: { databaseMetadataCrawler: { databaseServiceId: 'service-id' } },
        })),
      },
      catalogNamespace: { upsert: jest.fn(async () => ({ id: 'namespace-id' })) },
      catalogRelation: {
        findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({ id: 'relation-id' })),
      },
      catalogColumn: {
        upsert: jest.fn(async () => undefined),
        findUnique: jest.fn(async () => ({ id: 'column-id' })),
      },
      catalogConstraint: { upsert: jest.fn(async () => ({ id: 'constraint-id' })) },
      catalogConstraintColumn: {
        deleteMany: jest.fn(async () => undefined),
        create: constraintColumnCreate,
      },
    };
    const prisma = {
      transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const writer = new PrismaMetadataCatalogWriter(prisma, {
      next: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    const input: RelationMetadata = {
      relation: {
        namespaceCanonicalPath: 'database=analytics',
        namespaceType: 'DATABASE',
        name: 'orders',
        type: 'TABLE',
        canonicalPath: 'database=analytics/relation=orders',
        nativeIdentifier: 'orders',
        deletionScopeKey: 'database=analytics',
        properties: {},
      },
      columns: [
        {
          name: 'id',
          ordinalPosition: 1,
          nativeType: 'int',
          canonicalType: 'INTEGER',
          nullable: false,
          properties: {},
        },
        {
          name: 'customer_id',
          ordinalPosition: 2,
          nativeType: 'int',
          canonicalType: 'INTEGER',
          nullable: false,
          properties: {},
        },
      ],
      constraints: [
        {
          name: 'orders_customer_fk',
          type: 'FOREIGN_KEY',
          columns: ['customer_id', 'id'],
          referencedColumns: ['id', 'customer_id'],
          properties: {},
        },
      ],
    };

    await writer.upsertRelationGraph(
      input,
      '33333333-3333-4333-8333-333333333333',
      new Date('2026-08-19T01:00:00.000Z'),
    );

    expect(createdConstraintColumns.map(({ data }) => data.position)).toEqual([1, 2]);
    expect(createdConstraintColumns.map(({ data }) => data.referencedColumnName)).toEqual([
      'id',
      'customer_id',
    ]);
  });
});
