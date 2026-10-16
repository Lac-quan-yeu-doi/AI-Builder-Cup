import { PrismaCatalogNamespaceMetadataRepository } from '@infrastructure/prisma/catalog-exploration/prisma-catalog-namespace-metadata.repository';
import type { PrismaService } from '@infrastructure/prisma/prisma.service';

describe('PrismaCatalogNamespaceMetadataRepository', () => {
  it('loads only descriptions for the requested catalog namespaces', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { namespace: 'analytics', description: 'Reporting data' },
      { namespace: 'raw', description: null },
    ]);
    const prisma = {
      client: { catalogNamespaceDescription: { findMany } },
    } as unknown as PrismaService;
    const repository = new PrismaCatalogNamespaceMetadataRepository(prisma);

    const descriptions = await repository.listDescriptions('iceberg', ['analytics', 'raw']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        catalog: 'iceberg',
        namespace: { in: ['analytics', 'raw'] },
        description: { not: null },
      },
      select: { namespace: true, description: true },
    });
    expect([...descriptions]).toEqual([['analytics', 'Reporting data']]);
  });

  it('updates an existing description and clears it with null', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'metadata-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      client: { catalogNamespaceDescription: { findFirst, updateMany } },
    } as unknown as PrismaService;
    const repository = new PrismaCatalogNamespaceMetadataRepository(prisma);

    await repository.setDescription('iceberg', 'analytics', undefined);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'metadata-1' },
      data: { description: null },
    });
  });

  it('creates metadata when the namespace has no annotation yet', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      client: { catalogNamespaceDescription: { findFirst, create } },
    } as unknown as PrismaService;
    const repository = new PrismaCatalogNamespaceMetadataRepository(prisma);

    await repository.setDescription('iceberg', 'analytics', 'Reporting data');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: '00000000-0000-0000-0000-000000000000',
        catalog: 'iceberg',
        namespace: 'analytics',
        description: 'Reporting data',
      }),
    });
  });
});
