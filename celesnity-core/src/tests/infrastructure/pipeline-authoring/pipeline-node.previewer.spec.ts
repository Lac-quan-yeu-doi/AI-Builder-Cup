import { Client } from 'pg';

import type { CatalogExplorationUseCases } from '@application/catalog-exploration/catalog-exploration.use-cases';
import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import { ExecutionConnectionDescriptor } from '@application/database-service/read-models/execution-connection-descriptor';
import type { Pipeline } from '@domain/pipeline-authoring/models/pipeline';
import { PipelineNodePreviewer } from '@infrastructure/pipeline-authoring/pipeline-node.previewer';

jest.mock('pg', () => ({ Client: jest.fn() }));

describe('PipelineNodePreviewer', () => {
  const connect = jest.fn(() => Promise.resolve());
  const end = jest.fn(() => Promise.resolve());
  const query = jest.fn(() =>
    Promise.resolve({
      fields: [
        { name: 'id', dataTypeID: 2950 },
        { name: 'name', dataTypeID: 1043 },
        { name: 'status', dataTypeID: 1043 },
      ],
      rows: [
        { id: '1', name: 'One', status: 'ACTIVE' },
        { id: '2', name: 'Two', status: 'ARCHIVED' },
      ],
    }),
  );
  const profiles: IConnectionExecutionProfileProvider = {
    resolveExecutionProfile: jest.fn(() =>
      Promise.resolve(
        ExecutionConnectionDescriptor.create({
          driverClass: 'org.postgresql.Driver',
          jdbcUrl: 'jdbc:postgresql://db.internal:5432/app?sslmode=disable',
          publicOptions: { SOURCE_POSTGRES_USER: 'reader' },
          secretOptions: { SOURCE_POSTGRES_PASSWORD: 'secret' },
        }),
      ),
    ),
  };

  const pipeline: Pipeline = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Preview',
    status: 'DRAFT',
    version: 1,
    graph: {
      nodes: [
        {
          id: 'source',
          definitionType: 'POSTGRES_SOURCE',
          position: { x: 0, y: 0 },
          config: {
            connectionId: '00000000-0000-4000-8000-000000000002',
            schemaName: 'public',
            tableName: 'customers',
          },
        },
        {
          id: 'select',
          definitionType: 'SELECT_FIELDS',
          position: { x: 1, y: 0 },
          config: { fields: ['id', 'name'] },
        },
        {
          id: 'target',
          definitionType: 'ICEBERG_TARGET',
          resourceId: 'iceberg:iceberg.analytics.customers',
          position: { x: 2, y: 0 },
          config: { writeMode: 'APPEND' },
        },
      ],
      edges: [
        {
          sourceNodeId: 'source',
          sourcePortId: 'output',
          targetNodeId: 'select',
          targetPortId: 'input',
        },
        {
          sourceNodeId: 'select',
          sourcePortId: 'output',
          targetNodeId: 'target',
          targetPortId: 'input',
        },
      ],
    },
    createdBy: { id: 'system', displayName: 'System' },
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.mocked(Client).mockImplementation(() => ({ connect, end, query }) as never);
    jest.clearAllMocks();
  });

  it.each(['source', 'select', 'target'])('previews the three-node path at %s', async (nodeId) => {
    const previewer = new PipelineNodePreviewer(profiles, {} as CatalogExplorationUseCases);
    const node = pipeline.graph.nodes.find((candidate) => candidate.id === nodeId)!;

    await expect(previewer.preview(pipeline, node, 1)).resolves.toMatchObject({
      columns:
        nodeId === 'source'
          ? [{ name: 'id' }, { name: 'name' }, { name: 'status' }]
          : [{ name: 'id' }, { name: 'name' }],
      rows: [
        nodeId === 'source' ? { id: '1', name: 'One', status: 'ACTIVE' } : { id: '1', name: 'One' },
      ],
      returnedRows: 1,
      truncated: true,
    });
  });
});
