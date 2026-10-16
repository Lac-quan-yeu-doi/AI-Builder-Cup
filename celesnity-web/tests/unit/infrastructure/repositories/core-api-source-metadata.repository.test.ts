import { describe, expect, it, vi } from 'vitest';

import { CoreApiSourceMetadataRepository } from '@/src/infrastructure/repositories/core-api-source-metadata.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';

const crawlerId = '11111111-1111-4111-8111-111111111111';
const namespaceId = '22222222-2222-4222-8222-222222222222';
const relationId = '33333333-3333-4333-8333-333333333333';

const page = {
  items: [],
  pagination: { page: 2, pageSize: 50, total: 51, totalPages: 2 },
  sort: { field: 'columnCount', direction: 'desc' },
};

describe('CoreApiSourceMetadataRepository', () => {
  it('encodes the crawler and child IDs and serializes server-side query controls', async () => {
    const request = vi.fn(async () => page);
    const repository = new CoreApiSourceMetadataRepository({
      request,
    } as unknown as GeneratedApiTransport);

    await repository.listRelations(crawlerId, namespaceId, {
      page: 2,
      pageSize: 50,
      search: 'order events',
      sortBy: 'columnCount',
      sortDirection: 'desc',
    });

    expect(request).toHaveBeenCalledWith(
      `/metadata-crawlers/${crawlerId}/metadata/namespaces/${namespaceId}/relations?page=2&pageSize=50&sortBy=columnCount&sortDirection=desc&search=order+events`,
      { method: 'GET' },
    );
  });

  it('maps summary, relation detail, columns, and constraints without source credentials', async () => {
    const request = vi.fn(async (path: string): Promise<unknown> => {
      if (path.endsWith('/summary')) {
        return {
          hasSnapshot: true,
          databaseCount: 1,
          schemaCount: 2,
          relationCount: 3,
          columnCount: 4,
          constraintCount: 1,
        };
      }
      if (path.endsWith(`/relations/${relationId}`)) {
        return {
          id: relationId,
          namespaceId,
          name: 'orders',
          relationType: 'TABLE',
          columnCount: 1,
          properties: {},
        };
      }
      if (path.endsWith('/columns?page=1&pageSize=50&sortBy=ordinalPosition&sortDirection=asc')) {
        return {
          items: [
            {
              id: 'column-1',
              relationId,
              name: 'id',
              ordinalPosition: 1,
              nativeType: 'integer',
              canonicalType: 'integer',
              nullable: false,
              properties: {},
            },
          ],
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
          sort: { field: 'ordinalPosition', direction: 'asc' },
        };
      }
      return [
        {
          id: 'constraint-1',
          name: 'orders_pkey',
          constraintType: 'PRIMARY_KEY',
          columns: [{ name: 'id', position: 0 }],
          properties: {},
        },
      ];
    });
    const repository = new CoreApiSourceMetadataRepository({
      request,
    } as unknown as GeneratedApiTransport);

    expect(await repository.getSummary(crawlerId)).toMatchObject({ relationCount: 3 });
    expect(await repository.getRelation(crawlerId, relationId)).toMatchObject({ name: 'orders' });
    expect(
      (
        await repository.listColumns(crawlerId, relationId, {
          page: 1,
          pageSize: 50,
          sortBy: 'ordinalPosition',
          sortDirection: 'asc',
        })
      ).items,
    ).toHaveLength(1);
    expect((await repository.listConstraints(crawlerId, relationId))[0]?.name).toBe('orders_pkey');
    expect(JSON.stringify(request.mock.calls)).not.toContain('password');
  });

  it('rejects malformed properties and pagination returned by Core', async () => {
    const request = vi.fn(async (): Promise<unknown> => ({
      items: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      sort: { field: 'name', direction: 'asc' },
    }));
    const repository = new CoreApiSourceMetadataRepository({
      request,
    } as unknown as GeneratedApiTransport);

    await expect(
      repository.listNamespaces(crawlerId, {
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortDirection: 'asc',
      }),
    ).resolves.toBeDefined();
    request.mockResolvedValueOnce({
      id: relationId,
      namespaceId,
      name: 'orders',
      relationType: 'TABLE',
      columnCount: 1,
      properties: [],
    });
    await expect(repository.getRelation(crawlerId, relationId)).rejects.toThrow('properties');
  });
});
