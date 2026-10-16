import type { Chart, ChartRevision } from '@domain/chart/models/chart';

describe('canonical Chart contracts', () => {
  it('separates the chart root from its immutable revision', () => {
    const chart: Chart = {
      id: 'chart-1',
      runId: null,
      chartType: 'canonical',
      encodings: {},
      data: [],
      config: {},
      vlSpec: null,
      sql: null,
      status: 'ready',
      errorMessage: null,
      version: 1,
      organizationId: 'org-1',
      collectionId: 'collection-1',
      ownerIdentityId: 'identity-1',
      title: 'Revenue',
      description: null,
      provenance: 'MANUAL',
      currentRevisionNumber: 1,
      legacyState: 'NONE',
      archivedAt: null,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const revision: Pick<ChartRevision, 'chartId' | 'revisionNumber'> = {
      chartId: chart.id,
      revisionNumber: chart.currentRevisionNumber ?? 0,
    };

    expect(revision).toEqual({ chartId: 'chart-1', revisionNumber: 1 });
  });
});
