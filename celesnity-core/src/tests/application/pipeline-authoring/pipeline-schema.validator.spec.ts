import type { NodeCatalogUseCases } from '@application/node-catalog/node-catalog.use-cases';
import { PipelineSchemaValidator } from '@application/pipeline-authoring/pipeline-schema.validator';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type {
  PipelineEdge,
  PipelineGraph,
  PipelineNode,
} from '@domain/pipeline-authoring/models/pipeline';
import { CatalogAccessDeniedError } from '@application/catalog-exploration/catalog-access-authorizer';

const sourceColumns = [
  { name: 'id', dataType: 'bigint', nullable: false },
  { name: 'name', dataType: 'varchar', nullable: true },
  { name: 'amount', dataType: 'decimal(12,2)', nullable: true },
  { name: 'active', dataType: 'boolean', nullable: true },
] as const;

describe('PipelineSchemaValidator', () => {
  const catalog = {
    resolveSourceColumns: jest.fn().mockResolvedValue(sourceColumns),
    resolveTargetColumns: jest.fn().mockResolvedValue(sourceColumns),
  } as unknown as NodeCatalogUseCases;
  const validator = new PipelineSchemaValidator(catalog);

  it.each([
    ['SELECT_FIELDS', { fields: ['id', 'name'] }, ['id', 'name']],
    ['DROP_FIELDS', { fields: ['active'] }, ['id', 'name', 'amount']],
    [
      'RENAME_FIELD',
      { sourceField: 'name', targetField: 'customer_name' },
      ['id', 'customer_name', 'amount', 'active'],
    ],
    [
      'CHANGE_SCHEMA',
      { mappings: [{ sourceField: 'id', targetField: 'customer_id', targetType: 'string' }] },
      ['customer_id'],
    ],
    [
      'FILTER',
      { combination: 'AND', conditions: [{ key: 'name', operator: 'CONTAINS', value: 'a' }] },
      ['id', 'name', 'amount', 'active'],
    ],
    [
      'DROP_DUPLICATES',
      {
        matchFields: ['id'],
        orderBy: [{ field: 'name', direction: 'ASC', nulls: 'LAST' }],
        keep: 'FIRST',
      },
      ['id', 'name', 'amount', 'active'],
    ],
    ['REMOVE_NULL_ROWS', { fields: ['name'], mode: 'ANY' }, ['id', 'name', 'amount', 'active']],
    [
      'FILL_MISSING_VALUES',
      { field: 'amount', strategy: 'MEAN' },
      ['id', 'name', 'amount', 'active'],
    ],
    [
      'AGGREGATE',
      {
        groupBy: ['active'],
        aggregations: [{ sourceField: 'amount', function: 'SUM', outputField: 'total' }],
      },
      ['active', 'total'],
    ],
    ['MANUAL_SQL', { sql: 'SELECT id, name customer_name FROM input' }, ['id', 'customer_name']],
  ])('propagates the %s output schema', async (type, config, expected) => {
    const graph = pipeline(type, config, 'CREATE_NEW');
    const result = await validator.validate(graph, definitions(type));

    expect(result.errors).toEqual([]);
    expect(result.nodeSchemas.transform?.status).toBe('KNOWN');
    expect(result.nodeSchemas.transform?.columns.map((column) => column.name)).toEqual(expected);
  });

  it('rejects stale fields and type-incompatible transform configuration', async () => {
    const missing = await validator.validate(
      pipeline('SELECT_FIELDS', { fields: ['missing'] }, 'CREATE_NEW'),
      definitions('SELECT_FIELDS'),
    );
    const invalidFill = await validator.validate(
      pipeline('FILL_MISSING_VALUES', { field: 'name', strategy: 'MEAN' }, 'CREATE_NEW'),
      definitions('FILL_MISSING_VALUES'),
    );

    expect(missing.errors).toEqual([
      expect.objectContaining({ code: 'TRANSFORM_FIELD_NOT_FOUND', field: 'fields' }),
    ]);
    expect(invalidFill.errors).toEqual([
      expect.objectContaining({ code: 'TRANSFORM_TYPE_INCOMPATIBLE', field: 'field' }),
    ]);
  });

  it('rejects append when transformed output and target schema differ', async () => {
    const result = await validator.validate(
      pipeline('SELECT_FIELDS', { fields: ['id', 'name'] }, 'EXISTING'),
      definitions('SELECT_FIELDS'),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'TARGET_SCHEMA_MISMATCH', nodeId: 'target' }),
    ]);
  });

  it('blocks saving when an existing target schema cannot be verified', async () => {
    const unavailableCatalog = {
      resolveSourceColumns: jest.fn().mockResolvedValue(sourceColumns),
      resolveTargetColumns: jest.fn().mockResolvedValue(undefined),
    } as unknown as NodeCatalogUseCases;
    const result = await new PipelineSchemaValidator(unavailableCatalog).validate(
      pipeline('SELECT_FIELDS', { fields: ['id', 'name'] }, 'EXISTING'),
      definitions('SELECT_FIELDS'),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TARGET_SCHEMA_UNAVAILABLE',
        nodeId: 'target',
        field: 'tableName',
      }),
    ]);
  });

  it('reports catalog authorization denial without masking it as a metadata outage', async () => {
    const deniedCatalog = {
      resolveSourceColumns: jest
        .fn()
        .mockRejectedValue(new CatalogAccessDeniedError('DEFAULT_DENY')),
      resolveTargetColumns: jest.fn(),
    } as unknown as NodeCatalogUseCases;

    const result = await new PipelineSchemaValidator(deniedCatalog).validate(
      pipeline('SELECT_FIELDS', { fields: ['id'] }, 'CREATE_NEW'),
      definitions('SELECT_FIELDS'),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SOURCE_ACCESS_DENIED',
        nodeId: 'source',
      }),
    ]);
  });

  it('allows overwrite but warns when it will replace the target schema', async () => {
    const graph = pipeline('SELECT_FIELDS', { fields: ['id', 'name'] }, 'EXISTING');
    const target = graph.nodes.find((node) => node.id === 'target')!;
    const overwrite = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'target'
          ? { ...target, config: { ...target.config, writeMode: 'OVERWRITE' } }
          : node,
      ),
    };
    const result = await validator.validate(overwrite, definitions('SELECT_FIELDS'));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'TARGET_SCHEMA_WILL_CHANGE', field: 'writeMode' }),
    ]);
  });

  it('blocks append after a runtime-dependent schema transform', async () => {
    const result = await validator.validate(
      pipeline('DROP_NULL_FIELDS', {}, 'EXISTING'),
      definitions('DROP_NULL_FIELDS'),
    );

    expect(result.nodeSchemas.transform).toMatchObject({ status: 'RUNTIME_DEPENDENT' });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'OUTPUT_SCHEMA_UNRESOLVED', nodeId: 'target' }),
    ]);
  });

  it('rejects mutating or multi-statement manual SQL before saving', async () => {
    const result = await validator.validate(
      pipeline('MANUAL_SQL', { sql: 'DELETE FROM input; SELECT * FROM input' }, 'CREATE_NEW'),
      definitions('MANUAL_SQL'),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'MANUAL_SQL_INVALID', field: 'sql' }),
    ]);
  });

  it('rejects missing upstream fields inside Manual SQL projections, functions, and predicates', async () => {
    const result = await validator.validate(
      pipeline(
        'MANUAL_SQL',
        {
          sql: "SELECT catalog_name, upper(property_value) AS property_value FROM input WHERE property_key = 'owner'",
        },
        'CREATE_NEW',
      ),
      definitions('MANUAL_SQL'),
    );

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TRANSFORM_FIELD_NOT_FOUND',
        field: 'sql',
      }),
    ]);
    expect(result.errors[0]?.message).toContain('catalog_name');
    expect(result.errors[0]?.message).toContain('property_key');
    expect(result.errors[0]?.message).toContain('property_value');
  });

  it('infers common Manual SQL functions and validates their downstream output', async () => {
    const result = await validator.validate(
      pipeline(
        'MANUAL_SQL',
        { sql: 'SELECT id, upper(name) AS customer_name FROM input WHERE active = true' },
        'CREATE_NEW',
      ),
      definitions('MANUAL_SQL'),
    );

    expect(result.errors).toEqual([]);
    expect(result.nodeSchemas.transform).toMatchObject({
      status: 'KNOWN',
      columns: [
        expect.objectContaining({ name: 'id' }),
        expect.objectContaining({ name: 'customer_name', dataType: 'string' }),
      ],
    });
  });
});

