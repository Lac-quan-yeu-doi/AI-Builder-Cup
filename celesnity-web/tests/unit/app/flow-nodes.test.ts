import { describe, expect, it } from 'vitest';

import {
  committedMoves,
  removedNodeIds,
  toFlowNodes,
} from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/flow-nodes';
import type { PipelineFlowNode } from '@/app/(workspace)/databases/[database]/pipelines/[pipelineId]/_components/pipeline-node-card';
import type { PipelineGraph, PipelineNode, PipelinePosition } from '@/src/entities/models/pipeline';
import type { NodeDefinitionSummaryViewModel } from '@/src/interface-adapters/presenters/node-definition.presenter';

const definition: NodeDefinitionSummaryViewModel = {
  type: 'POSTGRES_SOURCE',
  resourceId: 'connection:connection-1',
  label: 'analytics-primary',
  category: 'SOURCE',
  description: 'Reads rows from a verified PostgreSQL connection.',
  resourceLabel: 'POSTGRESQL · analytics-primary',
  iconKey: 'database',
  enabled: true,
  runtimeKind: 'SPARK_JDBC_SOURCE',
  inputPorts: [],
  outputPorts: [{ id: 'output', label: 'Rows', dataType: 'DATASET', required: false }],
};

const definitions = new Map([[definition.resourceId, definition]]);

const sourceNode: PipelineNode = {
  id: 'node-1',
  definitionType: 'POSTGRES_SOURCE',
  resourceId: 'connection:connection-1',
  position: { x: 10, y: 20 },
  config: {},
};

const graph: PipelineGraph = { nodes: [sourceNode], edges: [] };

function movedGraph(position: PipelinePosition): PipelineGraph {
  return { nodes: [{ ...sourceNode, position }], edges: [] };
}

/** Keeps the assertions free of non-null assertions, which the repo bans. */
function only(nodes: readonly PipelineFlowNode[]): PipelineFlowNode {
  const [node] = nodes;
  if (!node) {
    throw new Error('expected exactly one projected node');
  }
  return node;
}

