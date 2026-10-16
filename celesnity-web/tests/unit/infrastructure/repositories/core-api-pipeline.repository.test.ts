import { describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError } from '@/src/entities/errors/application-errors';
import type { PipelineEdge, PipelineGraph } from '@/src/entities/models/pipeline';
import { CoreApiError } from '@/src/infrastructure/api/core-api-client';
import type { GeneratedApiTransport } from '@/src/infrastructure/api/generated-api';
import { CoreApiPipelineRepository } from '@/src/infrastructure/repositories/core-api-pipeline.repository';

interface RecordedRequest {
  readonly path: string;
  readonly init?: RequestInit;
}

class FakeGeneratedApiTransport implements GeneratedApiTransport {
  public readonly requests: RecordedRequest[] = [];
  private readonly responses: unknown[];

  public constructor(...responses: unknown[]) {
    this.responses = [...responses];
  }

  public async request<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    this.requests.push({ path, ...(init ? { init } : {}) });
    const response = this.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response as TResponse;
  }

  public stream(): Promise<Response> {
    throw new Error('stream() is not used by this repository');
  }
}

const meta = { requestId: 'request-1', timestamp: '2026-08-13T00:00:00.000Z' };

const graphDto = {
  nodes: [
    {
      id: 'node-1',
      definitionType: 'POSTGRES_SOURCE',
      resourceId: 'connection:connection-1',
      position: { x: 10, y: 20 },
      config: { schemaName: 'public' },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePortId: 'output',
      targetNodeId: 'node-2',
      targetPortId: 'input',
    },
  ],
};

const pipelineDto = {
  id: 'pipeline-1',
  name: 'Daily load',
  description: 'Loads orders',
  status: 'DRAFT',
  version: 3,
  graph: graphDto,
  createdBy: { id: 'system', displayName: 'System' },
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

const graph: PipelineGraph = {
  nodes: [
    {
      id: 'node-1',
      definitionType: 'POSTGRES_SOURCE',
      resourceId: 'connection:connection-1',
      position: { x: 10, y: 20 },
      config: { schemaName: 'public' },
    },
  ],
  edges: [],
};

function body(request: RecordedRequest | undefined): unknown {
  return JSON.parse(String(request?.init?.body));
}

describe('CoreApiPipelineRepository listing', () => {
  it('sends pagination and keyword, then unwraps the envelope', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: [
        {
          id: 'pipeline-1',
          name: 'Daily load',
          status: 'DRAFT',
          version: 3,
          lastRunStatus: null,
          lastRunAt: null,
          targetDatabase: 'nhamay_saigonfood',
          sourceConnectionIds: ['service-1', 42, '', 'service-2'],
          createdBy: { id: 'system', displayName: 'System' },
          updatedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 2,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
        hasNext: false,
        hasPrevious: true,
      },
      meta,
    });

    const page = await new CoreApiPipelineRepository(transport).list({
      page: 2,
      keyword: ' load ',
    });

    expect(transport.requests[0]?.path).toBe('/pipelines?page=2&pageSize=20&keyword=load');
    expect(page.totalItems).toBe(21);
    expect(page.items[0]).toEqual({
      id: 'pipeline-1',
      name: 'Daily load',
      status: 'DRAFT',
      version: 3,
      targetDatabase: 'nhamay_saigonfood',
      // The array is unverified input like every other field: the non-string
      // and empty entries are dropped rather than reaching a screen.
      sourceConnectionIds: ['service-1', 'service-2'],
      createdBy: { id: 'system', displayName: 'System' },
      updatedAt: '2026-08-13T00:00:00.000Z',
    });
  });

  it('treats a Core that omits the graph summary as having none', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: [
        {
          id: 'pipeline-1',
          name: 'Daily load',
          status: 'DRAFT',
          version: 1,
          lastRunStatus: null,
          lastRunAt: null,
          createdBy: { id: 'system', displayName: 'System' },
          updatedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
      meta,
    });

    const page = await new CoreApiPipelineRepository(transport).list({});

    expect(page.items[0]).not.toHaveProperty('targetDatabase');
    expect(page.items[0]?.sourceConnectionIds).toEqual([]);
  });

  it('omits an empty keyword from the query', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
      meta,
    });

    await new CoreApiPipelineRepository(transport).list({ keyword: '   ' });

    expect(transport.requests[0]?.path).toBe('/pipelines?page=1&pageSize=20');
  });
});

