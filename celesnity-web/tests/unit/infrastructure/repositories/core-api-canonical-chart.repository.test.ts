import { describe, expect, it } from 'vitest';

import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiCanonicalChartRepository } from '@/src/infrastructure/repositories/core-api-canonical-chart.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];

  public constructor(private readonly response: unknown) {}

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    return this.response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream is not used by canonical charts');
  }
}

const queryDefinition = {
  schemaVersion: 1 as const,
  mode: 'NATIVE' as const,
  context: { catalog: 'iceberg', schema: 'analytics' },
  parameters: [],
  sql: 'SELECT region, revenue FROM orders',
};

const visualizationDefinition = {
  schemaVersion: 1 as const,
  type: 'PIE' as const,
  roles: { measure: 'revenue', breakout: 'region' },
  display: { showLegend: true },
};

describe('CoreApiCanonicalChartRepository', () => {
  it('previews query results without sending visualization bindings', async () => {
    const transport = new FakeTransport({
      run_id: 'run-query-1',
      columns: [{ name: 'region', type: 'varchar', family: 'STRING' }],
      rows: [['west']],
      row_count: 1,
      byte_count: 4,
      truncated: false,
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    await repository.previewQuery({ queryDefinition, parameterValues: {} });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/chart-authoring/query-previews');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      query_definition: queryDefinition,
      parameter_values: {},
    });
    expect(JSON.stringify(transport.requests[0])).not.toContain('visualization_definition');
  });

  it('maps Core query compilation without sending or receiving result rows', async () => {
    const transport = new FakeTransport({
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    await expect(
      repository.compileQuery({ queryDefinition, parameterValues: {} }),
    ).resolves.toEqual({
      mode: 'VISUAL',
      context: { catalog: 'iceberg', schema: 'kasadata' },
      sql: 'SELECT * FROM "iceberg"."kasadata"."orders"',
    });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/chart-authoring/query-compilations');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      query_definition: queryDefinition,
      parameter_values: {},
    });
    expect(JSON.stringify(transport.requests[0])).not.toContain('rows');
  });

  it('previews a complete draft without sending durable result fields', async () => {
    const transport = new FakeTransport({
      run_id: 'run-1',
      columns: [{ name: 'region', type: 'varchar', family: 'STRING' }],
      rows: [['west']],
      row_count: 1,
      byte_count: 4,
      truncated: false,
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    await repository.preview({
      title: 'Revenue by region',
      description: null,
      collectionId: 'collection-1',
      queryDefinition,
      visualizationDefinition,
      outputSchema: [],
      parameterValues: {},
    });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.path).toBe('/chart-authoring/previews');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      title: 'Revenue by region',
      description: null,
      collection_id: 'collection-1',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: [],
      parameter_values: {},
    });
  });

  it('creates a chart from metadata and never sends preview rows or a Vega spec', async () => {
    const transport = new FakeTransport({
      id: 'chart-1',
      title: 'Revenue by region',
      description: null,
      organization_id: 'org-1',
      collection_id: 'collection-1',
      owner_identity_id: 'identity-1',
      provenance: 'MANUAL',
      current_revision_number: 1,
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: [],
      created_at: '2026-09-02T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    const chart = await repository.create({
      title: 'Revenue by region',
      description: null,
      collectionId: 'collection-1',
      queryDefinition,
      visualizationDefinition,
      outputSchema: [],
      parameterValues: {},
    });

    const body = JSON.parse(String(transport.requests[0]?.init?.body)) as Record<string, unknown>;
    expect(transport.requests[0]?.path).toBe('/chart-authoring/charts');
    expect(body).toMatchObject({ query_definition: queryDefinition });
    expect(body).not.toHaveProperty('preview_token');
    expect(body).not.toHaveProperty('data');
    expect(body).not.toHaveProperty('vl_spec');
    expect(chart).toMatchObject({ id: 'chart-1', currentRevisionNumber: 1, provenance: 'MANUAL' });
  });

  it('saves a chat preview through the confirmation route without transport-only data', async () => {
    const transport = new FakeTransport({
      id: 'chart-1',
      title: 'Revenue by region',
      description: null,
      organization_id: 'org-1',
      collection_id: 'collection-1',
      owner_identity_id: 'identity-1',
      provenance: 'CHAT',
      current_revision_number: 1,
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: [],
      created_at: '2026-09-12T00:00:00.000Z',
      updated_at: '2026-09-12T00:00:00.000Z',
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    await repository.saveChatPreview({
      title: 'Revenue by region',
      description: null,
      collectionId: 'collection-1',
      queryDefinition,
      visualizationDefinition,
      outputSchema: [{ name: 'region', type: 'varchar', family: 'STRING' }],
      parameterValues: {},
    });

    const request = transport.requests[0];
    const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
    expect(request?.path).toBe('/chart-authoring/chat-charts');
    expect(body).toEqual({
      title: 'Revenue by region',
      description: null,
      collection_id: 'collection-1',
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      parameter_values: {},
    });
    for (const forbidden of ['rows', 'run_id', 'row_count', 'byte_count', 'output_schema']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("cancels a run through Core's chart-scoped route", async () => {
    const transport = new FakeTransport(undefined);
    const repository = new CoreApiCanonicalChartRepository(transport);

    await repository.cancelRun?.({ chartId: 'chart/1', runId: 'run/2' });

    expect(transport.requests[0]?.path).toBe(
      '/chart-authoring/charts/chart%2F1/runs/run%2F2/cancel',
    );
    expect(transport.requests[0]?.init?.method).toBe('POST');
  });

  it('maps the public revision contract into numbered chart versions', async () => {
    const transport = new FakeTransport([
      {
        chart_id: 'chart-1',
        revision_number: 3,
        query_definition: queryDefinition,
        visualization_definition: visualizationDefinition,
        output_schema: [],
        created_at: '2026-09-10T03:30:00.000Z',
        restored_from_revision_number: 1,
      },
    ]);
    const repository = new CoreApiCanonicalChartRepository(transport);

    await expect(repository.listRevisions?.('chart-1')).resolves.toEqual([
      expect.objectContaining({
        chartId: 'chart-1',
        revisionNumber: 3,
        restoredFromRevisionNumber: 1,
      }),
    ]);
  });

  it('keeps version labels working while Core rolls over from its legacy revision payload', async () => {
    const transport = new FakeTransport([
      {
        chartId: 'chart-1',
        revisionNumber: 2,
        queryDefinition,
        visualizationDefinition,
        outputSchema: [],
        createdAt: '2026-09-09T03:30:00.000Z',
        restoredFromRevisionNumber: null,
      },
    ]);
    const repository = new CoreApiCanonicalChartRepository(transport);

    await expect(repository.listRevisions?.('chart-1')).resolves.toEqual([
      expect.objectContaining({ chartId: 'chart-1', revisionNumber: 2 }),
    ]);
  });

  it('restores an older version through the chart revision route', async () => {
    const transport = new FakeTransport({
      id: 'chart-1',
      title: 'Revenue by region',
      description: null,
      organization_id: 'org-1',
      collection_id: 'collection-1',
      owner_identity_id: 'identity-1',
      provenance: 'MANUAL',
      current_revision_number: 4,
      query_definition: queryDefinition,
      visualization_definition: visualizationDefinition,
      output_schema: [],
      created_at: '2026-09-02T00:00:00.000Z',
      updated_at: '2026-09-10T03:30:00.000Z',
    });
    const repository = new CoreApiCanonicalChartRepository(transport);

    await repository.restoreRevision?.({
      chartId: 'chart/1',
      revisionNumber: 2,
      expectedRevision: 3,
    });

    expect(transport.requests[0]?.path).toBe(
      '/chart-authoring/charts/chart%2F1/revisions/2/restore',
    );
    expect(JSON.parse(String(transport.requests[0]?.init?.body))).toEqual({
      expected_revision: 3,
      revision_number: 2,
    });
  });
});
