import type { IPipelineVersionRepository } from '@application/pipeline-authoring/interfaces/i-pipeline-version-repository';
import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type { PipelineVersionSnapshot } from '@domain/pipeline-authoring/models/pipeline-version';
import { WorkflowTargetSchemaReader } from '@infrastructure/data-workflow/workflow-target-schema.reader';

describe('WorkflowTargetSchemaReader', () => {
  it('returns the known output columns for Iceberg target nodes in the pinned graph', async () => {
    const graph = {
      nodes: [
        {
          id: 'source-node',
          definitionType: 'POSTGRES_SOURCE',
          position: { x: 0, y: 0 },
          config: { sourceMode: 'DATABASE_SERVICE', schemaName: 'public', tableName: 'orders' },
        },
        {
          id: 'target-node',
          definitionType: 'ICEBERG_TARGET',
          position: { x: 1, y: 0 },
          config: { tableMode: 'CREATE_NEW', newTableName: 'orders' },
        },
      ],
      edges: [
        {
          sourceNodeId: 'source-node',
          sourcePortId: 'output',
          targetNodeId: 'target-node',
          targetPortId: 'input',
        },
      ],
    };
    const version = {
      id: 'version-4',
      pipelineId: 'pipeline-1',
      versionNumber: 4,
      graph,
      createdAt: '2026-09-24T00:00:00.000Z',
    } satisfies PipelineVersionSnapshot;
    const sourceDefinition = definition('POSTGRES_SOURCE', 'SOURCE', 'SPARK_JDBC_SOURCE');
    const targetDefinition = {
      ...definition('ICEBERG_TARGET', 'TARGET', 'SPARK_ICEBERG_TARGET'),
      target: {
        catalogName: 'celesnity',
        databaseName: 'orders_db',
        tableName: 'fallback_table',
        tableType: 'ICEBERG',
        storageFormat: 'ICEBERG',
      },
    } satisfies NodeDefinition;
    const nodeCatalog = {
      resolveDefinition: jest.fn(async (type: string) =>
        type === 'POSTGRES_SOURCE' ? sourceDefinition : targetDefinition,
      ),
      resolveSourceColumns: jest.fn().mockResolvedValue([
        { name: 'id', dataType: 'long', nullable: false },
        { name: 'amount', dataType: 'decimal(10,2)', nullable: true },
      ]),
      resolveTargetColumns: jest.fn().mockResolvedValue(undefined),
    };
    const versions = { find: jest.fn().mockResolvedValue(version) };
    const reader = new WorkflowTargetSchemaReader(
      versions as unknown as IPipelineVersionRepository,
      nodeCatalog as unknown as NodeCatalogUseCases,
    );

    await expect(reader.describe({ pipelineId: 'pipeline-1', versionNumber: 4 })).resolves.toEqual([
      {
        targetNodeId: 'target-node',
        tableName: 'orders',
        schemaStatus: 'KNOWN',
        columns: [
          { id: 'id', name: 'id', type: 'long', nullable: false },
          { id: 'amount', name: 'amount', type: 'decimal(10,2)', nullable: true },
        ],
      },
    ]);
    expect(versions.find).toHaveBeenCalledWith('pipeline-1', 4);
  });

  it('does not return schemas for other target types', async () => {
    const version = {
      id: 'version-4',
      pipelineId: 'pipeline-1',
      versionNumber: 4,
      graph: {
        nodes: [
          {
            id: 'target-node',
            definitionType: 'OTHER_TARGET',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      },
      createdAt: '2026-09-24T00:00:00.000Z',
    } satisfies PipelineVersionSnapshot;
    const otherTarget = definition('OTHER_TARGET', 'TARGET', 'SPARK_ICEBERG_TARGET');
    const nodeCatalog = { resolveDefinition: jest.fn().mockResolvedValue(otherTarget) };
    const reader = new WorkflowTargetSchemaReader(
      { find: jest.fn().mockResolvedValue(version) } as unknown as IPipelineVersionRepository,
      nodeCatalog as unknown as NodeCatalogUseCases,
    );

    await expect(reader.describe({ pipelineId: 'pipeline-1', versionNumber: 4 })).resolves.toEqual(
      [],
    );
  });
});

function definition(
  type: string,
  category: NodeDefinition['category'],
  runtimeKind: NodeDefinition['runtimeKind'],
): NodeDefinition {
  return {
    resourceId: `test:${type}`,
    type,
    category,
    label: type,
    description: '',
    iconKey: 'table',
    enabled: true,
    runtimeKind,
    inputPorts: [],
    outputPorts: [],
    propertyPanel: { sections: [] },
  };
}
