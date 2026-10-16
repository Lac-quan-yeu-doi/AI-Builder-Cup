import { ChartUseCases } from '@application/chart/chart.use-cases';
import type { IChartRepository } from '@application/chart/interfaces/i-chart.repository';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { Chart } from '@domain/chart/models/chart';

function buildUseCases() {
  let stored: Chart | null = null;
  const repository: IChartRepository = {
    create: jest.fn(async (chart) => {
      stored = chart;
      return chart;
    }),
    findById: jest.fn(async () => stored),
    update: jest.fn(async (chart, expectedVersion) => {
      if (!stored || expectedVersion !== stored.version) return null;
      stored = chart;
      return chart;
    }),
    delete: jest.fn(async (_id, expectedVersion) =>
      Boolean(stored && expectedVersion === stored.version),
    ),
    list: jest.fn(async () => (stored ? [stored] : [])),
  };
  const clock: IClock = { now: () => new Date('2026-08-21T00:00:00.000Z') };
  const ids: IIdGenerator = { next: () => 'chart-1' };
  return { useCases: new ChartUseCases(repository, clock, ids), repository };
}

describe('ChartUseCases', () => {
  it('creates a ready chart with a Vega-Lite spec when data and encodings exist', async () => {
    const { useCases, repository } = buildUseCases();
    const chart = await useCases.create({
      title: 'Revenue by month',
      chartType: 'line',
      sql: 'SELECT month, revenue FROM sales',
      encodings: {
        x: { field: 'month', type: 'temporal' },
        y: { field: 'revenue', type: 'quantitative' },
      },
      data: [{ month: '2026-01', revenue: 100 }],
      config: { legend: false },
    });

    expect(chart).toMatchObject({ id: 'chart-1', status: 'ready', version: 1 });
    expect(chart.vlSpec).toMatchObject({ config: { legend: false } });
    expect(repository.create).toHaveBeenCalledWith(chart);
  });

  it('rejects chart creation when SQL is missing or blank', async () => {
    const { useCases } = buildUseCases();
    const inputs = [
      { title: 'A', chartType: 'bar' },
      { title: 'A', chartType: 'bar', sql: '   ' },
    ] as unknown as Parameters<typeof useCases.create>[0][];

    for (const input of inputs) {
      await expect(useCases.create(input)).rejects.toThrow('Chart SQL is required.');
    }
  });

  it('increments the version and rejects a stale patch', async () => {
    const { useCases } = buildUseCases();
    const chart = await useCases.create({
      title: 'A',
      chartType: 'bar',
      sql: 'SELECT 1',
    });
    const updated = await useCases.patch('chart-1', { title: 'B', expectedVersion: chart.version });

    expect(updated.title).toBe('B');
    expect(updated.version).toBe(2);
    await expect(useCases.patch('chart-1', { title: 'C', expectedVersion: 1 })).rejects.toThrow(
      'The chart version has changed.',
    );
  });
});
