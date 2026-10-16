// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi as render } from '@/tests/support/render-ui';
import { SourceMetadataExplorerScreen } from '@/app/_components/metadata-crawler/source-metadata-explorer-screen';
import type { MetadataCrawlerController } from '@/src/interface-adapters/controllers/metadata-crawler/metadata-crawler.controller';
import type { SourceMetadataController } from '@/src/interface-adapters/controllers/metadata-crawler/source-metadata.controller';

const crawlerId = '11111111-1111-4111-8111-111111111111';
const namespaceId = '22222222-2222-4222-8222-222222222222';
const relationId = '33333333-3333-4333-8333-333333333333';

const crawler = {
  id: crawlerId,
  databaseServiceId: '44444444-4444-4444-8444-444444444444',
  name: 'Orders crawler',
  state: 'ACTIVE' as const,
  enabled: true,
  schedule: {
    cadence: 'DAILY' as const,
    timeOfDay: '01:00',
    timezone: 'UTC',
    editable: true as const,
  },
  nextRunAt: '2026-08-19T01:00:00.000Z',
  timeoutSeconds: 3600,
  revision: 1,
  databaseService: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Orders',
    connectorType: 'POSTGRESQL',
  },
  snapshotSummary: {
    hasSnapshot: true,
    databaseCount: 1,
    schemaCount: 1,
    relationCount: 1,
    columnCount: 1,
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
};

function page<T>(items: readonly T[], field: string, total = items.length) {
  return {
    items,
    pagination: { page: 1, pageSize: 50, total, totalPages: total === 0 ? 0 : 1 },
    sort: { field, direction: 'asc' as const },
  };
}

