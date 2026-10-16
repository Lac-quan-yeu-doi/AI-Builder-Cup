import { describe, expect, it, vi } from 'vitest';

import { createSaveChatChartPreviewUseCase } from '@/src/application/use-cases/canonical-charts/save-chat-chart-preview.use-case';
import type { ChatChartPreview } from '@/src/entities/models/chat-chart-preview';

const preview: ChatChartPreview = {
  kind: 'preview',
  schemaVersion: 1,
  title: 'Revenue by region',
  description: null,
  queryDefinition: {
    schemaVersion: 1,
    mode: 'NATIVE',
    context: { catalog: 'iceberg', schema: 'analytics' },
    parameters: [],
    sql: 'SELECT region, revenue FROM orders',
  },
  visualizationDefinition: {
    schemaVersion: 1,
    type: 'BAR',
    roles: { category: 'region', measures: ['revenue'] },
    display: {},
  },
  outputSchema: [
    { name: 'region', type: 'varchar', family: 'STRING' },
    { name: 'revenue', type: 'double', family: 'NUMBER' },
  ],
  parameterValues: {},
  rows: [['west', 10]],
  runId: 'run-1',
  rowCount: 1,
  byteCount: 20,
  truncated: false,
  displayTruncated: false,
};

describe('createSaveChatChartPreviewUseCase', () => {
  it('trims title and delegates the canonical draft exactly once', async () => {
    const saved = { id: 'chart-1' };
    const repository = { saveChatPreview: vi.fn().mockResolvedValue(saved) };
    const save = createSaveChatChartPreviewUseCase(repository as never);

    await expect(
      save({
        title: '  Revenue by region  ',
        description: null,
        collectionId: 'collection-1',
        queryDefinition: preview.queryDefinition,
        visualizationDefinition: preview.visualizationDefinition,
        outputSchema: preview.outputSchema,
        parameterValues: preview.parameterValues,
        truncated: preview.truncated,
      }),
    ).resolves.toBe(saved);
    expect(repository.saveChatPreview).toHaveBeenCalledOnce();
    expect(repository.saveChatPreview).toHaveBeenCalledWith({
      title: 'Revenue by region',
      description: null,
      collectionId: 'collection-1',
      queryDefinition: preview.queryDefinition,
      visualizationDefinition: preview.visualizationDefinition,
      outputSchema: preview.outputSchema,
      parameterValues: preview.parameterValues,
    });
  });

  it.each([
    { title: ' ', collectionId: 'collection-1', truncated: false },
    { title: 'Chart', collectionId: ' ', truncated: false },
    { title: 'Chart', collectionId: 'collection-1', truncated: true },
  ])('rejects an invalid save without calling the repository %#', async (candidate) => {
    const repository = { saveChatPreview: vi.fn() };
    const save = createSaveChatChartPreviewUseCase(repository as never);

    await expect(
      save({
        title: candidate.title,
        description: null,
        collectionId: candidate.collectionId,
        queryDefinition: preview.queryDefinition,
        visualizationDefinition: preview.visualizationDefinition,
        outputSchema: preview.outputSchema,
        parameterValues: preview.parameterValues,
        truncated: candidate.truncated,
      }),
    ).rejects.toThrow();
    expect(repository.saveChatPreview).not.toHaveBeenCalled();
  });
});
