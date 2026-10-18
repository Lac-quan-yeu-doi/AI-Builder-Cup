import type { ChartUseCases } from '@application/chart/chart.use-cases';
import { ChartError } from '@domain/chart/errors/chart.errors';
import { CitationUseCases } from '@application/citation/citation.use-cases';
import type { Chart } from '@domain/chart/models/chart';

function buildUseCases(): CitationUseCases {
  const chart: Chart = {
    id: 'chart-1',
    runId: null,
    title: 'Revenue by month',
    chartType: 'bar',
    encodings: {},
    data: [],
    config: {},
    vlSpec: null,
    sql: null,
    status: 'draft',
    errorMessage: null,
    version: 1,
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  };
  const chartUseCases = {
    findById: async (id: string): Promise<Chart> => {
      if (id !== chart.id) throw ChartError.notFound(id);
      return chart;
    },
  } as unknown as ChartUseCases;

  return new CitationUseCases(chartUseCases);
}

describe('CitationUseCases', () => {
  it('resolves a chart citation to its title', async () => {
    const useCases = buildUseCases();

    const [result] = await useCases.resolve([{ type: 'chart', id: 'chart-1' }]);

    expect(result).toEqual({
      type: 'chart',
      id: 'chart-1',
      found: true,
      title: 'Revenue by month',
    });
  });

  it('tolerates a legacy document citation without resolving retired content', async () => {
    const useCases = buildUseCases();

    const [result] = await useCases.resolve([{ type: 'document', id: 'doc-1', page: 3 }]);

    expect(result).toEqual({
      type: 'document',
      id: 'doc-1',
      found: false,
      title: null,
      page: 3,
    });
  });

  it('marks an unknown reference as not found instead of throwing', async () => {
    const useCases = buildUseCases();

    const [result] = await useCases.resolve([{ type: 'chart', id: 'missing' }]);

    expect(result).toEqual({ type: 'chart', id: 'missing', found: false, title: null });
  });

  it('resolves chart references independently from legacy document references', async () => {
    const useCases = buildUseCases();

    const results = await useCases.resolve([
      { type: 'chart', id: 'chart-1' },
      { type: 'document', id: 'missing' },
      { type: 'document', id: 'doc-1' },
    ]);

    expect(results.map((r) => r.found)).toEqual([true, false, false]);
  });
});
