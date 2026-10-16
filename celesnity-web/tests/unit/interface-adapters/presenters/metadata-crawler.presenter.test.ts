import { describe, expect, it } from 'vitest';

import { presentMetadataCrawler } from '@/src/interface-adapters/presenters/metadata-crawler.presenter';

describe('MetadataCrawler presenter', () => {
  it('passes through operational state and counters without adding secrets', () => {
    const view = presentMetadataCrawler({
      id: 'crawler-1',
      databaseServiceId: 'service-1',
      name: 'Orders crawler',
      state: 'ACTIVE',
      enabled: true,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC', editable: true },
      nextRunAt: '2026-08-19T01:00:00.000Z',
      timeoutSeconds: 3600,
      revision: 1,
      databaseService: { id: 'service-1', name: 'Orders', connectorType: 'MYSQL' },
      snapshotSummary: {
        hasSnapshot: true,
        databaseCount: 1,
        schemaCount: 2,
        relationCount: 3,
        columnCount: 4,
        constraintCount: 0,
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
    });
    expect(view.databaseService.connectorType).toBe('MYSQL');
    expect(JSON.stringify(view)).not.toContain('password');
  });
});
