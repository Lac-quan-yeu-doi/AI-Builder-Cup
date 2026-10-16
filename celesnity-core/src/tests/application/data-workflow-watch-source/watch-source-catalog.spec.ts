import { ListWatchSourceCatalogUseCase } from '@application/data-workflow-watch-source/list-watch-source-catalog.use-case';

const actor = { organizationId: 'organization-1', identityId: 'identity-1' };

describe('ListWatchSourceCatalogUseCase', () => {
  it('normalizes catalog search without exposing source connection data', async () => {
    const access = {
      readVerifiedMetadata: jest.fn(),
      listCatalogServices: jest.fn(async () => ({ data: [], page: 1, pageSize: 20, totalItems: 0 })),
      listCatalogRelations: jest.fn(async () => ({ data: [], page: 2, pageSize: 20, totalItems: 0 })),
    };
    const useCase = new ListWatchSourceCatalogUseCase(access);

    await expect(
      useCase.services(actor, { page: 1, pageSize: 20, search: '  orders  ' }),
    ).resolves.toEqual({ data: [], page: 1, pageSize: 20, totalItems: 0 });
    await expect(
      useCase.relations(actor, 'source-1', { page: 2, pageSize: 20, search: '   ' }),
    ).resolves.toEqual({ data: [], page: 2, pageSize: 20, totalItems: 0 });

    expect(access.listCatalogServices).toHaveBeenCalledWith(actor, {
      page: 1,
      pageSize: 20,
      search: 'orders',
    });
    expect(access.listCatalogRelations).toHaveBeenCalledWith(actor, 'source-1', {
      page: 2,
      pageSize: 20,
    });
  });
});
