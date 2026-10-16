import { describe, expect, it, vi } from 'vitest';

import { InputParseError } from '@/src/entities/errors/application-errors';
import type { NodeDefinition, NodePalette } from '@/src/entities/models/node-definition';
import type {
  NodePreview,
  Pipeline,
  PipelineGraph,
  PipelinePage,
  PipelineValidationResult,
} from '@/src/entities/models/pipeline';
import { createGetNodeDefinitionController } from '@/src/interface-adapters/controllers/node-catalog/get-node-definition.controller';
import { createLoadNodePaletteController } from '@/src/interface-adapters/controllers/node-catalog/load-node-palette.controller';
import { createArchivePipelineController } from '@/src/interface-adapters/controllers/pipelines/archive-pipeline.controller';
import { createClonePipelineController } from '@/src/interface-adapters/controllers/pipelines/clone-pipeline.controller';
import { createCreatePipelineController } from '@/src/interface-adapters/controllers/pipelines/create-pipeline.controller';
import { createGetPipelineController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline.controller';
import { createGetPipelineScriptController } from '@/src/interface-adapters/controllers/pipelines/get-pipeline-script.controller';
import { createListPipelinesController } from '@/src/interface-adapters/controllers/pipelines/list-pipelines.controller';
import { createPreviewPipelineNodeController } from '@/src/interface-adapters/controllers/pipelines/preview-pipeline-node.controller';
import { createSavePipelineController } from '@/src/interface-adapters/controllers/pipelines/save-pipeline.controller';
import { createValidatePipelineEdgeController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-edge.controller';
import { createValidatePipelineGraphController } from '@/src/interface-adapters/controllers/pipelines/validate-pipeline-graph.controller';

const graph: PipelineGraph = {
  nodes: [
    {
      id: 'node-1',
      definitionType: 'POSTGRES_SOURCE',
      resourceId: 'connection:connection-1',
      position: { x: 0, y: 0 },
      config: {},
    },
  ],
  edges: [],
};

const pipeline: Pipeline = {
  id: 'pipeline-1',
  name: 'Daily load',
  description: 'Loads orders',
  status: 'DRAFT',
  version: 3,
  graph,
  createdBy: { id: 'system', displayName: 'System' },
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

const page: PipelinePage = {
  items: [
    {
      id: 'pipeline-1',
      name: 'Daily load',
      status: 'DRAFT',
      version: 3,
      targetDatabase: 'nhamay_saigonfood',
      sourceConnectionIds: ['service-1'],
      createdBy: { id: 'system', displayName: 'System' },
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 1,
  totalPages: 1,
};

const validation: PipelineValidationResult = { valid: true, errors: [], warnings: [] };

const preview: NodePreview = {
  columns: [{ name: 'id', dataType: 'int4', nullable: false }],
  rows: [{ id: 1 }],
  returnedRows: 1,
  truncated: false,
  executionTimeMs: 12,
};

const edge = {
  id: 'edge-1',
  sourceNodeId: 'node-1',
  sourcePortId: 'output',
  targetNodeId: 'node-2',
  targetPortId: 'input',
};

describe('pipeline controllers', () => {
  it('presents the pipeline page and defaults the query', async () => {
    const useCase = vi.fn().mockResolvedValue(page);

    const result = await createListPipelinesController(useCase)();

    expect(useCase).toHaveBeenCalledWith({});
    expect(result.items[0]).toEqual({
      id: 'pipeline-1',
      name: 'Daily load',
      status: 'DRAFT',
      version: 3,
      targetDatabase: 'nhamay_saigonfood',
      sourceConnectionIds: ['service-1'],
      createdBy: 'System',
      updatedAt: '2026-08-13T00:00:00.000Z',
    });
  });

  it('flattens the author of a loaded pipeline', async () => {
    const result = await createGetPipelineController(vi.fn().mockResolvedValue(pipeline))(
      'pipeline-1',
    );

    expect(result.createdBy).toBe('System');
    expect(result.graph).toEqual(graph);
  });

  it('creates, saves, clones, and archives through their use cases', async () => {
    const create = vi.fn().mockResolvedValue(pipeline);
    const save = vi.fn().mockResolvedValue(pipeline);
    const clone = vi.fn().mockResolvedValue(pipeline);
    const archive = vi.fn().mockResolvedValue(undefined);

    await createCreatePipelineController(create)({ name: 'Daily load', graph });
    await createSavePipelineController(save)('pipeline-1', {
      name: 'Daily load',
      graph,
      version: 3,
    });
    await createClonePipelineController(clone)('pipeline-1', ' Copy ');
    await createArchivePipelineController(archive)('pipeline-1');

    expect(create).toHaveBeenCalledWith({ name: 'Daily load', graph });
    expect(save).toHaveBeenCalledWith('pipeline-1', { name: 'Daily load', graph, version: 3 });
    expect(clone).toHaveBeenCalledWith('pipeline-1', 'Copy');
    expect(archive).toHaveBeenCalledWith('pipeline-1');
  });

  it('files a new pipeline under the database it was created from', async () => {
    // A draft has no target node yet, so nothing in the graph says which
    // database it belongs to. `databaseName` is the only thing that does, and
    // the schema used to strip it: the pipeline was created from inside a
    // database, listed nowhere, and its name stayed taken workspace-wide.
    const create = vi.fn().mockResolvedValue(pipeline);

    await createCreatePipelineController(create)({
      name: 'Daily load',
      databaseName: 'kasadev',
      graph,
    });

    expect(create).toHaveBeenCalledWith({ name: 'Daily load', databaseName: 'kasadev', graph });
  });

  it('validates the editor graph and a proposed edge', async () => {
    const validateGraph = vi.fn().mockResolvedValue(validation);
    const validateEdge = vi.fn().mockResolvedValue(validation);

    await createValidatePipelineGraphController(validateGraph)(graph);
    await createValidatePipelineEdgeController(validateEdge)(graph, edge);

    expect(validateGraph).toHaveBeenCalledWith(graph);
    expect(validateEdge).toHaveBeenCalledWith(graph, edge);
  });

  it('passes the preview request through untouched', async () => {
    const useCase = vi.fn().mockResolvedValue(preview);

    const result = await createPreviewPipelineNodeController(useCase)('pipeline-1', 'node-1', {
      pipelineVersion: 3,
      limit: 100,
    });

    expect(useCase).toHaveBeenCalledWith('pipeline-1', 'node-1', {
      pipelineVersion: 3,
      limit: 100,
    });
    expect(result).toBe(preview);
  });

  it('validates and loads one generated pipeline version', async () => {
    const useCase = vi.fn().mockResolvedValue({ source: 'print("ok")' });
    const pipelineId = 'e01a84e6-5e8c-4a9f-ba4b-e8f294723dab';

    await expect(createGetPipelineScriptController(useCase)(pipelineId, 3)).resolves.toEqual({
      source: 'print("ok")',
    });
    expect(useCase).toHaveBeenCalledWith(pipelineId, 3);
  });

  it.each([
    ['a blank pipeline name', () => createCreatePipelineController(vi.fn())({ name: ' ', graph })],
    [
      'a version below one',
      () =>
        createSavePipelineController(vi.fn())('pipeline-1', {
          name: 'Daily load',
          graph,
          version: 0,
        }),
    ],
    ['an empty identifier', () => createGetPipelineController(vi.fn())('')],
    [
      'a preview limit above the cap',
      () =>
        createPreviewPipelineNodeController(vi.fn())('pipeline-1', 'node-1', {
          pipelineVersion: 1,
          limit: 5000,
        }),
    ],
  ])('rejects %s before reaching the use case', async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(InputParseError);
  });
});

describe('node catalog controllers', () => {
  const palette: NodePalette = [
    {
      category: { type: 'SOURCE', label: 'Sources', order: 1 },
      definitions: [
        {
          resourceId: 'connection:connection-1',
          type: 'POSTGRES_SOURCE',
          category: 'SOURCE',
          label: 'analytics-primary',
          description: 'Read data through the saved POSTGRESQL connection.',
          iconKey: 'postgresql',
          enabled: true,
          runtimeKind: 'SPARK_JDBC_SOURCE',
          inputPorts: [],
          outputPorts: [],
          source: {
            connectionId: 'connection-1',
            connectionName: 'analytics-primary',
            dbmsType: 'POSTGRESQL',
            verificationStatus: 'SUCCEEDED',
          },
        },
      ],
    },
  ];

  it('labels each palette entry with the resource it binds to', async () => {
    const groups = await createLoadNodePaletteController(vi.fn().mockResolvedValue(palette))();

    expect(groups[0]?.label).toBe('Sources');
    expect(groups[0]?.definitions[0]?.resourceLabel).toBe('POSTGRESQL · analytics-primary');
  });

  it('carries the property panel through for a single definition', async () => {
    const definition: NodeDefinition = {
      ...(palette[0]?.definitions[0] as NodeDefinition),
      propertyPanel: {
        sections: [
          {
            id: 'source',
            title: 'Source table',
            fields: [{ key: 'schemaName', label: 'Schema', component: 'SELECT', required: true }],
          },
        ],
      },
    };

    const result = await createGetNodeDefinitionController(vi.fn().mockResolvedValue(definition))(
      ' postgres_source ',
    );

    expect(result.propertyPanel.sections[0]?.fields[0]?.key).toBe('schemaName');
  });

  it('rejects an empty node type', async () => {
    await expect(createGetNodeDefinitionController(vi.fn())(' ')).rejects.toBeInstanceOf(
      InputParseError,
    );
  });
});
