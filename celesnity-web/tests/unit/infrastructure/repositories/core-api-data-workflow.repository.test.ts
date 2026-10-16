import { describe, expect, it, vi } from 'vitest';

import { CoreApiDataWorkflowRepository } from '@/src/infrastructure/repositories/core-api-data-workflow.repository';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { createManualWorkflowDraft } from '@/src/entities/models/data-workflow-graph';

const response = {
  data: [
    {
      id: 'workflow-1',
      name: 'Daily ingest',
      revision: 1,
      paused: false,
      draft: {},
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 1,
};

describe('CoreApiDataWorkflowRepository', () => {
  it('lists data workflows via the separate Core route with encoded pagination', async () => {
    const transport: GeneratedApiTransport = {
      request: vi.fn().mockResolvedValue(response),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);

    await expect(repository.list({ page: 2, pageSize: 50 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 'workflow-1', triggerKind: 'MANUAL' })],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    });
    expect(transport.request).toHaveBeenCalledWith('/data-workflows?page=2&pageSize=50', {
      method: 'GET',
    });
  });

  it('uses the separate create, draft-update, immutable-publish and preview endpoints', async () => {
    const draft = createManualWorkflowDraft('Daily ingest');
    const detail = {
      ...response.data[0],
      name: draft.name,
      draft: { nodes: [{ id: 'trigger', type: 'TRIGGER' }], edges: [] },
    };
    const transport: GeneratedApiTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce(detail)
        .mockResolvedValueOnce({ ...detail, revision: 2 })
        .mockResolvedValueOnce({
          id: 'version-1',
          versionNumber: 1,
          graph: detail.draft,
          trigger: { type: 'MANUAL' },
          publishedAt: '2026-09-18T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          source: 'DRAFT',
          kind: 'CALENDAR',
          timeOfDay: '07:00',
          weekdays: ['MON'],
          timezone: 'Asia/Ho_Chi_Minh',
          occurrences: ['2026-09-21T00:00:00.000Z'],
        }),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);

    await repository.create({ draft });
    await repository.update({ id: 'workflow-1', expectedRevision: 1, draft });
    await repository.publish('workflow-1', 2);
    await repository.previewSchedule('workflow-1', 'DRAFT', 1);

    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      '/data-workflows',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      '/data-workflows/workflow-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(transport.request).toHaveBeenNthCalledWith(3, '/data-workflows/workflow-1/versions', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 2 }),
    });
    expect(transport.request).toHaveBeenNthCalledWith(
      4,
      '/data-workflows/workflow-1/schedule/preview',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses workflow-scoped schedule, history and acknowledgement endpoints without sending run context', async () => {
    const transport: GeneratedApiTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          kind: 'CALENDAR',
          lifecycle: 'ENABLED',
          enabled: true,
          paused: false,
          occurrenceCoverage: { coalescedCount: 0 },
        })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ runId: 'run-1', status: 'QUEUED' })
        .mockResolvedValueOnce(undefined),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);

    await repository.getSchedule('workflow-1');
    await repository.listVersions('workflow-1', 20);
    await repository.listRuns('workflow-1', 20);
    await repository.startRun('workflow-1');
    await repository.retryNode({
      workflowId: 'workflow-1',
      runId: 'run-1',
      nodeId: 'load',
      expectedRevision: 2,
      acknowledgeWriteRisk: true,
    });

    expect(transport.request).toHaveBeenNthCalledWith(1, '/data-workflows/workflow-1/schedule', {
      method: 'GET',
    });
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      '/data-workflows/workflow-1/versions?limit=20',
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      3,
      '/data-workflows/workflow-1/runs?limit=20',
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(4, '/data-workflows/workflow-1/runs', {
      method: 'POST',
      body: JSON.stringify({ parameters: {} }),
    });
    expect(transport.request).toHaveBeenNthCalledWith(
      5,
      '/data-workflows/workflow-1/runs/run-1/retries',
      {
        method: 'POST',
        body: JSON.stringify({ nodeId: 'load', expectedRevision: 2, acknowledgeWriteRisk: true }),
      },
    );
  });

  it('validates Watch Source configuration through capability-qualified Core routes', async () => {
    const transport: GeneratedApiTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          connectorType: 'POSTGRESQL',
          polling: true,
          cdc: false,
          supportedChangeTypes: ['INSERT', 'UPDATE'],
        })
        .mockResolvedValueOnce({
          capabilities: {
            connectorType: 'POSTGRESQL',
            polling: true,
            cdc: false,
            supportedChangeTypes: ['INSERT', 'UPDATE'],
          },
          issues: [],
        }),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);
    const trigger = {
      type: 'WATCH_SOURCE' as const,
      mode: 'POLLING' as const,
      databaseServiceId: 'service/one',
      everySeconds: 600,
      relations: [
        {
          schema: 'public',
          table: 'orders',
          cursor: { changeColumn: 'updated_at', tieBreakerColumn: 'id' },
        },
      ],
    };

    await expect(
      repository.getWatchSourceCapabilities(trigger.databaseServiceId),
    ).resolves.toMatchObject({
      connectorType: 'POSTGRESQL',
      polling: true,
    });
    await expect(repository.validateWatchSource(trigger)).resolves.toMatchObject({ issues: [] });
    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      '/data-workflows/watch-sources/service%2Fone/capabilities',
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      '/data-workflows/watch-sources/service%2Fone/validate',
      { method: 'POST', body: JSON.stringify({ trigger }) },
    );
  });

  it('loads verified datasources and workflow-owned table metadata through safe catalog routes', async () => {
    const transport: GeneratedApiTransport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              id: 'service-1',
              name: 'Orders DB',
              connectorType: 'POSTGRESQL',
              verificationStatus: 'SUCCEEDED',
              metadataAvailable: true,
            },
          ],
          page: 1,
          pageSize: 50,
          totalItems: 1,
        })
        .mockResolvedValueOnce({
          data: [
            {
              schema: 'public',
              table: 'orders',
              relationType: 'TABLE',
              columns: [{ name: 'id', nativeType: 'uuid', nullable: false }],
            },
          ],
          page: 1,
          pageSize: 50,
          totalItems: 1,
        }),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);

    await expect(
      repository.listWatchSourceCatalog({ page: 1, pageSize: 50, search: ' orders ' }),
    ).resolves.toMatchObject({ data: [expect.objectContaining({ id: 'service-1' })] });
    await expect(
      repository.listWatchSourceRelations('service/one', { page: 1, pageSize: 50 }),
    ).resolves.toMatchObject({ data: [expect.objectContaining({ table: 'orders' })] });
    expect(transport.request).toHaveBeenNthCalledWith(
      1,
      '/data-workflows/watch-sources/catalog?page=1&pageSize=50&search=orders',
      { method: 'GET' },
    );
    expect(transport.request).toHaveBeenNthCalledWith(
      2,
      '/data-workflows/watch-sources/catalog/service%2Fone/relations?page=1&pageSize=50',
      { method: 'GET' },
    );
  });

  it('loads only the selected pinned pipeline target schemas and rejects malformed columns', async () => {
    const transport: GeneratedApiTransport = {
      request: vi.fn().mockResolvedValueOnce([
        {
          targetNodeId: 'target-1',
          tableName: 'analytics.orders',
          schemaStatus: 'KNOWN',
          columns: [{ id: 'status', name: 'status', type: 'string', nullable: false }],
        },
      ]),
      stream: vi.fn(),
    };
    const repository = new CoreApiDataWorkflowRepository(transport);
    await expect(repository.listPipelineTargets('pipeline/a', 7)).resolves.toEqual([
      expect.objectContaining({ targetNodeId: 'target-1', columns: [expect.objectContaining({ id: 'status' })] }),
    ]);
    expect(transport.request).toHaveBeenCalledWith(
      '/data-workflows/pipelines/pipeline%2Fa/versions/7/targets',
      { method: 'GET' },
    );

    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { targetNodeId: 'target-1', tableName: 'orders', schemaStatus: 'KNOWN', columns: [{ id: '', name: 'status', type: 'string', nullable: false }] },
    ]);
    await expect(repository.listPipelineTargets('pipeline/a', 7)).rejects.toThrow(/invalid pipeline target column/i);
  });
});
