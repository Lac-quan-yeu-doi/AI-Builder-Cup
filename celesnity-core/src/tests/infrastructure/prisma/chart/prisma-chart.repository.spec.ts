import { PrismaChartRepository } from '@infrastructure/prisma/chart/prisma-chart.repository';

describe('PrismaChartRepository', () => {
  it('is the canonical revision repository implementation', () => {
    expect(PrismaChartRepository).toBeDefined();
  });

  it('does not expose archived canonical charts through the active lookup', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new PrismaChartRepository({
      client: { chart: { findFirst } },
    } as never);

    await expect(repository.findCanonicalById('org-1', 'chart-1')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          id: 'chart-1',
          archivedAt: null,
        }),
      }),
    );
  });
});
