import { describe, expect, it } from 'vitest';

import type { NodePropertyPanel } from '@/src/entities/models/node-definition';
import type { PipelineEdge, PipelineGraph, PipelineNode } from '@/src/entities/models/pipeline';
import {
  addEdge,
  addNode,
  defaultConfigFromPanel,
  emptyGraph,
  findNode,
  graphsEqual,
  moveNode,
  nodeIssuesById,
  removeEdge,
  removeNode,
  updateNodeConfig,
} from '@/src/entities/models/pipeline-graph';

function node(id: string, overrides: Partial<PipelineNode> = {}): PipelineNode {
  return {
    id,
    definitionType: 'FILTER',
    position: { x: 0, y: 0 },
    config: {},
    ...overrides,
  };
}

const firstEdge: PipelineEdge = {
  id: 'edge-1',
  sourceNodeId: 'a',
  sourcePortId: 'output',
  targetNodeId: 'b',
  targetPortId: 'input',
};

const twoNodesConnected: PipelineGraph = {
  nodes: [node('a'), node('b')],
  edges: [firstEdge],
};

describe('pipeline graph nodes', () => {
  it('appends a node without mutating the source graph', () => {
    const graph = addNode(emptyGraph, node('a'));

    expect(graph.nodes).toHaveLength(1);
    expect(emptyGraph.nodes).toHaveLength(0);
    expect(findNode(graph, 'a')?.id).toBe('a');
  });

  it('rejects a node whose identifier is already taken', () => {
    const graph = addNode(
      addNode(emptyGraph, node('a')),
      node('a', { definitionType: 'AGGREGATE' }),
    );

    expect(graph.nodes).toHaveLength(1);
    expect(findNode(graph, 'a')?.definitionType).toBe('FILTER');
  });

  it('moves only the addressed node', () => {
    const graph = moveNode(twoNodesConnected, 'b', { x: 120, y: 40 });

    expect(findNode(graph, 'b')?.position).toEqual({ x: 120, y: 40 });
    expect(findNode(graph, 'a')?.position).toEqual({ x: 0, y: 0 });
  });

  it('drops every edge touching a removed node', () => {
    const graph = removeNode(twoNodesConnected, 'b');

    expect(graph.nodes.map((entry) => entry.id)).toEqual(['a']);
    expect(graph.edges).toHaveLength(0);
  });

  it('merges configuration changes into the addressed node', () => {
    const configured = updateNodeConfig(twoNodesConnected, 'a', { schemaName: 'public' });
    const graph = updateNodeConfig(configured, 'a', { tableName: 'orders' });

    expect(findNode(graph, 'a')?.config).toEqual({ schemaName: 'public', tableName: 'orders' });
    expect(findNode(graph, 'b')?.config).toEqual({});
  });

  it('updates crawler metadata coordinates without changing the source resource binding', () => {
    const graph = updateNodeConfig(twoNodesConnected, 'a', {
      catalogNamespaceId: '22222222-2222-4222-8222-222222222222',
      catalogRelationId: '33333333-3333-4333-8333-333333333333',
      schemaName: 'public',
      tableName: 'customers',
    });

    expect(findNode(graph, 'a')).toMatchObject({
      config: {
        catalogNamespaceId: '22222222-2222-4222-8222-222222222222',
        catalogRelationId: '33333333-3333-4333-8333-333333333333',
        schemaName: 'public',
        tableName: 'customers',
      },
    });
    expect(findNode(graph, 'a')?.resourceId).toBeUndefined();
    expect(findNode(graph, 'b')?.config).toEqual({});
  });

  it('ignores changes addressed to an unknown node', () => {
    expect(updateNodeConfig(twoNodesConnected, 'missing', { a: 1 })).toBe(twoNodesConnected);
    expect(moveNode(twoNodesConnected, 'missing', { x: 1, y: 1 })).toBe(twoNodesConnected);
    expect(removeNode(twoNodesConnected, 'missing')).toBe(twoNodesConnected);
  });
});

