// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanonicalChartSidebar } from '@/app/(workspace)/chat/_components/canonical-chart-sidebar';
import { renderUi } from '@/tests/support/render-ui';
import type { ChartRenderer } from '@/src/entities/models/chart-renderer';
import type {
  CanonicalChart,
  ChartPreview,
  ChartSummary,
} from '@/src/entities/models/canonical-chart';
import type { ChartCollection } from '@/src/entities/models/chart-collection';
import type { ListCanonicalChartsController } from '@/src/interface-adapters/controllers/canonical-charts/list-canonical-charts.controller';
import type { GetCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/get-canonical-chart.controller';
import type { RunSavedCanonicalChartController } from '@/src/interface-adapters/controllers/canonical-charts/run-saved-canonical-chart.controller';
import type { ListChartCollectionsController } from '@/src/interface-adapters/controllers/chart-collections/list-chart-collections.controller';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}));

const summary: ChartSummary = {
  id: 'chart-1',
  collectionId: 'personal-1',
  title: 'Revenue by region',
  provenance: 'CHAT',
  currentRevisionNumber: 2,
  updatedAt: '2026-09-03T00:00:00.000Z',
};

const chart: CanonicalChart = {
  ...summary,
  organizationId: 'org-1',
  ownerIdentityId: 'user-1',
  description: null,
  queryDefinition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM iceberg.analytics.sales',
  },
  visualizationDefinition: {
    schemaVersion: 1,
    type: 'TABLE',
    roles: { columns: ['region', 'revenue'] },
    display: { rowDensity: 'DEFAULT', enableSearch: true, pageSize: 50 },
  },
  outputSchema: [
    { name: 'region', type: 'varchar', family: 'STRING' },
    { name: 'revenue', type: 'double', family: 'NUMBER' },
  ],
  createdAt: '2026-09-02T00:00:00.000Z',
};

const preview: ChartPreview = {
  runId: 'run-1',
  columns: chart.outputSchema,
  rows: [['EU', 100]],
  rowCount: 1,
  byteCount: 20,
  truncated: false,
  proof: null,
};

const personalCollection: ChartCollection = {
  id: 'personal-1',
  organizationId: 'org-1',
  parentId: null,
  name: 'Personal Collection',
  description: null,
  kind: 'PERSONAL',
  access: 'CURATE',
  chartCount: 1,
  archivedAt: null,
  children: [],
};

const renderer: ChartRenderer = { compile: vi.fn(() => null) };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSidebar(
  runSavedChart: RunSavedCanonicalChartController = vi
    .fn()
    .mockResolvedValue(preview) as unknown as RunSavedCanonicalChartController,
) {
  return renderUi(
    createElement(CanonicalChartSidebar, {
      listCharts: vi.fn().mockResolvedValue([summary]) as unknown as ListCanonicalChartsController,
      listCollections: vi
        .fn()
        .mockResolvedValue([personalCollection]) as unknown as ListChartCollectionsController,
      getChart: vi.fn().mockResolvedValue(chart) as unknown as GetCanonicalChartController,
      runSavedChart,
      renderer,
    }),
  );
}

describe('CanonicalChartSidebar', () => {
  it('lists the Personal Collection and auto-runs the selected saved chart', async () => {
    const runSavedChart = vi
      .fn()
      .mockResolvedValue(preview) as unknown as RunSavedCanonicalChartController;
    renderSidebar(runSavedChart);

    await waitFor(() => expect(screen.getAllByText('Revenue by region').length).toBeGreaterThan(0));
    expect(runSavedChart).toHaveBeenCalledWith({ chartId: 'chart-1', parameterValues: {} });
    expect(screen.getByText('1 rows')).toBeTruthy();
  });

  it('refreshes and clears the previous preview when the latest run fails', async () => {
    const runSavedChart = vi
      .fn()
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(
        new Error('latest query failed'),
      ) as unknown as RunSavedCanonicalChartController;
    renderSidebar(runSavedChart);
    await waitFor(() => expect(screen.getByText('1 rows')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('latest query failed')).toBeTruthy());
    expect(screen.queryByText('1 rows')).toBeNull();
  });

  it('links editing to the canonical builder', async () => {
    renderSidebar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(navigation.push).toHaveBeenCalledWith('/analytics/charts/chart-1/edit');
  });
});
