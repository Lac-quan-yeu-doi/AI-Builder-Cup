import { spawnSync } from 'node:child_process';

import { PipelineCompiler } from '@application/pipeline-compilation/pipeline-compiler';
import type { NodeDefinition } from '@domain/node-catalog/models/node-definition';
import type { PipelineGraph, PipelineNode } from '@domain/pipeline-authoring/models/pipeline';
import type { PipelineCompilationError } from '@domain/pipeline-compilation/errors/pipeline-compilation.error';
import type { CompiledPipeline } from '@domain/pipeline-compilation/models/compiled-pipeline';

const compiler = new PipelineCompiler();
const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

describe('PipelineCompiler', () => {
  it('compiles the approved catalogue into deterministic native PySpark', () => {
    const first = compile(completeGraph());
    const moved = compile({
      ...completeGraph(),
      nodes: completeGraph().nodes.map((node, index) => ({
        ...node,
        position: { x: index * 47, y: index * -31 },
      })),
    });

    expect(first.source).toBe(moved.source);
    expect(first.semanticGraphSha256).toBe(moved.semanticGraphSha256);
    expect(first.source).toContain('from pyspark.sql import DataFrame, SparkSession, Window');
    expect(first.compilerVersion).toBe('1.2.3');
    expect(first.source).toContain('CELESNITY_CATALOG_JDBC_URL');
    expect(first.source).toContain('CELESNITY_CATALOG_JDBC_USER');
    expect(first.source).toContain('CELESNITY_CATALOG_JDBC_PASSWORD');
    expect(first.source).toContain(String.raw`.option("dbtable", "\"public\".\"customers\"")`);
    expect(first.source).toContain('F.col("id") == F.lit(10)');
    expect(first.source).toContain('F.col("id").cast("long").alias("id")');
    expect(first.source).toContain('.select(F.col("id"), F.col("name"), F.col("status"))');
    expect(first.source).toContain('.drop("status")');
    expect(first.source).toContain('.withColumnRenamed("name", "customer_name")');
    expect(first.source).toContain('Window.partitionBy(F.col("id")).orderBy(');
    expect(first.source).toContain('drop_all_null_columns(');
    expect(first.source).toContain('.dropna(how="any", subset=["id"])');
    expect(first.source).toContain('fill_missing_value(');
    expect(first.source).toContain('.groupBy(F.col("customer_name")).agg(F.count(');
    expect(first.source).toContain('write_iceberg_target_with_output_facts(');
    expect(first.source).toContain(
      '"analytics", "customers", "APPEND", "target", args.execution_id, workflow_output_plan',
    );
    expect(first.source).not.toContain('awsglue');
    expect(first.source).not.toContain('job.commit');
    expect(Object.keys(first.sourceMap)).toEqual(completeGraph().nodes.map((node) => node.id));
  });

  it('creates a new Iceberg table when the target selects create-new mode', () => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'target'
        ? {
            ...item,
            config: {
              databaseName: 'analytics',
              tableMode: 'CREATE_NEW',
              newTableName: 'daily_customers',
            },
          }
        : item,
    );

    expect(compile({ ...graph, nodes }).source).toContain(
      '"analytics", "daily_customers", "CREATE", "target", args.execution_id, workflow_output_plan',
    );
  });

  it('quotes every Iceberg identifier component so numeric table names remain valid', () => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'target'
        ? {
            ...item,
            config: {
              databaseName: 'raw_data',
              tableMode: 'CREATE_NEW',
              newTableName: '111',
            },
          }
        : item,
    );

    const source = compile({ ...graph, nodes }).source;
    expect(source).toContain('return "`" + value.replace("`", "``") + "`"');
    expect(source).toContain(
      'return ".".join(quote_iceberg_identifier(part) for part in (catalog, namespace, table))',
    );
    expect(source).toContain(
      '"raw_data", "111", "CREATE", "target", args.execution_id, workflow_output_plan',
    );
  });

  it('compiles direct and crawler-backed bindings to the same physical JDBC source', () => {
    const direct = completeGraph();
    const catalogNodes = direct.nodes.map((item) =>
      item.id === 'source'
        ? {
            ...item,
            config: {
              ...item.config,
              sourceMode: 'CATALOG',
              catalogNamespaceId: '22222222-2222-4222-8222-222222222222',
              catalogRelationId: '33333333-3333-4333-8333-333333333333',
            },
          }
        : item,
    );

    expect(jdbcSource(compile({ ...direct, nodes: catalogNodes }).source)).toBe(
      jdbcSource(compile(direct).source),
    );
  });

  it('reads a managed Data Catalog table through its independent Iceberg source', () => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'source'
        ? {
            ...item,
            definitionType: 'ICEBERG_SOURCE',
            resourceId: 'iceberg-source:iceberg',
            config: {
              catalogDatabaseName: 'analytics',
              catalogTableName: 'customers',
            },
          }
        : item,
    );

    const source = compile({ ...graph, nodes }).source;
    expect(source).toContain('spark.read.table(qualified_iceberg_table("analytics", "customers"))');
    expect(source).not.toContain('spark.read.format("jdbc")');
  });

  it('compiles Manual SQL against the upstream dataset exposed as input', () => {
    const graph = completeGraph();
    const targetIndex = graph.nodes.findIndex((item) => item.id === 'target');
    const manual = node('manual-sql', 'MANUAL_SQL', {
      name: 'Keep active customers',
      sql: 'SELECT id, customer_name FROM input WHERE count > 0',
    });
    const nodes = [...graph.nodes.slice(0, targetIndex), manual, ...graph.nodes.slice(targetIndex)];
    const edges = nodes.slice(1).map((current, index) => ({
      id: `manual-edge-${String(index)}`,
      sourceNodeId: nodes[index]!.id,
      sourcePortId: 'output',
      targetNodeId: current.id,
      targetPortId: 'input',
    }));

    const source = compile({ nodes, edges }).source;
    expect(source).toContain('.createOrReplaceTempView("input")');
    expect(source).toContain('spark.sql("SELECT id, customer_name FROM input WHERE count > 0")');
  });

  it('replaces an existing Iceberg table data and schema in overwrite mode', () => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'target'
        ? {
            ...item,
            config: {
              databaseName: 'analytics',
              tableMode: 'EXISTING',
              tableName: 'customers',
              writeMode: 'OVERWRITE',
            },
          }
        : item,
    );

    const source = compile({ ...graph, nodes }).source;
    expect(source).toContain(
      '"analytics", "customers", "OVERWRITE", "target", args.execution_id, workflow_output_plan',
    );
    expect(source).toContain('writer.using("iceberg").createOrReplace()');
    expect(source).not.toContain('.overwrite(F.lit(True))');
  });

  it('keeps run-data staging out of the customer JDBC catalog and emits facts after commit', () => {
    const source = compile(completeGraph()).source;
    const stageCatalogIndex = source.indexOf('"org.apache.iceberg.jdbc.JdbcCatalog"');
    const stageWriteIndex = source.indexOf('frame.writeTo(stage_table).using("iceberg").create()');
    const countIndex = source.indexOf('materialized.agg(*expressions)');
    const targetCommitIndex = source.indexOf(
      '_write_final_target(materialized, final_target, mode)',
    );
    const factsEventIndex = source.indexOf('emit_event("PIPELINE_OUTPUT_FACTS"');
    const stageCleanupIndex = source.indexOf('"DROP TABLE IF EXISTS " + stage_table + " PURGE"');

    expect(source).toContain('catalog + "_workflow_staging"');
    expect(source).toContain('staging_warehouse = warehouse + "/.celesnity-workflow-staging"');
    expect(source).toContain('f"spark.sql.catalog.{staging_catalog}.uri", catalog_uri');
    expect(source).toContain('f"spark.sql.catalog.{staging_catalog}.jdbc.schema-version", "V1"');
    expect(source).toContain('WORKFLOW_STAGE_TTL_SECONDS = 7 * 24 * 60 * 60');
    expect(source).toContain('WORKFLOW_STAGE_JANITOR_MAX_DROPS = 100');
    expect(source).not.toContain('"org.apache.iceberg.hadoop.HadoopCatalog"');
    expect(stageCatalogIndex).toBeGreaterThanOrEqual(0);
    expect(stageWriteIndex).toBeGreaterThan(stageCatalogIndex);
    expect(countIndex).toBeGreaterThan(stageWriteIndex);
    expect(targetCommitIndex).toBeGreaterThan(countIndex);
    expect(factsEventIndex).toBeGreaterThan(targetCommitIndex);
    expect(stageCleanupIndex).toBeGreaterThan(factsEventIndex);
  });

  it('produces Python that passes the interpreter syntax compiler', () => {
    const result = spawnSync(
      pythonCommand,
      ['-c', 'import sys; compile(sys.stdin.read(), "generated_pipeline.py", "exec")'],
      { input: compile(completeGraph()).source, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('escapes configured names and values instead of injecting Python', () => {
    const graph = completeGraph();
    const filter = graph.nodes.find((node) => node.definitionType === 'FILTER')!;
    const hostile = {
      ...filter,
      config: {
        ...filter.config,
        name: 'Filter\nraise RuntimeError("injected")',
        conditions: [
          {
            key: 'name',
            operator: 'EQUALS',
            value: 'x")\nraise RuntimeError("injected',
          },
        ],
      },
    };
    const source = compile({
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === hostile.id ? hostile : node)),
    }).source;

    expect(source).toContain(String.raw`F.lit("x\")\nraise RuntimeError(\"injected")`);
    expect(source).toContain('# Script generated for node Filter raise RuntimeError("injected")');
    expect(
      spawnSync(
        pythonCommand,
        ['-c', 'import sys; compile(sys.stdin.read(), "generated_pipeline.py", "exec")'],
        { input: source, encoding: 'utf8' },
      ).status,
    ).toBe(0);
  });

  it('adapts the legacy matched port to the matched-only output', () => {
    const graph = completeGraph();
    const next = graph.edges.map((edge) =>
      edge.sourceNodeId === 'filter' ? { ...edge, sourcePortId: 'matched' } : edge,
    );
    expect(() => compile({ ...graph, edges: next })).not.toThrow();
  });

  it('refuses to discard a legacy rejected branch', () => {
    const graph = completeGraph();
    const next = graph.edges.map((edge) =>
      edge.sourceNodeId === 'filter' ? { ...edge, sourcePortId: 'rejected' } : edge,
    );
    expect(compilationError(() => compile({ ...graph, edges: next }))).toMatchObject({
      issues: [expect.objectContaining({ code: 'LEGACY_FILTER_REJECTED_UNSUPPORTED' })],
    });
  });

  it.each([
    ['EQUALS', { type: 'INTEGER', value: '10' }, 'F.col("id") == F.lit(10)'],
    ['NOT_EQUALS', { type: 'STRING', value: 'inactive' }, 'F.col("id") != F.lit("inactive")'],
    ['GREATER_THAN', { type: 'DECIMAL', value: '10.5' }, 'F.col("id") > F.lit(10.5)'],
    ['GREATER_THAN_OR_EQUALS', 10, 'F.col("id") >= F.lit(10)'],
    ['LESS_THAN', 10, 'F.col("id") < F.lit(10)'],
    ['LESS_THAN_OR_EQUALS', 10, 'F.col("id") <= F.lit(10)'],
    ['CONTAINS', 'ten', 'F.col("id").contains("ten")'],
    ['STARTS_WITH', 'ten', 'F.col("id").startswith("ten")'],
    ['ENDS_WITH', 'ten', 'F.col("id").endswith("ten")'],
    ['IN', ['one', 'two'], 'F.col("id").isin("one", "two")'],
    ['IS_NULL', undefined, 'F.col("id").isNull()'],
    ['IS_NOT_NULL', undefined, 'F.col("id").isNotNull()'],
  ])('compiles FILTER operator %s', (operator, value, expected) => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'filter'
        ? {
            ...item,
            config: {
              ...item.config,
              conditions: [{ key: 'id', operator, ...(value === undefined ? {} : { value }) }],
            },
          }
        : item,
    );
    expect(compile({ ...graph, nodes }).source).toContain(expected);
  });

  it('requires ordering when match keys choose a duplicate row', () => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'duplicates' ? { ...item, config: { ...item.config, orderBy: [] } } : item,
    );
    expect(compilationError(() => compile({ ...graph, nodes }))).toMatchObject({
      issues: [expect.objectContaining({ code: 'NODE_CONFIG_INVALID', field: 'orderBy' })],
    });
  });

  it.each(['MEAN', 'MEDIAN', 'MODE'])('compiles %s missing-value strategy', (strategy) => {
    const graph = completeGraph();
    const nodes = graph.nodes.map((item) =>
      item.id === 'fill'
        ? { ...item, config: { ...item.config, strategy, value: undefined } }
        : item,
    );
    expect(compile({ ...graph, nodes }).source).toContain(`"${strategy}"`);
  });
});