describe('pipeline graph edges', () => {
  const secondEdge = {
    id: 'edge-2',
    sourceNodeId: 'b',
    sourcePortId: 'output',
    targetNodeId: 'a',
    targetPortId: 'input',
  };

  it('appends an edge', () => {
    const graph = addEdge(twoNodesConnected, secondEdge);

    expect(graph.edges.map((edge) => edge.id)).toEqual(['edge-1', 'edge-2']);
  });

  it('never duplicates the same port pair', () => {
    const duplicate: PipelineEdge = { ...firstEdge, id: 'edge-copy' };

    expect(addEdge(twoNodesConnected, duplicate)).toBe(twoNodesConnected);
  });

  it('removes an edge by identifier', () => {
    expect(removeEdge(twoNodesConnected, 'edge-1').edges).toHaveLength(0);
    expect(removeEdge(twoNodesConnected, 'missing')).toBe(twoNodesConnected);
  });
});

describe('graph equality', () => {
  it('ignores ordering so a reordered graph is not reported as unsaved', () => {
    const reordered: PipelineGraph = {
      nodes: [...twoNodesConnected.nodes].reverse(),
      edges: twoNodesConnected.edges,
    };

    expect(graphsEqual(twoNodesConnected, reordered)).toBe(true);
  });

  it('detects position, configuration, and edge changes', () => {
    expect(graphsEqual(twoNodesConnected, moveNode(twoNodesConnected, 'a', { x: 5, y: 0 }))).toBe(
      false,
    );
    expect(
      graphsEqual(twoNodesConnected, updateNodeConfig(twoNodesConnected, 'a', { limit: 10 })),
    ).toBe(false);
    expect(graphsEqual(twoNodesConnected, removeEdge(twoNodesConnected, 'edge-1'))).toBe(false);
  });

  it('compares nested configuration values structurally', () => {
    const left = addNode(emptyGraph, node('a', { config: { aggregations: { total: 'SUM' } } }));
    const right = addNode(emptyGraph, node('a', { config: { aggregations: { total: 'SUM' } } }));
    const other = addNode(emptyGraph, node('a', { config: { aggregations: { total: 'AVG' } } }));

    expect(graphsEqual(left, right)).toBe(true);
    expect(graphsEqual(left, other)).toBe(false);
  });
});

describe('default configuration', () => {
  const panel: NodePropertyPanel = {
    sections: [
      {
        id: 'general',
        title: 'General',
        fields: [
          { key: 'label', label: 'Label', component: 'TEXT_INPUT', required: false },
          {
            key: 'writeMode',
            label: 'Write mode',
            component: 'SELECT',
            required: true,
            defaultValue: 'APPEND',
          },
        ],
      },
      {
        id: 'transformation',
        title: 'Transformation',
        fields: [
          { key: 'groupBy', label: 'Grouping fields', component: 'MULTI_SELECT', required: false },
          {
            key: 'conditions',
            label: 'Conditions',
            component: 'FILTER_BUILDER',
            required: true,
          },
          {
            key: 'aggregations',
            label: 'Aggregations',
            component: 'AGGREGATION_BUILDER',
            required: true,
          },
          { key: 'value', label: 'Value', component: 'TYPED_VALUE', required: false },
        ],
      },
    ],
  };

  it('seeds declared defaults and empty containers, leaving free text unset', () => {
    expect(defaultConfigFromPanel(panel)).toEqual({
      writeMode: 'APPEND',
      groupBy: [],
      conditions: [],
      aggregations: [],
      value: { type: 'STRING', value: '' },
    });
  });
});

describe('validation issue grouping', () => {
  it('groups issues by node and skips graph-wide issues', () => {
    const issues = nodeIssuesById([
      { code: 'GRAPH_TARGET_REQUIRED', message: 'The graph requires at least one target node.' },
      { code: 'NODE_CONFIG_REQUIRED', message: 'Table is required.', nodeId: 'a', field: 'table' },
      { code: 'NODE_CONFIG_INVALID', message: 'Schema is invalid.', nodeId: 'a' },
    ]);

    expect(issues.get('a')).toHaveLength(2);
    expect(issues.size).toBe(1);
  });
});
