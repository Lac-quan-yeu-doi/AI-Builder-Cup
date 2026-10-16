import type { PrismaService } from '@infrastructure/prisma/prisma.service';
import { PrismaDatabaseSourceUsageReader } from '@infrastructure/prisma/database-service/prisma-database-source-usage.reader';

function pipelineGraph(connectionId: string) {
  return {
    nodes: [
      {
        id: 'source',
        definitionType: 'POSTGRES_SOURCE',
        resourceId: `connection:${connectionId}`,
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  };
}

describe('PrismaDatabaseSourceUsageReader', () => {
  it('returns only active pipelines in the requested database that reference the datasource', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'pipeline-kasadata-a', name: 'Orders sync', graph: pipelineGraph('source-a') },
      { id: 'pipeline-kasadata-b', name: 'Brands sync', graph: pipelineGraph('source-b') },
    ]);
    const prisma = { client: { pipeline: { findMany } } } as unknown as PrismaService;
    const reader = new PrismaDatabaseSourceUsageReader(prisma);

    await expect(reader.listUsingPipelines('kasadata', 'source-a')).resolves.toEqual([
      { id: 'pipeline-kasadata-a', name: 'Orders sync' },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { databaseName: 'kasadata', archivedAt: null },
      select: { id: true, name: true, graph: true },
    });
  });

  it('recognizes a config connection id and ignores archived or other-database rows through the query', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'pipeline-kasadata-a',
        name: 'Orders sync',
        graph: {
          nodes: [
            {
              id: 'source',
              definitionType: 'POSTGRES_SOURCE',
              position: { x: 0, y: 0 },
              config: { connectionId: 'source-a' },
            },
          ],
          edges: [],
        },
      },
    ]);
    const prisma = { client: { pipeline: { findMany } } } as unknown as PrismaService;
    const reader = new PrismaDatabaseSourceUsageReader(prisma);

    await expect(reader.listUsingPipelines('kasadata', 'source-a')).resolves.toEqual([
      { id: 'pipeline-kasadata-a', name: 'Orders sync' },
    ]);
  });
});
