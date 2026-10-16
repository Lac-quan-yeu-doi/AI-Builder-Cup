import { describe, expect, it, vi } from 'vitest';

import type { ChartRepository } from '@/src/application/repositories/chart.repository.interface';
import { createCreateChartUseCase } from '@/src/application/use-cases/charts/create-chart.use-case';
import { createPatchChartUseCase } from '@/src/application/use-cases/charts/patch-chart.use-case';
import { recommendChartTypes, type Chart } from '@/src/entities/models/chart';

function chart(): Chart {
  return {
    id: 'chart-1',
    runId: null,
    title: 'Sales',
    chartType: 'bar',
    encodings: {},
    data: [{ month: '2026-01', value: 10 }],
    config: {},
    vlSpec: null,
    sql: null,
    status: 'draft',
    errorMessage: null,
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  };
}

describe('chart application contracts', () => {
  it('normalizes titles before persisting a new chart', async () => {
    const repository: ChartRepository = {
      list: vi.fn(),
      create: vi.fn(async (input) => ({ ...chart(), title: input.title })),
      patch: vi.fn(),
      delete: vi.fn(),
      setDataFromCsv: vi.fn(),
    };
    await createCreateChartUseCase(repository)({
      title: '  Sales  ',
      chartType: 'bar',
    });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sales' }));
  });

  it('forwards expectedVersion with a patch command', async () => {
    const repository: ChartRepository = {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      setDataFromCsv: vi.fn(),
      patch: vi.fn(async (_id, input, expectedVersion) => ({
        ...chart(),
        ...input,
        version: expectedVersion + 1,
      })),
    };
    const result = await createPatchChartUseCase(repository)({
      id: 'chart-1',
      expectedVersion: 3,
      patch: { title: ' Updated ' },
    });
    expect(result.title).toBe('Updated');
    expect(repository.patch).toHaveBeenCalledWith('chart-1', { title: 'Updated' }, 3);
  });

  it('suggests time-series views when temporal and numeric fields coexist', () => {
    expect(recommendChartTypes([{ date: '2026-01-01', total: 10 }])).toEqual([
      'line',
      'area',
      'bar',
    ]);
  });
});
