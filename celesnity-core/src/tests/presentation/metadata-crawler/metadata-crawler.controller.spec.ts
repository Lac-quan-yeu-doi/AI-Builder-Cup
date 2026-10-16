import { MetadataCrawlerController } from '@presentation/metadata-crawler/metadata-crawler.controller';
import type { MetadataCrawlerUseCases } from '@application/metadata-crawler/metadata-crawler.use-cases';

describe('MetadataCrawlerController', () => {
  it('maps assignment and manual-run endpoints to the use-case contract', async () => {
    const useCases = {
      list: jest.fn(async () => ({ items: [] })),
      assign: jest.fn(async () => ({ id: 'crawler-1' })),
      listAssignableDatabaseServices: jest.fn(async () => []),
      get: jest.fn(async () => ({ id: 'crawler-1' })),
      update: jest.fn(),
      archive: jest.fn(),
      runNow: jest.fn(async () => ({ id: 'run-1' })),
      listRuns: jest.fn(async () => []),
      getRun: jest.fn(),
      getRunLogs: jest.fn(),
    } as unknown as MetadataCrawlerUseCases;
    const controller = new MetadataCrawlerController(useCases);

    const assigned = await controller.assign({
      databaseServiceId: '11111111-1111-4111-8111-111111111111',
      name: 'Crawler',
      scheduleCron: '0 1 * * *',
      scheduleTimezone: 'UTC',
      discovery: {},
    } as never);
    const accepted = await controller.runNow('22222222-2222-4222-8222-222222222222');

    expect(assigned).toMatchObject({ id: 'crawler-1' });
    expect(accepted).toMatchObject({ id: 'run-1' });
    expect(useCases.assign).toHaveBeenCalled();
    expect(useCases.runNow).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });
});
