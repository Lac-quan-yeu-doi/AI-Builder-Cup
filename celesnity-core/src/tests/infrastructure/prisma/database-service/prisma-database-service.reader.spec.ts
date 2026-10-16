import { PrismaDatabaseServiceReader } from '@infrastructure/prisma/database-service/prisma-database-service.reader';

describe('PrismaDatabaseServiceReader membership filtering', () => {
  it('filters a database-scoped list through the membership relation', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      client: { databaseService: { findMany, count } },
    };
    const mapper = { toView: jest.fn() };
    const reader = new PrismaDatabaseServiceReader(prisma as never, mapper as never);

    await reader.listActive({
      databaseName: 'analytics',
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortDirection: 'asc',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          memberships: { some: { databaseName: 'analytics' } },
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        memberships: { some: { databaseName: 'analytics' } },
      },
    });
  });

  it('excludes only memberships in the selected database for candidate lists', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      client: { databaseService: { findMany, count } },
    };
    const mapper = { toView: jest.fn() };
    const reader = new PrismaDatabaseServiceReader(prisma as never, mapper as never);

    await reader.listActive({
      excludeDatabaseName: 'analytics',
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortDirection: 'asc',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          memberships: { none: { databaseName: 'analytics' } },
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        memberships: { none: { databaseName: 'analytics' } },
      },
    });
  });
});