describe('CoreApiPipelineRepository graph decoding', () => {
  it('decodes the open graph record into entities', async () => {
    const transport = new FakeGeneratedApiTransport({ success: {}, data: pipelineDto, meta });

    const pipeline = await new CoreApiPipelineRepository(transport).get('pipeline-1');

    expect(pipeline.version).toBe(3);
    expect(pipeline.createdBy).toEqual({ id: 'system', displayName: 'System' });
    expect(pipeline.graph.nodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(pipeline.graph.edges[0]?.id).toBe('edge-1');
  });

  it('gives a saved edge without an identifier a deterministic one', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: {
        ...pipelineDto,
        graph: { nodes: graphDto.nodes, edges: [{ ...graphDto.edges[0], id: undefined }] },
      },
      meta,
    });

    const pipeline = await new CoreApiPipelineRepository(transport).get('pipeline-1');

    expect(pipeline.graph.edges[0]?.id).toBe('node-1:output->node-2:input');
  });

  it.each([
    ['a graph that is not a record', { ...pipelineDto, graph: 'nope' }],
    [
      'a node without a position',
      {
        ...pipelineDto,
        graph: { nodes: [{ id: 'a', definitionType: 'FILTER', config: {} }], edges: [] },
      },
    ],
    ['an author without a display name', { ...pipelineDto, createdBy: { id: 'system' } }],
  ])('rejects %s', async (_name, data) => {
    const transport = new FakeGeneratedApiTransport({ success: {}, data, meta });

    await expect(new CoreApiPipelineRepository(transport).get('pipeline-1')).rejects.toThrow(
      /invalid pipeline/iu,
    );
  });
});

