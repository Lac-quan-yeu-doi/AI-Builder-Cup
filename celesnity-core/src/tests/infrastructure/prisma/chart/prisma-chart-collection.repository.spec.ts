import { PrismaChartCollectionRepository } from '@infrastructure/prisma/chart/prisma-chart-collection.repository';

describe('PrismaChartCollectionRepository', () => {
  it('is the canonical collection persistence implementation', () => {
    expect(PrismaChartCollectionRepository).toBeDefined();
  });
});
