import { WatchSourceAccessAdapter } from '@infrastructure/data-workflow-watch-source/watch-source-access.adapter';

const actor = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
};

describe('WatchSourceAccessAdapter', () => {
  it('projects catalog memberships without treating them as the source database name', async () => {
    const findFirstMembership = jest.fn().mockResolvedValue({ role: 'DATA_ENGINEER' });
    const findManyServices = jest.fn().mockResolvedValue([
      {
        id: 'source-1',
        name: 'Orders source',
        memberships: [{ databaseName: 'analytics' }, { databaseName: 'warehouse' }],
        connectorType: 'POSTGRESQL',
        verificationStatus: 'SUCCEEDED',
        _count: { catalogNamespaces: 2 },
      },
    ]);
    const countServices = jest.fn().mockResolvedValue(1);
    const adapter = new WatchSourceAccessAdapter({
      client: {
        organizationMembership: { findFirst: findFirstMembership },
        databaseService: { count: countServices, findMany: findManyServices },
      },
    } as never);

    await expect(
      adapter.listCatalogServices(actor, { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      data: [
        {
          id: 'source-1',
          name: 'Orders source',
          databaseNames: ['analytics', 'warehouse'],
          connectorType: 'POSTGRESQL',
          verificationStatus: 'SUCCEEDED',
          metadataAvailable: true,
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    });

    expect(findManyServices).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          memberships: {
            select: { databaseName: true },
            orderBy: { databaseName: 'asc' },
          },
        }),
      }),
    );
  });
});