describe('CoreApiPipelineRepository writes', () => {
  it('retrieves the integrity-verified generated source for an exact version', async () => {
    const generated = {
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-3',
      versionNumber: 3,
      compilerVersion: '1.0.0',
      semanticGraphSha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      contentSize: 2048,
      sourceMap: {},
      compiledAt: '2026-08-16T12:00:00.000Z',
      source: 'from pyspark.sql import SparkSession\n',
    };
    const transport = new FakeGeneratedApiTransport(generated);

    await expect(
      new CoreApiPipelineRepository(transport).generatedScript('pipeline/one', 3),
    ).resolves.toEqual(generated);
    expect(transport.requests[0]).toEqual({
      path: '/pipelines/pipeline%2Fone/versions/3/generated-script',
      init: { method: 'GET' },
    });
  });

  it('rejects generated-script metadata that omits the source', async () => {
    const transport = new FakeGeneratedApiTransport({
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-3',
      versionNumber: 3,
      compilerVersion: '1.0.0',
      semanticGraphSha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      contentSize: 2048,
      sourceMap: {},
      compiledAt: '2026-08-16T12:00:00.000Z',
    });

    await expect(
      new CoreApiPipelineRepository(transport).generatedScript('pipeline-1', 3),
    ).rejects.toThrow(/without source code/iu);
  });

  it('compiles then queues one exact immutable pipeline version', async () => {
    const compilation = {
      pipelineId: 'pipeline-1',
      pipelineVersionId: 'pipeline-version-3',
      versionNumber: 3,
      compilerVersion: '1.0.0',
      semanticGraphSha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      contentSize: 2048,
      sourceMap: {},
      compiledAt: '2026-08-16T12:00:00.000Z',
    };
    const transport = new FakeGeneratedApiTransport(compilation, {
      executionId: 'execution-1',
      status: 'QUEUED',
    });
    const repository = new CoreApiPipelineRepository(transport);

    await expect(repository.compile('pipeline/one', 3)).resolves.toEqual(compilation);
    await expect(repository.run('pipeline/one', 3)).resolves.toEqual({
      executionId: 'execution-1',
      status: 'QUEUED',
    });
    expect(transport.requests).toEqual([
      {
        path: '/pipelines/pipeline%2Fone/versions/3/compile',
        init: { method: 'POST' },
      },
      {
        path: '/pipelines/pipeline%2Fone/versions/3/executions',
        init: { method: 'POST' },
      },
    ]);
  });

  it('posts the database a draft is filed under, and reads it back', async () => {
    // A draft has no target node, so `targetDatabase` cannot answer where it
    // belongs. Without `databaseName` on the way out and back, a pipeline
    // created inside a database was listed by neither the database nor
    // anything else, while its name stayed taken workspace-wide.
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: { ...pipelineDto, databaseName: 'kasadev' },
      meta,
    });

    const created = await new CoreApiPipelineRepository(transport).create({
      name: 'Daily load',
      databaseName: 'kasadev',
      graph,
    });

    expect(transport.requests[0]?.path).toBe('/pipelines');
    expect(transport.requests[0]?.init?.method).toBe('POST');
    expect(body(transport.requests[0])).toEqual({
      name: 'Daily load',
      databaseName: 'kasadev',
      graph: { nodes: graphDto.nodes, edges: [] },
    });
    expect(created.databaseName).toBe('kasadev');
  });

  it('leaves the field out for a pipeline that belongs to no database', async () => {
    const transport = new FakeGeneratedApiTransport({ success: {}, data: pipelineDto, meta });

    const created = await new CoreApiPipelineRepository(transport).create({
      name: 'Daily load',
      graph,
    });

    expect(body(transport.requests[0])).toEqual({
      name: 'Daily load',
      graph: { nodes: graphDto.nodes, edges: [] },
    });
    expect(created.databaseName).toBeUndefined();
  });

  it('saves with the optimistic version and translates a conflict', async () => {
    const transport = new FakeGeneratedApiTransport({ success: {}, data: pipelineDto, meta });

    await new CoreApiPipelineRepository(transport).save('pipeline-1', {
      name: 'Daily load',
      graph,
      version: 3,
    });

    expect(transport.requests[0]?.path).toBe('/pipelines/pipeline-1');
    expect(transport.requests[0]?.init?.method).toBe('PUT');
    expect(body(transport.requests[0])).toEqual({
      name: 'Daily load',
      graph: { nodes: graphDto.nodes, edges: [] },
      version: 3,
    });

    const conflicting = new FakeGeneratedApiTransport(
      new CoreApiError(409, 'The pipeline version has changed.'),
    );
    await expect(
      new CoreApiPipelineRepository(conflicting).save('pipeline-1', {
        name: 'Daily load',
        graph,
        version: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('archives through DELETE and translates a missing pipeline', async () => {
    const transport = new FakeGeneratedApiTransport(undefined);
    await new CoreApiPipelineRepository(transport).archive('pipeline-1');

    expect(transport.requests[0]).toEqual({
      path: '/pipelines/pipeline-1',
      init: { method: 'DELETE' },
    });

    const missing = new FakeGeneratedApiTransport(new CoreApiError(404, 'Not found'));
    await expect(new CoreApiPipelineRepository(missing).archive('gone')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('CoreApiPipelineRepository validation and preview', () => {
  const edge: PipelineEdge = {
    id: 'edge-1',
    sourceNodeId: 'node-1',
    sourcePortId: 'output',
    targetNodeId: 'node-2',
    targetPortId: 'input',
  };

  it('defaults warnings when edge validation omits them', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: {
        valid: false,
        errors: [{ code: 'EDGE_INVALID', message: 'Not allowed.', edgeId: 'edge-1' }],
      },
      meta,
    });

    const result = await new CoreApiPipelineRepository(transport).validateEdge(graph, edge);

    expect(transport.requests[0]?.path).toBe('/pipelines/validate-edge');
    expect(result).toEqual({
      valid: false,
      errors: [{ code: 'EDGE_INVALID', message: 'Not allowed.', edgeId: 'edge-1' }],
      warnings: [],
    });
  });

  it('decodes a node preview', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: {
        columns: [{ name: 'id', dataType: 'int4', nullable: false }],
        rows: [{ id: 1 }],
        returnedRows: 1,
        truncated: false,
        executionTimeMs: 12,
      },
      meta,
    });

    const preview = await new CoreApiPipelineRepository(transport).previewNode(
      'pipeline-1',
      'node-1',
      { pipelineVersion: 3, limit: 100 },
    );

    expect(transport.requests[0]?.path).toBe('/pipelines/pipeline-1/nodes/node-1/preview');
    expect(body(transport.requests[0])).toEqual({ pipelineVersion: 3, limit: 100 });
    expect(preview.columns[0]?.name).toBe('id');
    expect(preview.rows).toEqual([{ id: 1 }]);
  });

  it('rejects a preview payload that is missing its row count', async () => {
    const transport = new FakeGeneratedApiTransport({
      success: {},
      data: { columns: [], rows: [], truncated: false, executionTimeMs: 1 },
      meta,
    });

    await expect(
      new CoreApiPipelineRepository(transport).previewNode('pipeline-1', 'node-1', {
        pipelineVersion: 3,
        limit: 100,
      }),
    ).rejects.toThrow(/invalid node preview/iu);
  });
});
