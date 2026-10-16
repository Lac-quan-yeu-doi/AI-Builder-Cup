import { describe, expect, it, vi } from 'vitest';

import { CoreApiMetadataCrawlerRepository } from '@/src/infrastructure/repositories/core-api-metadata-crawler.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';

describe('CoreApiMetadataCrawlerRepository', () => {
  it('maps the operational endpoints and keeps assignment payload explicit', async () => {
    const crawler = {
      id: 'crawler-1',
      databaseServiceId: 'service-1',
      name: 'Crawler',
      state: 'ACTIVE',
      enabled: true,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC' },
      nextRunAt: '2026-08-19T01:00:00.000Z',
      timeoutSeconds: 3600,
      revision: 1,
      databaseService: { id: 'service-1', name: 'Service', connectorType: 'POSTGRESQL' },
      snapshotSummary: {
        hasSnapshot: true,
        databaseCount: 1,
        schemaCount: 2,
        relationCount: 22,
        columnCount: 73,
        constraintCount: 8,
      },
      discoveryConfig: {
        includeViews: true,
        includeMaterializedViews: true,
        includeDdl: false,
        databaseIncludes: [],
        databaseExcludes: [],
        schemaIncludes: [],
        schemaExcludes: [],
        relationIncludes: [],
        relationExcludes: [],
      },
    };
    const run = {
      id: 'run-1',
      crawlerId: 'crawler-1',
      triggerType: 'MANUAL',
      status: 'QUEUED',
      queuedAt: '2026-08-18T00:00:00.000Z',
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      counters: {},
    };
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/metadata-crawlers' && init?.method === 'POST') return crawler;
      if (path === '/metadata-crawlers') return { items: [], total: 0 };
      if (path === '/metadata-crawler-database-services') return [];
      if (path === '/metadata-crawlers/crawler-1/runs' && init?.method === 'POST') return run;
      return run;
    });
    const repository = new CoreApiMetadataCrawlerRepository({
      request,
    } as unknown as GeneratedApiTransport);

    await repository.list();
    await repository.listAssignableDatabaseServices();
    await repository.assign({
      databaseServiceId: 'service-1',
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC' },
    });
    await repository.runNow('crawler-1');

    expect(request).toHaveBeenCalledWith(
      '/metadata-crawlers',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(request).toHaveBeenCalledWith(
      '/metadata-crawler-database-services',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(request).toHaveBeenCalledWith(
      '/metadata-crawlers',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('service-1') }),
    );
    expect(request).toHaveBeenCalledWith(
      '/metadata-crawlers/crawler-1/runs',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