function compile(graph: PipelineGraph): CompiledPipeline {
  return compiler.compile({
    pipelineId: '00000000-0000-4000-8000-000000000001',
    pipelineVersion: 7,
    pipelineName: 'Customers',
    graph,
    definitionsByNodeId: definitions(graph.nodes),
  });
}

function compilationError(action: () => unknown): PipelineCompilationError {
  try {
    action();
  } catch (error: unknown) {
    return error as PipelineCompilationError;
  }
  throw new Error('Expected pipeline compilation to fail.');
}

function jdbcSource(source: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.includes('spark.read.format("jdbc")'));
  return lines.slice(start, start + 7).join('\n');
}

function completeGraph(): PipelineGraph {
  const nodes: PipelineNode[] = [
    node('source', 'POSTGRES_SOURCE', {
      schemaName: 'public',
      tableName: 'customers',
    }),
    node('change', 'CHANGE_SCHEMA', {
      name: 'Change Schema',
      mappings: [{ sourceField: 'id', targetField: 'id', targetType: 'long' }],
    }),
    node('select', 'SELECT_FIELDS', { name: 'Select', fields: ['id', 'name', 'status'] }),
    node('drop', 'DROP_FIELDS', { name: 'Drop', fields: ['status'] }),
    node('rename', 'RENAME_FIELD', {
      name: 'Rename',
      sourceField: 'name',
      targetField: 'customer_name',
    }),
    node('filter', 'FILTER', {
      name: 'Filter',
      combination: 'AND',
      conditions: [{ key: 'id', operator: 'EQUALS', value: 10 }],
    }),
    node('duplicates', 'DROP_DUPLICATES', {
      name: 'Duplicates',
      matchFields: ['id'],
      orderBy: [{ field: 'id', direction: 'ASC', nulls: 'LAST' }],
      keep: 'FIRST',
    }),
    node('drop-null-fields', 'DROP_NULL_FIELDS', { name: 'Drop Null Fields' }),
    node('remove-null-rows', 'REMOVE_NULL_ROWS', {
      name: 'Remove Null Rows',
      fields: ['id'],
      mode: 'ANY',
    }),
    node('fill', 'FILL_MISSING_VALUES', {
      name: 'Fill',
      field: 'customer_name',
      strategy: 'LITERAL',
      value: 'unknown',
    }),
    node('aggregate', 'AGGREGATE', {
      name: 'Aggregate',
      groupBy: ['customer_name'],
      aggregations: [{ sourceField: 'id', function: 'COUNT', outputField: 'count' }],
    }),
    node(
      'target',
      'ICEBERG_TARGET',
      {
        databaseName: 'analytics',
        tableMode: 'EXISTING',
        tableName: 'customers',
        writeMode: 'APPEND',
      },
      'iceberg:iceberg',
    ),
  ];
  return {
    nodes,
    edges: nodes.slice(1).map((current, index) => ({
      id: `edge-${String(index)}`,
      sourceNodeId: nodes[index]!.id,
      sourcePortId: 'output',
      targetNodeId: current.id,
      targetPortId: 'input',
    })),
  };
}