describe('flow node projection', () => {
  it('uses the generic Iceberg target presentation for a legacy table binding', () => {
    const targetGraph: PipelineGraph = {
      nodes: [
        {
          id: 'target-1',
          definitionType: 'ICEBERG_TARGET',
          resourceId: 'iceberg:iceberg.workbench_demo.scripts',
          position: { x: 0, y: 0 },
          config: {
            databaseName: 'workbench_demo',
            tableMode: 'EXISTING',
            tableName: 'scripts',
            writeMode: 'OVERWRITE',
          },
        },
      ],
      edges: [],
    };
    const targetDefinitions: ReadonlyMap<string, NodeDefinitionSummaryViewModel> = new Map([
      [
        'iceberg:iceberg',
        {
          ...definition,
          resourceId: 'iceberg:iceberg',
          type: 'ICEBERG_TARGET',
          category: 'TARGET' as const,
          label: 'Iceberg table',
          resourceLabel: undefined,
          runtimeKind: 'SPARK_ICEBERG_TARGET' as const,
          inputPorts: [{ id: 'input', label: 'Input', dataType: 'DATASET', required: true }],
          outputPorts: [],
        },
      ],
    ]);

    const [target] = toFlowNodes(targetGraph, targetDefinitions, new Map(), undefined);

    expect(target?.data).toMatchObject({
      label: 'Iceberg table',
      category: 'TARGET',
      resourceLabel: 'workbench_demo.scripts',
      unresolved: false,
    });
  });

  it('shows the selected table on a Data Catalog source instead of its generic resource', () => {
    const catalogDefinition: NodeDefinitionSummaryViewModel = {
      ...definition,
      resourceId: 'iceberg-source:iceberg',
      type: 'ICEBERG_SOURCE',
      label: 'Data Catalog',
      resourceLabel: 'ICEBERG · iceberg',
      runtimeKind: 'SPARK_ICEBERG_SOURCE',
    };
    const catalogGraph: PipelineGraph = {
      nodes: [
        {
          id: 'catalog-source',
          definitionType: 'ICEBERG_SOURCE',
          resourceId: catalogDefinition.resourceId,
          position: { x: 0, y: 0 },
          config: {
            catalogDatabaseName: 'raw_data',
            catalogTableName: 'all_transforms_e2e_20260823_01',
          },
        },
      ],
      edges: [],
    };

    const [catalogSource] = toFlowNodes(
      catalogGraph,
      new Map([[catalogDefinition.resourceId, catalogDefinition]]),
      new Map(),
      undefined,
    );

    expect(catalogSource?.data.resourceLabel).toBe('raw_data.all_transforms_e2e_20260823_01');
  });

  it('reuses the previous node object when nothing it renders has changed', () => {
    const first = toFlowNodes(graph, definitions, new Map(), undefined);
    // A new graph object with identical contents is what a no-op edit produces.
    const second = toFlowNodes(
      { nodes: [...graph.nodes], edges: [] },
      definitions,
      new Map(),
      undefined,
      first,
    );

    // React Flow keeps a node's measurements only while the object it was handed
    // is reference-identical (`adoptUserNodes`, checkEquality). A fresh object
    // every render wipes `measured` and `handleBounds`, which is what makes a
    // dragged node flicker.
    expect(only(second)).toBe(only(first));
  });

  it('carries measurements across a change that does rebuild the node', () => {
    const measured: PipelineFlowNode[] = toFlowNodes(graph, definitions, new Map(), undefined).map(
      (node) => ({ ...node, measured: { width: 228, height: 96 }, width: 228, height: 96 }),
    );

    const next = toFlowNodes(
      movedGraph({ x: 40, y: 20 }),
      definitions,
      new Map(),
      undefined,
      measured,
    );

    expect(only(next).position).toEqual({ x: 40, y: 20 });
    expect(only(next).measured).toEqual({ width: 228, height: 96 });
  });

  it('rebuilds the node when the data it renders changes', () => {
    const first = toFlowNodes(graph, definitions, new Map(), undefined);
    const flagged = toFlowNodes(
      graph,
      definitions,
      new Map([['node-1', { errors: 2, warnings: 0 }]]),
      undefined,
      first,
    );

    expect(only(flagged)).not.toBe(only(first));
    expect(only(flagged).data.errorCount).toBe(2);
    expect(only(flagged).data.warningCount).toBe(0);
  });

  it('reflects selection without rebuilding unrelated nodes', () => {
    const first = toFlowNodes(graph, definitions, new Map(), undefined);
    const selected = toFlowNodes(graph, definitions, new Map(), 'node-1', first);

    expect(only(selected).selected).toBe(true);
  });
});

describe('canvas change routing', () => {
  it('commits a move only once the pointer is released', () => {
    expect(
      committedMoves([
        { id: 'node-1', type: 'position', position: { x: 5, y: 5 }, dragging: true },
      ]),
    ).toEqual([]);

    expect(
      committedMoves([
        { id: 'node-1', type: 'position', position: { x: 5, y: 5 }, dragging: false },
      ]),
    ).toEqual([{ id: 'node-1', position: { x: 5, y: 5 } }]);
  });

  it('commits a programmatic move that never reported a drag', () => {
    expect(committedMoves([{ id: 'node-1', type: 'position', position: { x: 8, y: 9 } }])).toEqual([
      { id: 'node-1', position: { x: 8, y: 9 } },
    ]);
  });

  it('ignores a position change that carries no position', () => {
    expect(committedMoves([{ id: 'node-1', type: 'position', dragging: false }])).toEqual([]);
  });

  it('collects removals', () => {
    expect(
      removedNodeIds([
        { id: 'node-1', type: 'remove' },
        { id: 'node-2', type: 'position', position: { x: 1, y: 1 }, dragging: false },
      ]),
    ).toEqual(['node-1']);
  });
});
