// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { MetadataCrawlerScreen } from '@/app/(workspace)/metadata-crawler/_components/metadata-crawler-screen';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { ListDatabaseServicesController } from '@/src/interface-adapters/controllers/database-services/list-database-services.controller';

const discoveryConfig = {
  includeViews: true,
  includeMaterializedViews: true,
  includeDdl: false,
  databaseIncludes: [],
  databaseExcludes: [],
  schemaIncludes: [],
  schemaExcludes: [],
  relationIncludes: [],
  relationExcludes: [],
} as const;

function crawler() {
  return {
    id: 'crawler-1',
    databaseServiceId: 'service-1',
    name: 'Orders crawler',
    state: 'ACTIVE' as const,
    enabled: true,
    schedule: { cadence: 'DAILY', timeOfDay: '01:00', timezone: 'UTC', editable: true },
    nextRunAt: '2026-08-19T01:00:00.000Z',
    timeoutSeconds: 3600,
    revision: 1,
    databaseService: { id: 'service-1', name: 'Orders', connectorType: 'POSTGRESQL' },
    snapshotSummary: {
      hasSnapshot: true,
      databaseCount: 1,
      schemaCount: 2,
      relationCount: 22,
      columnCount: 73,
      constraintCount: 8,
    },
    discoveryConfig,
  };
}

function controller(overrides: Partial<MetadataCrawlerController> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ items: [crawler()], total: 1 }),
    get: vi.fn(),
    listAssignableDatabaseServices: vi.fn().mockResolvedValue([]),
    assign: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    runNow: vi.fn().mockResolvedValue({
      id: 'run-1',
      crawlerId: 'crawler-1',
      triggerType: 'MANUAL',
      status: 'QUEUED',
      queuedAt: '2026-08-18T00:00:00.000Z',
      attempt: 0,
      crawlerRevision: 1,
      connectorTypeSnapshot: 'POSTGRESQL',
      counters: {
        databaseCount: 0,
        schemaCount: 0,
        relationCount: 0,
        columnCount: 0,
        createdCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        deletedCount: 0,
        warningCount: 0,
      },
    }),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunLogs: vi.fn(),
    ...overrides,
  } as unknown as MetadataCrawlerController;
}

function listSources(overrides: { readonly databaseName?: string } = { databaseName: 'kasadev' }) {
  return vi.fn().mockResolvedValue({
    items: [{ id: 'service-1', name: 'Orders', ...overrides }],
    page: 1,
    pageSize: 20,
    total: 1,
  }) as unknown as ListDatabaseServicesController;
}

afterEach(() => cleanup());

describe('Metadata Crawler screen', () => {
  it('lists a crawler and starts a manual run from the operational table', async () => {
    const api = controller();
    render(
      createElement(MetadataCrawlerScreen, {
        controller: api,
        listDatabaseServices: listSources(),
      }),
    );
    expect(await screen.findByText('Orders')).toBeDefined();
    expect(screen.getByText('Every day at 01:00')).toBeDefined();
    expect(screen.queryByText('Cron schedule')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.runNow).toHaveBeenCalledWith('crawler-1'));
  });

  it('leads each row to the source that owns the scan', async () => {
    // The row used to open `/metadata-crawler/{id}`, a second place to read one
    // scan. The actions now live on the source's Metadata scan tab, so that is
    // where a row has to land or the two surfaces stay split.
    render(
      createElement(MetadataCrawlerScreen, {
        controller: controller(),
        listDatabaseServices: listSources(),
      }),
    );

    const row = await screen.findByRole('link', { name: /Orders/u });
    expect(row.getAttribute('href')).toBe('/databases/kasadev/sources/service-1?tab=scan');
  });

  it('falls back to the crawler screen for a source filed under no database', async () => {
    render(
      createElement(MetadataCrawlerScreen, {
        controller: controller(),
        listDatabaseServices: listSources({ databaseName: undefined }),
      }),
    );

    const row = await screen.findByRole('link', { name: /Orders/u });
    expect(row.getAttribute('href')).toBe('/metadata-crawler/crawler-1');
  });
});
