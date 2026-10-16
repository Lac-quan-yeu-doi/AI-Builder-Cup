import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { PipelineGraphValidator } from '@application/pipeline-authoring/pipeline-graph.validator';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';

const source: NodeDefinition = {
  ...definition('POSTGRES_SOURCE', 'SOURCE', [], ['output'], []),
  resourceId: 'connection:11111111-1111-4111-8111-111111111111',
  source: {
    connectionId: '11111111-1111-4111-8111-111111111111',
    connectionName: 'Production PostgreSQL',
    dbmsType: 'POSTGRESQL',
    configSchemaVersion: 1,
    config: {},
    verificationStatus: 'SUCCEEDED',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
};
const filter: NodeDefinition = {
  ...definition('FILTER', 'TRANSFORM', ['input'], ['output'], []),
  propertyPanel: {
    sections: [
      {
        id: 'transform',
        title: 'Transform',
        fields: [
          {
            key: 'combination',
            label: 'Combination',
            component: 'RADIO',
            required: true,
            options: [
              { label: 'All', value: 'AND' },
              { label: 'Any', value: 'OR' },
            ],
          },
          {
            key: 'conditions',
            label: 'Conditions',
            component: 'FILTER_BUILDER',
            required: true,
          },
        ],
      },
    ],
  },
};
const target: NodeDefinition = {
  ...definition('ICEBERG_TARGET', 'TARGET', ['input'], [], []),
  propertyPanel: {
    sections: [
      {
        id: 'target',
        title: 'Target',
        fields: [
          { key: 'databaseName', label: 'Database', component: 'SELECT', required: true },
          {
            key: 'tableMode',
            label: 'Table option',
            component: 'SELECT',
            required: true,
            defaultValue: 'EXISTING',
            options: [
              { label: 'Existing', value: 'EXISTING' },
              { label: 'Create', value: 'CREATE_NEW' },
            ],
          },
          {
            key: 'tableName',
            label: 'Existing table',
            component: 'SELECT',
            required: true,
            visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
          },
          {
            key: 'newTableName',
            label: 'New table name',
            component: 'TEXT_INPUT',
            required: true,
            visibleWhen: { field: 'tableMode', equals: 'CREATE_NEW' },
          },
          {
            key: 'writeMode',
            label: 'Write mode',
            component: 'SELECT',
            required: true,
            defaultValue: 'APPEND',
            visibleWhen: { field: 'tableMode', equals: 'EXISTING' },
          },
        ],
      },
    ],
  },
};

describe('PipelineGraphValidator', () => {
  const catalog = {
    resolveDefinition: jest.fn((type: string) =>
      Promise.resolve([source, filter, target].find((candidate) => candidate.type === type)),
    ),
    isWritableTarget: jest.fn((databaseName: string, tableName: string) =>
      Promise.resolve(databaseName === 'analytics' && tableName === 'customers'),
    ),
    isWritableDatabase: jest.fn((databaseName: string) =>
      Promise.resolve(databaseName === 'analytics'),
    ),
    resolveCatalogSource: jest.fn(
      (databaseServiceId: string, namespaceId: string, relationId: string) =>
        Promise.resolve(
          databaseServiceId === '11111111-1111-4111-8111-111111111111' &&
            namespaceId === '22222222-2222-4222-8222-222222222222' &&
            relationId === '33333333-3333-4333-8333-333333333333'
            ? {
                databaseServiceId: '11111111-1111-4111-8111-111111111111',
                namespaceId,
                relationId,
                schemaName: 'public',
                tableName: 'customers',
              }
            : undefined,
        ),
    ),
  } as unknown as NodeCatalogUseCases;
  const validator = new PipelineGraphValidator(catalog);

  it('reports the structural errors of an empty graph without throwing', async () => {
    await expect(validator.validate({ nodes: [], edges: [] })).resolves.toEqual({
      valid: false,
      errors: [{ code: 'GRAPH_EMPTY', message: 'The graph has no nodes.' }],
      warnings: [],
    });
  });

  it('accepts a connected source-transform-target graph with required configuration', async () => {
    const result = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('filter', 'FILTER', {
          combination: 'AND',
          conditions: [
            { key: 'active', operator: 'EQUALS', value: { type: 'BOOLEAN', value: true } },
          ],
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableMode: 'EXISTING',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [
        edge('source', 'output', 'filter', 'input'),
        edge('filter', 'matched', 'target', 'input'),
      ],
    });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('blocks saving when a node passes generic form checks but cannot generate eligible PySpark', async () => {
    const result = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('filter', 'FILTER', {
          combination: 'AND',
          conditions: [{ key: 'active', operator: 'NOT_A_SPARK_OPERATOR', value: true }],
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableMode: 'EXISTING',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [
        edge('source', 'output', 'filter', 'input'),
        edge('filter', 'output', 'target', 'input'),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'NODE_CONFIG_INVALID',
        nodeId: 'filter',
        field: 'operator',
      }),
    ]);
  });

  it('accepts a legacy crawler source only when its saved binding matches the metadata', async () => {
    const valid = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', {
          sourceMode: 'CATALOG',
          catalogNamespaceId: '22222222-2222-4222-8222-222222222222',
          catalogRelationId: '33333333-3333-4333-8333-333333333333',
          schemaName: 'public',
          tableName: 'customers',
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });
    const stale = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', {
          sourceMode: 'CATALOG',
          catalogNamespaceId: '22222222-2222-4222-8222-222222222222',
          catalogRelationId: '33333333-3333-4333-8333-333333333333',
          schemaName: 'public',
          tableName: 'wrong_table',
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });

    expect(valid).toEqual({ valid: true, errors: [], warnings: [] });
    expect(stale.errors).toEqual([
      expect.objectContaining({ code: 'CATALOG_SOURCE_INVALID', field: 'catalogRelationId' }),
    ]);
  });

  it('accepts only an existing managed Iceberg table as a Data Catalog source', async () => {
    const valid = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', {
          sourceMode: 'ICEBERG_CATALOG',
          catalogDatabaseName: 'analytics',
          catalogTableName: 'customers',
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });
    const missing = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', {
          sourceMode: 'ICEBERG_CATALOG',
          catalogDatabaseName: 'analytics',
          catalogTableName: 'missing',
        }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableName: 'customers',
          writeMode: 'APPEND',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });

    expect(valid).toEqual({ valid: true, errors: [], warnings: [] });
    expect(missing.errors).toEqual([
      expect.objectContaining({ code: 'CATALOG_SOURCE_INVALID', field: 'catalogTableName' }),
    ]);
  });

  it('rejects a target that is not an existing writable base table', async () => {
    const result = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'system',
          tableName: 'iceberg_tables',
          writeMode: 'APPEND',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TARGET_NOT_WRITABLE',
        nodeId: 'target',
        field: 'databaseName',
      }),
    ]);
  });

  it('accepts a unique new table and ignores hidden existing-table fields', async () => {
    const result = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableMode: 'CREATE_NEW',
          newTableName: 'daily_customers',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('rejects invalid and already-existing new table names', async () => {
    const invalid = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableMode: 'CREATE_NEW',
          newTableName: 'daily-customers',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });
    const existing = await validator.validate({
      nodes: [
        node('source', 'POSTGRES_SOURCE', { schemaName: 'public', tableName: 'customer' }),
        node('target', 'ICEBERG_TARGET', {
          databaseName: 'analytics',
          tableMode: 'CREATE_NEW',
          newTableName: 'customers',
        }),
      ],
      edges: [edge('source', 'output', 'target', 'input')],
    });

    expect(invalid.errors).toEqual([
      expect.objectContaining({ code: 'NODE_CONFIG_INVALID', field: 'newTableName' }),
    ]);
    expect(existing.errors).toEqual([
      expect.objectContaining({ code: 'TARGET_ALREADY_EXISTS', field: 'newTableName' }),
    ]);
  });

  it('rejects duplicate, self-connected, incompatible, and cyclic edges', async () => {
    const graph = {
      nodes: [node('source', 'POSTGRES_SOURCE', {}), node('filter', 'FILTER', {})],
      edges: [edge('source', 'output', 'filter', 'input')],
    };
    await expect(
      validator.validateEdge(graph, edge('source', 'output', 'filter', 'input')),
    ).resolves.toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ code: 'EDGE_ALREADY_EXISTS' })],
    });
    await expect(
      validator.validateEdge(graph, edge('filter', 'matched', 'filter', 'input')),
    ).resolves.toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ code: 'EDGE_SELF_CONNECTION' })],
    });
    const incompatibleAndCyclic = await validator.validateEdge(
      graph,
      edge('filter', 'matched', 'source', 'missing'),
    );
    expect(incompatibleAndCyclic.valid).toBe(false);
    expect(incompatibleAndCyclic.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['EDGE_TYPE_INCOMPATIBLE', 'GRAPH_HAS_CYCLE']),
    );
  });
});

