// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SavedChartScreen } from '@/app/(workspace)/analytics/charts/[chartId]/_components/saved-chart-screen';
import { renderUi } from '@/tests/support/render-ui';
import type { CanonicalChart, ChartRevision } from '@/src/entities/models/canonical-chart';

const queryDefinition = {
  schemaVersion: 1 as const,
  mode: 'NATIVE' as const,
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  sql: 'SELECT region FROM iceberg.analytics.sales',
};

const visualizationDefinition = {
  schemaVersion: 1 as const,
  type: 'TABLE' as const,
  roles: { columns: ['region'] },
  display: {},
};

const chart: CanonicalChart = {
  id: 'chart-1',
  title: 'Revenue',
  description: null,
  organizationId: 'org-1',
  collectionId: 'collection-1',
  ownerIdentityId: 'identity-1',
  provenance: 'MANUAL',
  currentRevisionNumber: 2,
  queryDefinition,
  visualizationDefinition,
  outputSchema: [],
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

const revisions: readonly ChartRevision[] = [
  {
    chartId: 'chart-1',
    revisionNumber: 2,
    title: 'Revenue',
    queryDefinition,
    visualizationDefinition,
    outputSchema: [],
    createdAt: '2026-09-10T00:00:00.000Z',
    restoredFromRevisionNumber: null,
  },
  {
    chartId: 'chart-1',
    revisionNumber: 1,
    title: 'Revenue',
    queryDefinition,
    visualizationDefinition,
    outputSchema: [],
    createdAt: '2026-09-09T00:00:00.000Z',
    restoredFromRevisionNumber: null,
  },
];

afterEach(cleanup);

describe('SavedChartScreen version history', () => {
  it('owns the saved-chart vertical scroll inside the route viewport', () => {
    renderUi(
      <SavedChartScreen
        chart={chart}
        preview={null}
        revisions={revisions}
        loading={false}
        running={false}
        restoringRevisionNumber={null}
        notice={null}
        error={null}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        renderer={{ compile: vi.fn(() => null) }}
      />,
    );

    const savedChart = screen.getByRole('main', { name: 'Saved chart' });
    expect(savedChart.className).toContain('h-full');
    expect(savedChart.className).toContain('min-h-0');
    expect(savedChart.className).toContain('overflow-y-auto');
  });

  it('labels numbered versions and confirms an append-only restore', () => {
    const onRestore = vi.fn();
    renderUi(
      <SavedChartScreen
        chart={chart}
        preview={null}
        revisions={revisions}
        loading={false}
        running={false}
        restoringRevisionNumber={null}
        notice={null}
        error={null}
        onRefresh={vi.fn()}
        onRestore={onRestore}
        renderer={{ compile: vi.fn(() => null) }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Version history \(2\)/ }));
    const history = screen.getByRole('list', { name: 'Chart versions' });
    expect(within(history).getByText('Version 2')).toBeTruthy();
    expect(within(history).getByText('Version 1')).toBeTruthy();
    expect(within(history).getByText('Current')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByText('Restore version 1?')).toBeTruthy();
    expect(
      screen.getByText('This keeps the existing history and creates version 3 from version 1.'),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' }).at(-1)!);

    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('names where a chart came from instead of printing the enum', () => {
    renderUi(
      <SavedChartScreen
        chart={{ ...chart, provenance: 'CHAT' }}
        preview={null}
        revisions={revisions}
        loading={false}
        running={false}
        restoringRevisionNumber={null}
        notice={null}
        error={null}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        renderer={{ compile: vi.fn(() => null) }}
        collectionName="Personal"
      />,
    );

    expect(screen.getByText('From chat')).toBeTruthy();
    expect(screen.queryByText(/·\s*CHAT/u)).toBeNull();
  });

  it('gives the chart a way back to its collection', () => {
    renderUi(
      <SavedChartScreen
        chart={chart}
        preview={null}
        revisions={revisions}
        loading={false}
        running={false}
        restoringRevisionNumber={null}
        notice={null}
        error={null}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        renderer={{ compile: vi.fn(() => null) }}
        collectionName="Finance"
      />,
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Finance' })).toBeTruthy();
  });

  it('shows the chart and the rows behind it one at a time', () => {
    renderUi(
      <SavedChartScreen
        chart={{
          ...chart,
          visualizationDefinition: {
            schemaVersion: 1,
            type: 'BAR',
            roles: { category: 'machine', measures: ['max_temp_c'] },
            display: {},
          },
        }}
        preview={{
          columns: [
            { name: 'machine', type: 'VARCHAR', family: 'STRING' },
            { name: 'max_temp_c', type: 'DOUBLE', family: 'NUMBER' },
          ],
          rows: [['PRESS-A01', 61.5]],
          rowCount: 1,
        }}
        revisions={revisions}
        loading={false}
        running={false}
        restoringRevisionNumber={null}
        notice={null}
        error={null}
        onRefresh={vi.fn()}
        onRestore={vi.fn()}
        renderer={{ compile: vi.fn(() => null) }}
      />,
    );

    // Both used to render stacked on every visit, so the numbers were always
    // below the fold behind a picture of themselves.
    expect(screen.getByRole('tab', { name: 'Chart' })).toBeTruthy();
    expect(screen.queryByText('max_temp_c')).toBeNull();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Data' }));
    expect(screen.getByRole('columnheader', { name: 'max_temp_c' })).toBeTruthy();
  });
});