function node(
  id: string,
  definitionType: string,
  config: Readonly<Record<string, unknown>>,
  resourceId?: string,
): PipelineNode {
  return {
    id,
    definitionType,
    ...(resourceId === undefined ? {} : { resourceId }),
    position: { x: 0, y: 0 },
    config,
  };
}

function definitions(nodes: readonly PipelineNode[]): ReadonlyMap<string, NodeDefinition> {
  return new Map(
    nodes.map((item): [string, NodeDefinition] => {
      const category = item.definitionType.endsWith('_SOURCE')
        ? 'SOURCE'
        : item.definitionType.endsWith('_TARGET')
          ? 'TARGET'
          : 'TRANSFORM';
      return [
        item.id,
        {
          resourceId: item.resourceId ?? item.definitionType,
          type: item.definitionType,
          category,
          label: item.definitionType,
          iconKey: item.definitionType.toLowerCase(),
          description: item.definitionType,
          enabled: true,
          runtimeKind:
            category === 'SOURCE'
              ? item.definitionType === 'ICEBERG_SOURCE'
                ? 'SPARK_ICEBERG_SOURCE'
                : 'SPARK_JDBC_SOURCE'
              : category === 'TARGET'
                ? 'SPARK_ICEBERG_TARGET'
                : 'SPARK_DATAFRAME',
          inputPorts:
            category === 'SOURCE'
              ? []
              : [
                  {
                    id: 'input',
                    label: 'Input',
                    dataType: 'DATASET',
                    required: true,
                    maxConnections: 1,
                  },
                ],
          outputPorts:
            category === 'TARGET'
              ? []
              : [
                  {
                    id: 'output',
                    label: 'Output',
                    dataType: 'DATASET',
                    required: false,
                    maxConnections: null,
                  },
                ],
          propertyPanel: { sections: [] },
          ...(item.definitionType === 'POSTGRES_SOURCE'
            ? {
                source: {
                  connectionId: '00000000-0000-4000-8000-000000000002',
                  connectionName: 'Source',
                  dbmsType: 'POSTGRESQL',
                  configSchemaVersion: 1,
                  config: {},
                  verificationStatus: 'SUCCEEDED',
                  createdAt: '2026-08-16T00:00:00.000Z',
                  updatedAt: '2026-08-16T00:00:00.000Z',
                },
              }
            : {}),
          ...(category === 'TARGET' && item.resourceId?.split('.').length === 3
            ? {
                target: {
                  catalogName: 'iceberg',
                  databaseName: 'analytics',
                  tableName: 'customers',
                  tableType: 'BASE TABLE',
                  storageFormat: 'ICEBERG',
                },
              }
            : {}),
        },
      ];
    }),
  );
}