function definition(
  type: string,
  category: NodeDefinition['category'],
  inputs: readonly string[],
  outputs: readonly string[],
  fields: readonly string[],
): NodeDefinition {
  const port = (id: string): NodeDefinition['inputPorts'][number] => ({
    id,
    label: id,
    dataType: 'DATASET' as const,
    required: true,
    maxConnections: 1,
  });
  return {
    resourceId: `definition:${type}`,
    type,
    category,
    label: type,
    description: type,
    iconKey: type,
    enabled: true,
    runtimeKind: 'SPARK_DATAFRAME',
    inputPorts: inputs.map(port),
    outputPorts: outputs.map(port),
    propertyPanel: {
      sections: [
        {
          id: 'main',
          title: 'Main',
          fields: fields.map((key) => ({
            key,
            label: key,
            component: 'TEXT_INPUT',
            required: true,
          })),
        },
      ],
    },
  };
}
function node(
  id: string,
  definitionType: string,
  config: Readonly<Record<string, unknown>>,
): {
  readonly id: string;
  readonly definitionType: string;
  readonly position: { x: number; y: number };
  readonly config: Readonly<Record<string, unknown>>;
} {
  return { id, definitionType, position: { x: 0, y: 0 }, config };
}
function edge(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): {
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
} {
  return { sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}
