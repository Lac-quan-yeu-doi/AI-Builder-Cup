import { describe, expect, it } from 'vitest';

import {
  DEFAULT_METADATA_CRAWLER_DISCOVERY,
  type MetadataCrawler,
} from '@/src/entities/models/metadata-crawler';

describe('MetadataCrawler entity contract', () => {
  it('keeps the structural discovery defaults secret-free and DBMS-neutral', () => {
    expect(DEFAULT_METADATA_CRAWLER_DISCOVERY).toEqual({
      includeViews: true,
      includeMaterializedViews: true,
      includeDdl: false,
      databaseIncludes: [],
      databaseExcludes: [],
      schemaIncludes: [],
      schemaExcludes: [],
      relationIncludes: [],
      relationExcludes: [],
    });
    const crawler: MetadataCrawler = {
      id: 'crawler-1',
      databaseServiceId: 'service-1',
      name: 'Orders crawler',
      state: 'ACTIVE',
      enabled: true,
      schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC', editable: true },
      nextRunAt: '2026-08-19T01:00:00.000Z',
      timeoutSeconds: 3600,
      revision: 1,
      databaseService: { id: 'service-1', name: 'Orders', connectorType: 'POSTGRESQL' },
      snapshotSummary: {
        hasSnapshot: false,
        databaseCount: 0,
        schemaCount: 0,
        relationCount: 0,
        columnCount: 0,
        constraintCount: 0,
      },
      discoveryConfig: DEFAULT_METADATA_CRAWLER_DISCOVERY,
    };
    expect(JSON.stringify(crawler)).not.toContain('password');
  });
});