function controllers(overrides: Partial<SourceMetadataController> = {}) {
  const crawlerController = {
    get: vi.fn().mockResolvedValue(crawler),
  } as unknown as MetadataCrawlerController;
  const sourceController = {
    getSummary: vi.fn().mockResolvedValue(crawler.snapshotSummary),
    listNamespaces: vi
      .fn()
      .mockResolvedValue(
        page([{ id: namespaceId, name: 'public', type: 'SCHEMA', relationCount: 1 }], 'name'),
      ),
    listRelations: vi.fn().mockResolvedValue(
      page(
        [
          {
            id: relationId,
            namespaceId,
            name: 'orders',
            relationType: 'TABLE',
            columnCount: 1,
            properties: {},
          },
        ],
        'name',
      ),
    ),
    getRelation: vi.fn().mockResolvedValue({
      id: relationId,
      namespaceId,
      name: 'orders',
      relationType: 'TABLE',
      columnCount: 1,
      properties: {},
    }),
    listColumns: vi.fn().mockResolvedValue(
      page(
        [
          {
            id: 'column-1',
            relationId,
            name: 'id',
            ordinalPosition: 1,
            nativeType: 'integer',
            canonicalType: 'integer',
            nullable: false,
            properties: {},
          },
        ],
        'ordinalPosition',
      ),
    ),
    listConstraints: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SourceMetadataController;
  return { crawlerController, sourceController };
}

afterEach(() => cleanup());

describe('SourceMetadataExplorerScreen', () => {
  it('loads the crawler, summary, and namespace page, then lazily loads relations and details', async () => {
    const { crawlerController, sourceController } = controllers();
    render(
      createElement(SourceMetadataExplorerScreen, {
        crawlerId,
        crawlerController,
        sourceController,
      }),
    );

    expect(await screen.findByText('Orders')).toBeDefined();
    await waitFor(() => expect(sourceController.getSummary).toHaveBeenCalledWith(crawlerId));
    expect(sourceController.listNamespaces).toHaveBeenCalledWith(
      crawlerId,
      expect.objectContaining({ page: 1, pageSize: 50, sortBy: 'name', sortDirection: 'asc' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'public' }));
    await waitFor(() =>
      expect(sourceController.listRelations).toHaveBeenCalledWith(
        crawlerId,
        namespaceId,
        expect.objectContaining({ page: 1, sortBy: 'name' }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'orders' }));
    await waitFor(() => {
      expect(sourceController.getRelation).toHaveBeenCalledWith(crawlerId, relationId);
      expect(sourceController.listColumns).toHaveBeenCalledWith(
        crawlerId,
        relationId,
        expect.objectContaining({ sortBy: 'ordinalPosition' }),
      );
      expect(sourceController.listConstraints).toHaveBeenCalledWith(crawlerId, relationId);
    });
  });

  it('sends search and direction changes to the backend and does not filter existing rows locally', async () => {
    const { crawlerController, sourceController } = controllers();
    render(
      createElement(SourceMetadataExplorerScreen, {
        crawlerId,
        crawlerController,
        sourceController,
      }),
    );
    await screen.findByRole('button', { name: 'public' });
    const search = screen.getAllByLabelText('Search')[0];
    fireEvent.change(search, { target: { value: 'orders' } });
    await waitFor(() =>
      expect(sourceController.listNamespaces).toHaveBeenCalledWith(
        crawlerId,
        expect.objectContaining({ search: 'orders', page: 1 }),
      ),
    );
    // Direction is a toggle now, not a labelled select: two stacked dropdowns
    // per panel cost more height than the rows they ordered.
    fireEvent.click(screen.getAllByRole('button', { name: 'Ascending' })[0]);
    await waitFor(() =>
      expect(sourceController.listNamespaces).toHaveBeenCalledWith(
        crawlerId,
        expect.objectContaining({ sortDirection: 'desc', page: 1 }),
      ),
    );
  });

  it('keeps the last snapshot visible after a failed latest run and shows an empty state without a snapshot', async () => {
    const failed = { ...crawler, lastRun: { status: 'FAILED' as const } };
    const failedControllers = controllers({
      getSummary: vi.fn().mockResolvedValue(crawler.snapshotSummary),
    });
    (failedControllers.crawlerController.get as ReturnType<typeof vi.fn>).mockResolvedValue(failed);
    render(createElement(SourceMetadataExplorerScreen, { crawlerId, ...failedControllers }));
    expect(
      await screen.findByText('The latest crawl failed; showing the last successful snapshot.'),
    ).toBeDefined();

    cleanup();
    const empty = controllers({
      getSummary: vi.fn().mockResolvedValue({
        hasSnapshot: false,
        databaseCount: 0,
        schemaCount: 0,
        relationCount: 0,
        columnCount: 0,
        constraintCount: 0,
      }),
    });
    (empty.crawlerController.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...crawler,
      snapshotSummary: { ...crawler.snapshotSummary, hasSnapshot: false },
    });
    render(createElement(SourceMetadataExplorerScreen, { crawlerId, ...empty }));
    expect(
      await screen.findByText('No metadata has been crawled for this connection yet.'),
    ).toBeDefined();
  });
  it('opens the first namespace instead of a "select a namespace" panel', async () => {
    const { crawlerController, sourceController } = controllers();
    render(
      createElement(SourceMetadataExplorerScreen, {
        crawlerId,
        crawlerController,
        sourceController,
      }),
    );

    // The relations of the first schema load without a click; landing on an
    // empty half-screen panel wastes the visit.
    await waitFor(() =>
      expect(sourceController.listRelations).toHaveBeenCalledWith(
        crawlerId,
        namespaceId,
        expect.objectContaining({ page: 1 }),
      ),
    );
    expect(screen.queryByText('Select a namespace to view its relations.')).toBeNull();
  });

  it('keeps the open namespace loaded when it is clicked again', async () => {
    const { crawlerController, sourceController } = controllers();
    render(
      createElement(SourceMetadataExplorerScreen, {
        crawlerId,
        crawlerController,
        sourceController,
      }),
    );

    const namespace = await screen.findByRole('button', { name: 'public' });
    await screen.findByRole('button', { name: 'orders' });
    // Re-picking the open row must not blank the panel: the id it keys on does
    // not change, so nothing would fetch the relations back.
    fireEvent.click(namespace);
    expect(screen.getByRole('button', { name: 'orders' })).toBeDefined();
  });
});