function pipeline(
  transformType: string,
  config: Readonly<Record<string, unknown>>,
  tableMode: 'CREATE_NEW' | 'EXISTING',
): PipelineGraph {
  return {
    nodes: [
      node('source', 'POSTGRES_SOURCE', {}),
      node('transform', transformType, config),
      node('target', 'ICEBERG_TARGET', {
        databaseName: 'analytics',
        tableMode,
        ...(tableMode === 'CREATE_NEW'
          ? { newTableName: 'result' }
          : { tableName: 'customers', writeMode: 'APPEND' }),
      }),
    ],
    edges: [edge('source', 'transform'), edge('transform', 'target')],
  };
}

function definitions(transformType: string): ReadonlyMap<string, NodeDefinition> {
  return new Map([
    ['source', definition('POSTGRES_SOURCE', 'SOURCE')],
    ['transform', definition(transformType, 'TRANSFORM')],
    ['target', definition('ICEBERG_TARGET', 'TARGET')],
  ]);
}

function definition(type: string, category: NodeDefinition['category']): NodeDefinition {
  const port = (id: string): NodeDefinition['inputPorts'][number] => ({
    id,
    label: id,
    dataType: 'DATASET',
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
    inputPorts: category === 'SOURCE' ? [] : [port('input')],
    outputPorts: category === 'TARGET' ? [] : [port('output')],
    propertyPanel: { sections: [] },
    ...(category === 'SOURCE'
      ? {
          source: {
            connectionId: '11111111-1111-4111-8111-111111111111',
            connectionName: 'source',
            dbmsType: 'POSTGRESQL',
            configSchemaVersion: 1,
            config: {},
            verificationStatus: 'SUCCEEDED' as const,
            createdAt: '2026-08-22T00:00:00.000Z',
            updatedAt: '2026-08-22T00:00:00.000Z',
          },
        }
      : {}),
  };
}

function node(
  id: string,
  definitionType: string,
  config: Readonly<Record<string, unknown>>,
): PipelineNode {
  return { id, definitionType, position: { x: 0, y: 0 }, config };
}

function edge(sourceNodeId: string, targetNodeId: string): PipelineEdge {
  return { sourceNodeId, sourcePortId: 'output', targetNodeId, targetPortId: 'input' };
}
