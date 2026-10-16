import { ChartAuthoringUseCases } from '@application/chart/chart-authoring.use-cases';
import { ChartCollectionError } from '@domain/chart-collection/errors/chart-collection.errors';

describe('ChartAuthoringUseCases', () => {
  it('requires curate access to the current collection before updating into a target collection', async () => {
    const currentCollectionId = 'collection-current';
    const targetCollectionId = 'collection-target';
    const query = {
      schemaVersion: 1 as const,
      mode: 'NATIVE' as const,
      context: { catalog: 'iceberg', schema: 'analytics' },
      parameters: [],
      sql: 'SELECT 1',
    };
    const visualization = {
      schemaVersion: 1 as const,
      type: 'NUMBER' as const,
      roles: { measure: 'value' },
      display: {},
    };
    const existing = {
      chart: {
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
        collectionId: currentCollectionId,
        ownerIdentityId: 'user-1',
        title: 'Original',
        description: null,
        provenance: 'MANUAL' as const,
        currentRevisionNumber: 1,
        legacyState: 'NONE' as const,
        archivedAt: null,
        createdAt: '2026-09-03T00:00:00.000Z',
        updatedAt: '2026-09-03T00:00:00.000Z',
      },
      revision: {
        id: 'revision-1',
        chartId: 'chart-1',
        revisionNumber: 1,
        queryDefinition: query,
        visualizationDefinition: visualization,
        outputSchema: [{ name: 'value', type: 'integer', family: 'NUMBER' as const }],
        queryHash: 'hash',
        createdByIdentityId: 'user-1',
        createdAt: '2026-09-03T00:00:00.000Z',
        restoredFromRevisionNumber: null,
      },
    };
    const repository = {
      findCanonicalById: jest.fn().mockResolvedValue(existing),
      updateCanonical: jest.fn(),
    };
    const collections = {
      requireAccess: jest.fn().mockImplementation(async (collectionId: string) => {
        if (collectionId === currentCollectionId) throw ChartCollectionError.accessDenied();
        return 'CURATE';
      }),
    };
    const useCases = new ChartAuthoringUseCases(
      repository as never,
      { next: jest.fn().mockReturnValueOnce('revision-2') },
      { now: () => new Date('2026-09-03T00:00:00.000Z') },
      collections as never,
    );

    await expect(
      useCases.updateChartFromDraft({
        actor: { organizationId: 'org-1', identityId: 'user-2' },
        chartId: 'chart-1',
        expectedRevision: 1,
        draft: {
          title: 'Hijacked',
          collectionId: targetCollectionId,
          queryDefinition: query,
          visualizationDefinition: visualization,
          outputSchema: [{ name: 'value', type: 'integer', family: 'NUMBER' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'COLLECTION_ACCESS_DENIED' });
    expect(collections.requireAccess).toHaveBeenCalledWith(
      currentCollectionId,
      expect.objectContaining({ identityId: 'user-2' }),
      'CURATE',
    );
    expect(repository.updateCanonical).not.toHaveBeenCalled();
  });

  it('restores an older revision by appending a new revision and preserving history', async () => {
    const target = {
      id: 'revision-1',
      chartId: 'chart-1',
      revisionNumber: 1,
      queryDefinition: {
        schemaVersion: 1 as const,
        mode: 'NATIVE' as const,
        context: { catalog: 'iceberg', schema: 'analytics' },
        parameters: [],
        sql: 'SELECT old_value FROM source',
      },
      visualizationDefinition: {
        schemaVersion: 1 as const,
        type: 'NUMBER' as const,
        roles: { measure: 'old_value' },
        display: {},
      },
      outputSchema: [{ name: 'old_value', type: 'integer', family: 'NUMBER' as const }],
      queryHash: 'old-hash',
      createdByIdentityId: 'user-1',
      createdAt: '2026-09-01T00:00:00.000Z',
      restoredFromRevisionNumber: null,
    };
    const chart = {
      id: 'chart-1',
      organizationId: 'org-1',
      collectionId: 'collection-1',
      ownerIdentityId: 'user-1',
      title: 'Revenue',
      currentRevisionNumber: 3,
      updatedAt: '2026-09-09T00:00:00.000Z',
    };
    const restoreRevision = jest.fn().mockImplementation(async ({ chart: next, revision }) => ({
      chart: next,
      revision,
    }));
    const repository = {
      findCanonicalById: jest.fn().mockResolvedValue({ chart, revision: {} }),
      listRevisions: jest.fn().mockResolvedValue([target]),
      restoreRevision,
    };
    const useCases = new ChartAuthoringUseCases(
      repository as never,
      { next: jest.fn().mockReturnValue('revision-4') },
      { now: () => new Date('2026-09-10T03:30:00.000Z') },
    );

    const restored = await useCases.restoreChartRevision({
      actor: { organizationId: 'org-1', identityId: 'user-2' },
      chartId: 'chart-1',
      revisionNumber: 1,
      expectedRevision: 3,
    });

    expect(restored.chart.currentRevisionNumber).toBe(4);
    expect(restored.revision).toMatchObject({
      id: 'revision-4',
      revisionNumber: 4,
      queryDefinition: target.queryDefinition,
      visualizationDefinition: target.visualizationDefinition,
      queryHash: 'old-hash',
      restoredFromRevisionNumber: 1,
    });
    expect(restoreRevision).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevisionNumber: 3 }),
    );
  });
});
