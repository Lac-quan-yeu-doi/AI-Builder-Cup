import { describe, expect, it, vi } from 'vitest';

import { createMetadataCrawlerUseCases } from '@/src/application/use-cases/metadata-crawler/metadata-crawler.use-cases';
import type { MetadataCrawlerRepository } from '@/src/application/repositories/metadata-crawler.repository.interface';

describe('MetadataCrawler use cases', () => {
  it('delegates assignment and run-now without exposing a credential-bearing payload', async () => {
    const assigned = { id: 'crawler-1', databaseServiceId: 'service-1' } as never;
    const repository: MetadataCrawlerRepository = {
      list: vi.fn(),
      get: vi.fn(),
      listAssignableDatabaseServices: vi.fn(),
      assign: vi.fn(async () => assigned),
      update: vi.fn(),
      archive: vi.fn(),
      runNow: vi.fn(
        async () => ({ id: 'run-1', crawlerId: 'crawler-1', status: 'QUEUED' }) as never,
      ),
      listRuns: vi.fn(),
      getRunLogs: vi.fn(),
    };
    const useCases = createMetadataCrawlerUseCases(repository);

    await expect(
      useCases.assign({
        databaseServiceId: 'service-1',
        schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC' },
      }),
    ).resolves.toEqual(assigned);
    await expect(useCases.runNow('crawler-1')).resolves.toMatchObject({ status: 'QUEUED' });
    expect(repository.assign).toHaveBeenCalledOnce();
    expect(repository.runNow).toHaveBeenCalledWith('crawler-1');
    expect(JSON.stringify(assigned)).not.toContain('password');
  });
});
