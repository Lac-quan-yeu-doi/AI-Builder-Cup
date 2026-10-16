import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaCatalogSourceBindingResolver } from '@infrastructure/prisma/node-catalog/prisma-catalog-source-binding.resolver';

const DATABASE_SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const NAMESPACE_ID = '22222222-2222-4222-8222-222222222222';
const RELATION_ID = '33333333-3333-4333-8333-333333333333';
function resolverWith(options: { namespace?: unknown; relation?: unknown }) {
  const findNamespace = jest.fn(async () => options.namespace ?? null);
  const findRelation = jest.fn(async () => options.relation ?? null);
  const prisma = {
    client: {
      catalogNamespace: { findFirst: findNamespace },
      catalogRelation: { findFirst: findRelation },
    },
  } as unknown as PrismaService;
  return {
    resolver: new PrismaCatalogSourceBindingResolver(prisma),
    findNamespace,
    findRelation,
  };
}

describe('PrismaCatalogSourceBindingResolver', () => {
  it('resolves a current relation from the assigned successful crawler snapshot', async () => {
    const { resolver, findNamespace, findRelation } = resolverWith({
      namespace: { id: NAMESPACE_ID, name: 'public' },
      relation: {
        id: RELATION_ID,
        name: 'customers',
        columns: [{ name: 'id', canonicalType: 'BIGINT', nullable: false }],
      },
    });

    await expect(resolver.resolve(DATABASE_SERVICE_ID, NAMESPACE_ID, RELATION_ID)).resolves.toEqual(
      {
        databaseServiceId: DATABASE_SERVICE_ID,
        namespaceId: NAMESPACE_ID,
        relationId: RELATION_ID,
        schemaName: 'public',
        tableName: 'customers',
        columns: [{ name: 'id', dataType: 'BIGINT', nullable: false }],
      },
    );
    expect(findNamespace).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          databaseServiceId: DATABASE_SERVICE_ID,
          lastSeenRun: {
            status: { in: ['SUCCEEDED', 'PARTIAL'] },
            crawler: {
              enabled: true,
              archivedAt: null,
              databaseMetadataCrawler: { databaseServiceId: DATABASE_SERVICE_ID },
            },
          },
        }) as unknown,
      }),
    );
    expect(findRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ namespaceId: NAMESPACE_ID }) as unknown,
      }),
    );
  });

  it.each([
    ['wrong Database Service or deleted namespace', null, { id: RELATION_ID, name: 'customers' }],
    ['absent successful snapshot', null, null],
    ['deleted or stale relation', { id: NAMESPACE_ID, name: 'public' }, null],
  ])('rejects %s', async (_label, namespace, relation) => {
    const { resolver } = resolverWith({
      namespace,
      relation,
    });

    await expect(
      resolver.resolve(DATABASE_SERVICE_ID, NAMESPACE_ID, RELATION_ID),
    ).resolves.toBeUndefined();
  });
});
