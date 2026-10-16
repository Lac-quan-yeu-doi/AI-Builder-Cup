import { ChatChartCreationUseCases } from '@application/chart/chat-chart-creation.use-cases';

const actor = { organizationId: 'org-1', identityId: 'user-1' };
const query = {
  schemaVersion: 1 as const,
  mode: 'NATIVE' as const,
  context: { catalog: 'iceberg', schema: 'analytics' },
  sql: 'SELECT region, revenue FROM orders',
  parameters: [],
};
const visualization = {
  schemaVersion: 1 as const,
  type: 'BAR' as const,
  roles: { category: 'region', measures: ['revenue'] },
  display: {},
};

describe('ChatChartCreationUseCases', () => {
  it('returns a transient preview without touching collection or authoring ports', async () => {
    const stream = (async function* () {
      yield {
        type: 'COLUMNS' as const,
        columns: [
          { name: 'region', type: 'varchar', family: 'STRING' as const },
          { name: 'revenue', type: 'double', family: 'NUMBER' as const },
        ],
      };
      yield { type: 'ROWS' as const, rows: [['west', 10]] };
      yield {
        type: 'SUCCEEDED' as const,
        rowCount: 1,
        byteCount: 20,
        truncated: false,
      };
    })();
    const runtime = { previewChartDraft: jest.fn().mockResolvedValue({ runId: 'run-1', stream }) };
    const authoring = { createChart: jest.fn() };
    const collections = {
      ensurePersonalCollection: jest.fn(),
      requireCurate: jest.fn(),
    };
    const useCases = new ChatChartCreationUseCases(
      runtime as never,
      authoring as never,
      collections as never,
    );

    await expect(
      useCases.preview({
        actor,
        title: 'Revenue by region',
        queryDefinition: query,
        visualizationDefinition: visualization,
      }),
    ).resolves.toEqual({
      runId: 'run-1',
      columns: [
        { name: 'region', type: 'varchar', family: 'STRING' },
        { name: 'revenue', type: 'double', family: 'NUMBER' },
      ],
      rows: [['west', 10]],
      rowCount: 1,
      byteCount: 20,
      truncated: false,
    });
    expect(authoring.createChart).not.toHaveBeenCalled();
    expect(collections.ensurePersonalCollection).not.toHaveBeenCalled();
    expect(collections.requireCurate).not.toHaveBeenCalled();
  });

  it('requires the selected collection, reruns, and writes one CHAT chart', async () => {
    const stream = (async function* () {
      yield {
        type: 'COLUMNS' as const,
        columns: [
          { name: 'region', type: 'varchar', family: 'STRING' as const },
          { name: 'revenue', type: 'double', family: 'NUMBER' as const },
        ],
      };
      yield { type: 'ROWS' as const, rows: [['west', 10]] };
      yield {
        type: 'SUCCEEDED' as const,
        rowCount: 1,
        byteCount: 20,
        truncated: false,
      };
    })();
    const runtime = { previewChartDraft: jest.fn().mockResolvedValue({ runId: 'run-1', stream }) };
    const authoring = {
      createChart: jest
        .fn()
        .mockResolvedValue({ chart: { id: 'chart-1' }, revision: { revisionNumber: 1 } }),
    };
    const collections = {
      ensurePersonalCollection: jest.fn(),
      requireCurate: jest.fn().mockResolvedValue(undefined),
    };
    const useCases = new ChatChartCreationUseCases(
      runtime as never,
      authoring as never,
      collections as never,
    );

    await useCases.create({
      actor,
      collectionId: 'collection-1',
      title: 'Revenue by region',
      queryDefinition: query,
      visualizationDefinition: visualization,
    });

    expect(runtime.previewChartDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ outputSchema: [] }),
      }),
    );
    expect(collections.requireCurate).toHaveBeenCalledWith('collection-1', {
      organizationId: 'org-1',
      identityId: 'user-1',
      isOrganizationAdmin: false,
    });
    expect(collections.ensurePersonalCollection).not.toHaveBeenCalled();
    expect(authoring.createChart).toHaveBeenCalledWith({
      actor,
      draft: expect.objectContaining({
        collectionId: 'collection-1',
        outputSchema: [
          { name: 'region', type: 'varchar', family: 'STRING' },
          { name: 'revenue', type: 'double', family: 'NUMBER' },
        ],
        provenance: 'CHAT',
      }),
    });
    expect(JSON.stringify(authoring.createChart.mock.calls[0])).not.toContain('west');
  });

  it('does not write when the bounded query fails', async () => {
    const stream = (async function* () {
      yield { type: 'FAILED' as const, code: 'QUERY_FAILED', message: 'Query failed.' };
    })();
    const runtime = { previewChartDraft: jest.fn().mockResolvedValue({ runId: 'run-1', stream }) };
    const authoring = { createChart: jest.fn() };
    const collections = {
      ensurePersonalCollection: jest.fn(),
      requireCurate: jest.fn().mockResolvedValue(undefined),
    };
    const useCases = new ChatChartCreationUseCases(
      runtime as never,
      authoring as never,
      collections as never,
    );

    await expect(
      useCases.create({
        actor,
        collectionId: 'collection-1',
        title: 'Broken chart',
        queryDefinition: query,
        visualizationDefinition: visualization,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_FAILED' });
    expect(authoring.createChart).not.toHaveBeenCalled();
  });

  it('does not execute or write when CURATE access is denied', async () => {
    const denied = new Error('denied');
    const runtime = { previewChartDraft: jest.fn() };
    const authoring = { createChart: jest.fn() };
    const collections = {
      requireCurate: jest.fn().mockRejectedValue(denied),
    };
    const useCases = new ChatChartCreationUseCases(
      runtime as never,
      authoring as never,
      collections as never,
    );

    await expect(
      useCases.create({
        actor,
        collectionId: 'collection-1',
        title: 'Revenue by region',
        queryDefinition: query,
        visualizationDefinition: visualization,
      }),
    ).rejects.toBe(denied);
    expect(runtime.previewChartDraft).not.toHaveBeenCalled();
    expect(authoring.createChart).not.toHaveBeenCalled();
  });

  it('does not write when the save-time execution is analytically truncated', async () => {
    const stream = (async function* () {
      yield {
        type: 'COLUMNS' as const,
        columns: [{ name: 'region', type: 'varchar', family: 'STRING' as const }],
      };
      yield { type: 'ROWS' as const, rows: [['west']] };
      yield {
        type: 'SUCCEEDED' as const,
        rowCount: 1,
        byteCount: 10,
        truncated: true,
      };
    })();
    const runtime = { previewChartDraft: jest.fn().mockResolvedValue({ runId: 'run-1', stream }) };
    const authoring = { createChart: jest.fn() };
    const collections = { requireCurate: jest.fn().mockResolvedValue(undefined) };
    const useCases = new ChatChartCreationUseCases(
      runtime as never,
      authoring as never,
      collections as never,
    );

    await expect(
      useCases.create({
        actor,
        collectionId: 'collection-1',
        title: 'Revenue by region',
        queryDefinition: query,
        visualizationDefinition: visualization,
      }),
    ).rejects.toMatchObject({ code: 'CHART_PREVIEW_MISMATCH' });
    expect(authoring.createChart).not.toHaveBeenCalled();
  });
});
