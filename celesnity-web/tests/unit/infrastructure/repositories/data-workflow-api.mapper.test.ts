import { describe, expect, it } from 'vitest';

import {
  fromDataWorkflowDetailResponse,
  fromDataWorkflowResponse,
  fromDataWorkflowRunResponse,
  fromDataWorkflowVersionResponse,
  fromDataWorkflowWatchSourceCatalogRelationsResponse,
  fromDataWorkflowWatchSourceCatalogServicesResponse,
  fromDataWorkflowWatchSourceValidationResponse,
} from '@/src/infrastructure/repositories/data-workflow-api.mapper';

describe('data workflow API mapper', () => {
  it('retains immutable node display names and recovered failure metadata', () => {
    const version = fromDataWorkflowVersionResponse({
      id: 'version-1',
      versionNumber: 1,
      graph: {},
      trigger: {},
      publishedAt: '2026-09-18T00:00:00.000Z',
      pipelineDisplayNames: { job: 'Orders ingest' },
    });
    const run = fromDataWorkflowRunResponse({
      id: 'run-1',
      status: 'SUCCEEDED',
      revision: 2,
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T00:01:00.000Z',
      recoveredFailure: true,
      versionId: 'version-1',
      selectedOutcomeRoutes: [{ nodeId: 'outcome', portId: 'error' }],
      nodeDisplayNames: { job: 'Orders ingest' },
      attempts: [{ nodeId: 'job', attemptNumber: 1, state: 'FAILED' }],
    });
    expect(version.pipelineDisplayNames).toEqual({ job: 'Orders ingest' });
    expect(run).toMatchObject({
      recoveredFailure: true,
      versionId: 'version-1',
      selectedOutcomeRoutes: [{ nodeId: 'outcome', portId: 'error' }],
      nodeDisplayNames: { job: 'Orders ingest' },
      attempts: [{ nodeId: 'job', state: 'FAILED' }],
    });
  });
  it('maps the workflow name and graph from the Core detail response shape', () => {
    expect(
      fromDataWorkflowDetailResponse({
        id: 'workflow-1',
        name: 'Daily ingest',
        revision: 2,
        paused: false,
        draft: {
          nodes: [{ id: 'trigger', type: 'TRIGGER' }],
          edges: [],
        },
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T01:00:00.000Z',
      }),
    ).toEqual(
      expect.objectContaining({
        name: 'Daily ingest',
        draft: expect.objectContaining({
          name: 'Daily ingest',
          graph: expect.objectContaining({
            nodes: [expect.objectContaining({ id: 'trigger', type: 'TRIGGER' })],
            edges: [],
          }),
        }),
      }),
    );
  });

  it('maps only safe workflow list fields and optional schedule summaries', () => {
    expect(
      fromDataWorkflowResponse({
        id: 'workflow-1',
        name: 'Daily ingest',
        revision: 3,
        publishedVersion: 2,
        paused: false,
        draft: {
          nodes: [{ id: 'trigger', type: 'TRIGGER', config: { type: 'INTERVAL' } }],
          edges: [],
        },
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T01:00:00.000Z',
        schedule: {
          kind: 'INTERVAL',
          lifecycle: 'ENABLED',
          enabled: true,
          paused: false,
          nextDueAt: '2026-09-18T01:10:00.000Z',
          occurrenceCoverage: { coalescedCount: 0 },
        },
      }),
    ).toEqual({
      id: 'workflow-1',
      name: 'Daily ingest',
      revision: 3,
      publishedVersion: 2,
      paused: false,
      triggerKind: 'INTERVAL',
      createdAt: '2026-09-18T00:00:00.000Z',
      updatedAt: '2026-09-18T01:00:00.000Z',
      schedule: {
        kind: 'INTERVAL',
        lifecycle: 'ENABLED',
        enabled: true,
        paused: false,
        nextDueAt: '2026-09-18T01:10:00.000Z',
        occurrenceCoverage: { coalescedCount: 0 },
      },
    });
  });

  it('treats a missing or malformed draft trigger as manual', () => {
    expect(
      fromDataWorkflowResponse({
        id: 'workflow-1',
        name: 'Manual ingest',
        revision: 1,
        paused: false,
        draft: {},
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      }).triggerKind,
    ).toBe('MANUAL');
  });

  it('maps Watch Source trigger summaries and safe validation issues', () => {
    expect(
      fromDataWorkflowResponse({
        id: 'workflow-1',
        name: 'Source watcher',
        revision: 1,
        paused: false,
        draft: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              config: { type: 'WATCH_SOURCE' },
            },
          ],
          edges: [],
        },
        createdAt: '2026-09-18T00:00:00.000Z',
        updatedAt: '2026-09-18T00:00:00.000Z',
      }).triggerKind,
    ).toBe('WATCH_SOURCE');
    expect(
      fromDataWorkflowWatchSourceValidationResponse({
        capabilities: {
          connectorType: 'POSTGRESQL',
          polling: true,
          cdc: false,
          supportedChangeTypes: ['INSERT', 'UPDATE'],
        },
        cdcPreflight: {
          available: false,
          code: 'BINLOG_FORMAT_NOT_ROW',
          message: 'MySQL binlog_format must be ROW for CDC.',
          remediation: "Set binlog_format to 'ROW' and restart MySQL.",
        },
        issues: [
          {
            code: 'CURSOR_COLUMN_NOT_AVAILABLE',
            relation: { schema: 'public', table: 'orders' },
            column: 'updated_at',
          },
        ],
      }),
    ).toEqual({
      capabilities: {
        connectorType: 'POSTGRESQL',
        polling: true,
        cdc: false,
        supportedChangeTypes: ['INSERT', 'UPDATE'],
      },
      issues: [
        {
          code: 'CURSOR_COLUMN_NOT_AVAILABLE',
          relation: { schema: 'public', table: 'orders' },
          column: 'updated_at',
        },
      ],
      cdcPreflight: {
        available: false,
        code: 'BINLOG_FORMAT_NOT_ROW',
        message: 'MySQL binlog_format must be ROW for CDC.',
        remediation: "Set binlog_format to 'ROW' and restart MySQL.",
      },
    });
  });

  it('maps metadata catalog pages without retaining mutable response arrays', () => {
    const services = fromDataWorkflowWatchSourceCatalogServicesResponse({
      data: [
        {
          id: 'service-1',
          name: 'Orders DB',
          databaseNames: ['analytics'],
          connectorType: 'POSTGRESQL',
          verificationStatus: 'SUCCEEDED',
          metadataAvailable: true,
        },
      ],
      page: 1,
      pageSize: 50,
      totalItems: 1,
    });
    const relations = fromDataWorkflowWatchSourceCatalogRelationsResponse({
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
    });

    expect(services.data[0]).toEqual({
      id: 'service-1',
      name: 'Orders DB',
      databaseNames: ['analytics'],
      databaseName: 'analytics',
      connectorType: 'POSTGRESQL',
      verificationStatus: 'SUCCEEDED',
      metadataAvailable: true,
    });
    expect(relations.data[0]).toEqual({
      schema: 'public',
      table: 'orders',
      relationType: 'TABLE',
      columns: [{ name: 'id', nativeType: 'uuid', nullable: false }],
    });
  });
});
