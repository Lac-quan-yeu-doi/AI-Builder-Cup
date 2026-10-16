import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import { createSourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';
import type { SourceMetadataUseCases } from '@/src/application/use-cases/metadata-crawler/source-metadata.use-cases';

const crawlerId = '11111111-1111-4111-8111-111111111111';

function useCases(): SourceMetadataUseCases {
  return {
    getSummary: vi.fn(async () => ({
      hasSnapshot: false,
      databaseCount: 0,
      schemaCount: 0,
      relationCount: 0,
      columnCount: 0,
      constraintCount: 0,
    })),
    listNamespaces: vi.fn(async (_id, query) => ({
      items: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
      sort: { field: query.sortBy, direction: query.sortDirection },
    })),
    listRelations: vi.fn(async (_id, _namespaceId, query) => ({
      items: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
      sort: { field: query.sortBy, direction: query.sortDirection },
    })),
    getRelation: vi.fn(),
    listColumns: vi.fn(async (_id, _relationId, query) => ({
      items: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
      sort: { field: query.sortBy, direction: query.sortDirection },
    })),
    listConstraints: vi.fn(async () => []),
  };
}

describe('SourceMetadataController', () => {
  it('normalizes defaults and forwards query controls to the use case', async () => {
    const cases = useCases();
    const controller = createSourceMetadataController(cases);

    await controller.listNamespaces(crawlerId);
    expect(cases.listNamespaces).toHaveBeenCalledWith(crawlerId, {
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortDirection: 'asc',
    });
    await controller.listRelations(crawlerId, crawlerId, {
      page: 2,
      pageSize: 50,
      search: 'orders',
      sortBy: 'columnCount',
      sortDirection: 'desc',
    });
    expect(cases.listRelations).toHaveBeenCalledWith(crawlerId, crawlerId, {
      page: 2,
      pageSize: 50,
      search: 'orders',
      sortBy: 'columnCount',
      sortDirection: 'desc',
    });
  });

  it('rejects invalid IDs and unsupported sort controls before invoking use cases', async () => {
    const cases = useCases();
    const controller = createSourceMetadataController(cases);

    await expect(controller.getSummary('not-a-uuid')).rejects.toBeInstanceOf(InputParseError);
    await expect(
      controller.listNamespaces(crawlerId, { sortBy: 'relationCount' as never }),
    ).resolves.toBeDefined();
    await expect(
      controller.listNamespaces(crawlerId, { sortBy: 'bad' as never }),
    ).rejects.toBeInstanceOf(InputParseError);
    expect(cases.listNamespaces).toHaveBeenCalledTimes(1);
  });
});
