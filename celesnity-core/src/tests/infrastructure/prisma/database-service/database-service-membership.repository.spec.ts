import { PrismaDatabaseServiceMembershipRepository } from '@infrastructure/prisma/database-service/prisma-database-service-membership.repository';

describe('PrismaDatabaseServiceMembershipRepository', () => {
  function harness() {
    const membership = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    };
    const prisma = {
      organizationId: '00000000-0000-4000-8000-000000000001',
      client: {
        databaseServiceMembership: membership,
        $queryRaw: jest.fn(),
      },
    };
    return {
      membership,
      prisma,
      repository: new PrismaDatabaseServiceMembershipRepository(prisma as never),
    };
  }

  it('lists sorted memberships for one datasource within the current organization', async () => {
    const { membership, repository } = harness();
    membership.findMany.mockResolvedValue([
      { databaseName: 'zeta' },
      { databaseName: 'analytics' },
    ]);

    await expect(repository.listDatabaseNames('source-1')).resolves.toEqual(['analytics', 'zeta']);
    expect(membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: expect.any(String), databaseServiceId: 'source-1' },
        orderBy: { databaseName: 'asc' },
      }),
    );
  });

  it('treats a concurrent duplicate attach as idempotent success', async () => {
    const { membership, repository } = harness();
    membership.create.mockRejectedValue({ code: 'P2002' });

    await expect(repository.attach('source-1', 'analytics', new Date())).resolves.toBeUndefined();
  });

  it('removes only the selected organization membership', async () => {
    const { membership, repository } = harness();
    membership.deleteMany.mockResolvedValue({ count: 1 });

    await repository.detach('source-1', 'analytics');

    expect(membership.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: expect.any(String),
        databaseServiceId: 'source-1',
        databaseName: 'analytics',
      },
    });
  });

  it('locks the membership row before a detach or pipeline save checks usage', async () => {
    const { prisma, repository } = harness();
    prisma.client.$queryRaw.mockResolvedValue([{ databaseServiceId: 'source-1' }]);

    await expect(repository.lockExisting('source-1', 'analytics')).resolves.toBe(true);
    expect(prisma.client.$queryRaw).toHaveBeenCalled();
    expect(String(prisma.client.$queryRaw.mock.calls[0]?.[0])).toContain('FOR UPDATE');
  });
});
