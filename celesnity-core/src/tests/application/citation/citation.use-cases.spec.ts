import type { ChartUseCases } from '@application/chart/chart.use-cases';
import { ChartError } from '@domain/chart/errors/chart.errors';
import { CitationUseCases } from '@application/citation/citation.use-cases';
import { DocumentError } from '@domain/document/errors/document.errors';
import type { DocumentUseCases } from '@application/document/document.use-cases';
import type { Chart } from '@domain/chart/models/chart';
import type { Document } from '@domain/document/models/document';

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
  const document: Document = {
    id: 'doc-1',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    storageKey: 'documents/doc-1.pdf',
    pages: ['One.'],
    pageCount: 1,
    extractionStatus: 'extracted',
    chartPreviews: [],
    createdAt: '2026-08-25T00:00:00.000Z',
  };

  const chartUseCases = {
    findById: async (id: string): Promise<Chart> => {
      if (id !== chart.id) throw ChartError.notFound(id);
      return chart;
    },
  } as unknown as ChartUseCases;

  const documentUseCases = {
    findById: async (id: string): Promise<Document> => {
      if (id !== document.id) throw DocumentError.notFound(id);
      return document;
    },
  } as unknown as DocumentUseCases;

  return new CitationUseCases(chartUseCases, documentUseCases);
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

  it('resolves a document citation to its filename, carrying the page through', async () => {
    const useCases = buildUseCases();

    const [result] = await useCases.resolve([{ type: 'document', id: 'doc-1', page: 3 }]);

    expect(result).toEqual({
      type: 'document',
      id: 'doc-1',
      found: true,
      title: 'report.pdf',
      page: 3,
    });
  });

  it('marks an unknown reference as not found instead of throwing', async () => {
    const useCases = buildUseCases();

    const [result] = await useCases.resolve([{ type: 'chart', id: 'missing' }]);

    expect(result).toEqual({ type: 'chart', id: 'missing', found: false, title: null });
  });

  it('resolves a mixed batch independently, one failure does not affect the rest', async () => {
    const useCases = buildUseCases();

    const results = await useCases.resolve([
      { type: 'chart', id: 'chart-1' },
      { type: 'document', id: 'missing' },
      { type: 'document', id: 'doc-1' },
    ]);

    expect(results.map((r) => r.found)).toEqual([true, false, true]);
  });
});
