// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getChart, runChart, renderer, getInjection } = vi.hoisted(() => {
  const getChart = vi.fn();
  const runChart = vi.fn();
  const renderer = { compile: vi.fn(() => null) };
  return {
    getChart,
    runChart,
    renderer,
    getInjection: vi.fn((token: string) => {
      if (token === 'GetCanonicalChartController') return getChart;
      if (token === 'RunSavedCanonicalChartController') return runChart;
      if (token === 'ChartRendererService') return renderer;
      throw new Error(`Unexpected injection: ${token}`);
    }),
  };
});

vi.mock('@/di/container', () => ({ getInjection }));

import { DashboardEditorChartPreview } from '@/app/(workspace)/analytics/dashboards/[dashboardId]/_components/dashboard-editor-chart-preview';
import { renderUi } from '@/tests/support/render-ui';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardEditorChartPreview', () => {
  it('renders table chart columns and rows inside a dashboard card', async () => {
    getChart.mockResolvedValue({
      id: 'bf655a3d-f79c-47b5-a635-5fc56f9aa1d4',
      organizationId: 'org-1',
      collectionId: 'collection-1',
      ownerIdentityId: 'identity-1',
      title: 'Brands',
      description: null,
      provenance: 'MANUAL',
      currentRevisionNumber: 1,
      queryDefinition: {
        schemaVersion: 1,
        mode: 'NATIVE',
        context: { catalog: 'iceberg', schema: 'analytics' },
        parameters: [],
        sql: 'SELECT name FROM brands',
      },
      visualizationDefinition: {
        schemaVersion: 1,
        type: 'TABLE',
        roles: { columns: ['Name'] },
        display: {},
      },
      outputSchema: [{ name: 'Name', type: 'varchar', family: 'STRING' }],
      createdAt: '2026-09-05T08:00:00.000Z',
      updatedAt: '2026-09-05T08:00:00.000Z',
    });
    runChart.mockResolvedValue({
      columns: [{ name: 'Name', type: 'varchar', family: 'STRING' }],
      rows: [['Thiên Thanh']],
      rowCount: 1,
      byteCount: 10,
      truncated: false,
      runId: 'run-1',
      proof: null,
    });

    renderUi(
      <DashboardEditorChartPreview
        card={{
          id: '6af8c2d0-d0aa-4aaf-a7a1-a47c7be43487',
          tabId: '9ab022e8-bfba-4ea5-99e6-eae7b307fd0d',
          kind: 'CHART',
          chartId: 'bf655a3d-f79c-47b5-a635-5fc56f9aa1d4',
          chartRevisionNumber: 1,
          visualizationOverrides: {},
          geometry: { x: 0, y: 0, width: 12, height: 6 },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByText('Thiên Thanh')).toBeTruthy());
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
  });

  it('keeps a bar chart preview fluid inside its dashboard card', async () => {
    getChart.mockResolvedValue({
      id: 'bf655a3d-f79c-47b5-a635-5fc56f9aa1d4',
      organizationId: 'org-1',
      collectionId: 'collection-1',
      ownerIdentityId: 'identity-1',
      title: 'Order_Brand',
      description: null,
      provenance: 'MANUAL',
      currentRevisionNumber: 1,
      queryDefinition: {
        schemaVersion: 1,
        mode: 'NATIVE',
        context: { catalog: 'iceberg', schema: 'analytics' },
        parameters: [],
        sql: 'SELECT brand, count(*) AS count_rows FROM orders GROUP BY brand',
      },
      visualizationDefinition: {
        schemaVersion: 1,
        type: 'BAR',
        roles: { category: 'brand', measure: 'count_rows', series: null },
        display: {},
      },
      outputSchema: [
        { name: 'brand', type: 'varchar', family: 'STRING' },
        { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
      ],
      createdAt: '2026-09-05T08:00:00.000Z',
      updatedAt: '2026-09-05T08:00:00.000Z',
    });
    runChart.mockResolvedValue({
      columns: [
        { name: 'brand', type: 'varchar', family: 'STRING' },
        { name: 'count_rows', type: 'bigint', family: 'NUMBER' },
      ],
      rows: [['Thiên Thanh', 35]],
      rowCount: 1,
      byteCount: 24,
      truncated: false,
      runId: 'run-2',
      proof: null,
    });
    renderer.compile.mockReturnValue({
      mark: 'BAR',
      rows: [{ brand: 'Thiên Thanh', count_rows: 35 }],
      series: [{ key: 'count_rows', label: 'count_rows', color: 'var(--mchart-1)' }],
      x: { dataKey: 'brand', visible: true, gridlines: true },
      y: { visible: true, gridlines: true },
      showLegend: false,
      stacked: false,
      orientation: 'VERTICAL',
      markers: false,
    });

    renderUi(
      <DashboardEditorChartPreview
        card={{
          id: '6af8c2d0-d0aa-4aaf-a7a1-a47c7be43487',
          tabId: '9ab022e8-bfba-4ea5-99e6-eae7b307fd0d',
          kind: 'CHART',
          chartId: 'bf655a3d-f79c-47b5-a635-5fc56f9aa1d4',
          chartRevisionNumber: 1,
          visualizationOverrides: {},
          geometry: { x: 0, y: 0, width: 12, height: 6 },
        }}
      />,
    );

    const preview = await screen.findByRole('img', { name: 'BAR chart preview' });
    expect(preview.className).toContain('w-full');
    expect(preview.parentElement?.className).toContain('w-full');
    expect(preview.parentElement?.parentElement?.className).toContain('w-full');
  });
});
