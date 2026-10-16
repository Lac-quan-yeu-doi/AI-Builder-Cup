import type {
  Condition,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from '@domain/data-workflow/models/workflow-graph';
import { validateWorkflowGraph } from '@domain/data-workflow/services/validate-workflow-graph';

const accepted: Condition = {
  op: 'eq',
  path: ['extract', 'status'],
  value: 'accepted',
};

function node(
  overrides: Partial<WorkflowGraphNode> & Pick<WorkflowGraphNode, 'id' | 'type'>,
): WorkflowGraphNode {
  switch (overrides.type) {
    case 'PIPELINE':
      return { pipelineId: `${overrides.id}-pipeline`, versionNumber: 1, ...overrides };
    case 'CONDITIONAL_SPLIT':
      return {
        branches: [{ id: 'accepted', condition: accepted }],
        mode: 'FIRST_MATCH',
        ...overrides,
      } as WorkflowGraphNode;
    default:
      return overrides;
  }
}

function edge(
  overrides: Partial<WorkflowGraphEdge> &
    Pick<WorkflowGraphEdge, 'id' | 'sourceNodeId' | 'targetNodeId'>,
): WorkflowGraphEdge {
  return {
    sourcePortId: 'out',
    targetPortId: 'in',
    ...overrides,
  };
}

function validGraph(): WorkflowGraph {
  return {
    nodes: [
      node({ id: 'trigger', type: 'TRIGGER' }),
      node({ id: 'extract', type: 'PIPELINE' }),
      node({ id: 'gate', type: 'CONDITIONAL_SPLIT' }),
      node({ id: 'join', type: 'JOIN' }),
      node({ id: 'load', type: 'PIPELINE' }),
    ],
    edges: [
      edge({ id: 'trigger-extract', sourceNodeId: 'trigger', targetNodeId: 'extract' }),
      edge({ id: 'extract-gate', sourceNodeId: 'extract', targetNodeId: 'gate' }),
      edge({
        id: 'gate-join',
        sourceNodeId: 'gate',
        sourcePortId: 'accepted',
        targetNodeId: 'join',
      }),
      edge({ id: 'join-load', sourceNodeId: 'join', targetNodeId: 'load' }),
    ],
  };
}

function runDataGraph(): WorkflowGraph {
  return {
    nodes: [
      node({ id: 'trigger', type: 'TRIGGER' }),
      node({ id: 'source', type: 'PIPELINE' }),
      {
        id: 'run-data-gate',
        type: 'CONDITIONAL_SPLIT',
        conditionKind: 'RUN_DATA',
        mode: 'FIRST_MATCH',
        branches: [
          {
            id: 'large-orders',
            runDataCondition: {
              targetNodeId: 'orders-target',
              quantifier: 'ANY',
              predicate: { column: 'amount', operator: 'GT', value: 100 },
            },
          },
          { id: 'otherwise', fallback: true },
        ],
      },
      node({ id: 'large-job', type: 'PIPELINE' }),
      node({ id: 'other-job', type: 'PIPELINE' }),
    ],
    edges: [
      edge({ id: 'trigger-source', sourceNodeId: 'trigger', targetNodeId: 'source' }),
      edge({ id: 'source-gate', sourceNodeId: 'source', targetNodeId: 'run-data-gate' }),
      edge({
        id: 'gate-large',
        sourceNodeId: 'run-data-gate',
        sourcePortId: 'large-orders',
        targetNodeId: 'large-job',
      }),
      edge({
        id: 'gate-other',
        sourceNodeId: 'run-data-gate',
        sourcePortId: 'otherwise',
        targetNodeId: 'other-job',
      }),
    ],
  };
}

function parallelOutcomeGraph(): WorkflowGraph {
  return {
    nodes: [
      node({ id: 'trigger', type: 'TRIGGER' }),
      node({ id: 'parallel', type: 'PARALLEL_SPLIT' }),
      node({ id: 'a', type: 'PIPELINE' }),
      node({ id: 'b', type: 'PIPELINE' }),
      node({ id: 'c', type: 'PIPELINE' }),
      node({ id: 'join', type: 'JOIN' }),
      node({ id: 'd', type: 'PIPELINE' }),
      node({ id: 'outcome', type: 'PIPELINE_OUTCOME' }),
      node({ id: 'e', type: 'PIPELINE' }),
    ],
    edges: [
      edge({ id: 'trigger-parallel', sourceNodeId: 'trigger', targetNodeId: 'parallel' }),
      edge({ id: 'parallel-a', sourceNodeId: 'parallel', targetNodeId: 'a' }),
      edge({ id: 'parallel-b', sourceNodeId: 'parallel', targetNodeId: 'b' }),
      edge({ id: 'parallel-c', sourceNodeId: 'parallel', targetNodeId: 'c' }),
      edge({ id: 'a-join', sourceNodeId: 'a', targetNodeId: 'join' }),
      edge({ id: 'b-join', sourceNodeId: 'b', targetNodeId: 'join' }),
      edge({ id: 'join-d', sourceNodeId: 'join', targetNodeId: 'd' }),
      edge({ id: 'c-outcome', sourceNodeId: 'c', targetNodeId: 'outcome' }),
      edge({ id: 'outcome-e', sourceNodeId: 'outcome', sourcePortId: 'error', targetNodeId: 'e' }),
    ],
  };
}

describe('validateWorkflowGraph', () => {
  it('accepts a parallel outcome error route independent of the A/B join', () => {
    expect(validateWorkflowGraph(parallelOutcomeGraph())).toEqual([]);
  });

  it('accepts multiple direct pipeline inputs to one outcome', () => {
    const graph = parallelOutcomeGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: [
          ...graph.edges,
          edge({ id: 'b-outcome', sourceNodeId: 'b', targetNodeId: 'outcome' }),
        ],
      }),
    ).toEqual([]);
  });

  it('rejects an outcome source port other than success or error', () => {
    const graph = parallelOutcomeGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: graph.edges.map((candidate) =>
          candidate.id === 'outcome-e' ? { ...candidate, sourcePortId: 'out' } : candidate,
        ),
      }),
    ).toContainEqual({ code: 'INVALID_SOURCE_PORT', edgeId: 'outcome-e' });
  });

  it('requires at least one connected outcome route', () => {
    const graph = parallelOutcomeGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        nodes: graph.nodes.filter((candidate) => candidate.id !== 'e'),
        edges: graph.edges.filter((candidate) => candidate.id !== 'outcome-e'),
      }),
    ).toContainEqual({ code: 'OUTCOME_ROUTE_MISSING', nodeId: 'outcome' });
  });

  it('rejects a non-pipeline input to an outcome', () => {
    const graph = parallelOutcomeGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: [
          ...graph.edges,
          edge({ id: 'join-outcome', sourceNodeId: 'join', targetNodeId: 'outcome' }),
        ],
      }),
    ).toContainEqual({ code: 'OUTCOME_INPUT_NOT_PIPELINE', edgeId: 'join-outcome' });
  });

  it('rejects an outcome route to a non-pipeline node', () => {
    const graph = parallelOutcomeGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: [
          ...graph.edges,
          edge({
            id: 'outcome-join',
            sourceNodeId: 'outcome',
            sourcePortId: 'success',
            targetNodeId: 'join',
          }),
        ],
      }),
    ).toContainEqual({ code: 'OUTCOME_OUTPUT_NOT_PIPELINE', edgeId: 'outcome-join' });
  });

  it('accepts a connected acyclic graph with one trigger', () => {
    expect(validateWorkflowGraph(validGraph())).toEqual([]);
  });

  it('accepts a run-data split with one direct Pipeline input and a typed predicate', () => {
    expect(validateWorkflowGraph(runDataGraph())).toEqual([]);
  });

  it('requires a run-data split to route at least one branch', () => {
    const graph = runDataGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: graph.edges.filter(
          (candidate) => candidate.id !== 'gate-large' && candidate.id !== 'gate-other',
        ),
      }),
    ).toContainEqual({ code: 'RUN_DATA_ROUTE_MISSING', nodeId: 'run-data-gate' });
  });

  it('requires run-data predicate branch IDs to be unique across run-data splits', () => {
    const graph = runDataGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'run-data-gate-2',
          type: 'CONDITIONAL_SPLIT',
          conditionKind: 'RUN_DATA',
          mode: 'FIRST_MATCH',
          branches: [
            {
              id: 'large-orders',
              runDataCondition: {
                targetNodeId: 'orders-target',
                quantifier: 'ANY',
                predicate: { column: 'amount', operator: 'GT', value: 100 },
              },
            },
          ],
        },
        node({ id: 'second-job', type: 'PIPELINE' }),
      ],
      edges: [
        ...graph.edges,
        edge({
          id: 'source-gate-2',
          sourceNodeId: 'source',
          targetNodeId: 'run-data-gate-2',
        }),
        edge({
          id: 'gate-2-job',
          sourceNodeId: 'run-data-gate-2',
          sourcePortId: 'large-orders',
          targetNodeId: 'second-job',
        }),
      ],
    });

    expect(issues).toContainEqual({
      code: 'RUN_DATA_BRANCH_ID_DUPLICATE',
      nodeId: 'run-data-gate-2',
    });
  });

  it('does not apply global run-data branch ID rules to legacy condition branches', () => {
    const graph = runDataGraph();
    const withLegacySplit: WorkflowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'legacy-gate',
          type: 'CONDITIONAL_SPLIT',
          mode: 'FIRST_MATCH',
          branches: [
            {
              id: 'large-orders',
              condition: { op: 'eq', path: ['source', 'status'], value: 'SUCCEEDED' },
            },
          ],
        },
        node({ id: 'legacy-job', type: 'PIPELINE' }),
      ],
      edges: [
        ...graph.edges,
        edge({ id: 'source-legacy-gate', sourceNodeId: 'source', targetNodeId: 'legacy-gate' }),
        edge({
          id: 'legacy-gate-job',
          sourceNodeId: 'legacy-gate',
          sourcePortId: 'large-orders',
          targetNodeId: 'legacy-job',
        }),
      ],
    };

    expect(validateWorkflowGraph(withLegacySplit)).toEqual([]);
  });

  it('requires exactly one direct Pipeline input for a run-data split', () => {
    const graph = runDataGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: graph.edges.filter((candidate) => candidate.id !== 'source-gate'),
      }),
    ).toContainEqual({ code: 'RUN_DATA_INPUT_COUNT_INVALID', nodeId: 'run-data-gate' });

    expect(
      validateWorkflowGraph({
        ...graph,
        nodes: [...graph.nodes, node({ id: 'second-source', type: 'PIPELINE' })],
        edges: [
          ...graph.edges,
          edge({
            id: 'trigger-second-source',
            sourceNodeId: 'trigger',
            targetNodeId: 'second-source',
          }),
          edge({
            id: 'second-source-gate',
            sourceNodeId: 'second-source',
            targetNodeId: 'run-data-gate',
          }),
        ],
      }),
    ).toContainEqual({ code: 'RUN_DATA_INPUT_COUNT_INVALID', nodeId: 'run-data-gate' });
  });

  it('rejects a run-data split connected from a non-Pipeline node', () => {
    const graph = runDataGraph();
    expect(
      validateWorkflowGraph({
        ...graph,
        edges: graph.edges.map((candidate) =>
          candidate.id === 'source-gate' ? { ...candidate, sourceNodeId: 'trigger' } : candidate,
        ),
      }),
    ).toContainEqual({ code: 'RUN_DATA_INPUT_NOT_PIPELINE', edgeId: 'source-gate' });
  });

  it('rejects missing target/column/value and negative Count thresholds', () => {
    const graph = runDataGraph();
    const invalid = {
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === 'run-data-gate'
          ? {
              ...candidate,
              branches: [
                {
                  id: 'large-orders',
                  runDataCondition: {
                    targetNodeId: ' ',
                    quantifier: 'COUNT',
                    predicate: { column: '', operator: 'GT' },
                    count: { operator: 'GTE', threshold: -1 },
                  },
                },
                { id: 'otherwise', fallback: true },
              ],
            }
          : candidate,
      ),
    } as unknown as WorkflowGraph;
    expect(validateWorkflowGraph(invalid)).toContainEqual({
      code: 'RUN_DATA_CONDITION_INVALID',
      nodeId: 'run-data-gate',
    });
  });

  it('reports duplicate node and edge ids', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: [...graph.nodes, node({ id: 'load', type: 'PIPELINE' })],
      edges: [
        ...graph.edges,
        edge({ id: 'join-load', sourceNodeId: 'join', targetNodeId: 'load' }),
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        { code: 'DUPLICATE_NODE_ID', nodeId: 'load' },
        { code: 'DUPLICATE_EDGE_ID', edgeId: 'join-load' },
      ]),
    );
  });

  it.each([
    [
      'no trigger',
      (graph: WorkflowGraph): WorkflowGraph => ({ ...graph, nodes: graph.nodes.slice(1) }),
    ],
    [
      'two triggers',
      (graph: WorkflowGraph): WorkflowGraph => ({
        ...graph,
        nodes: [...graph.nodes, node({ id: 'second-trigger', type: 'TRIGGER' })],
      }),
    ],
  ])('reports %s', (_caseName, mutate) => {
    expect(validateWorkflowGraph(mutate(validGraph()))).toContainEqual({
      code: 'TRIGGER_COUNT_INVALID',
    });
  });

  it('reports directed cycles', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      edges: [
        ...graph.edges,
        edge({ id: 'load-extract', sourceNodeId: 'load', targetNodeId: 'extract' }),
      ],
    });

    expect(issues).toContainEqual({ code: 'CYCLE_DETECTED' });
  });

  it('reports edges whose endpoint does not exist', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      edges: [
        ...graph.edges,
        edge({ id: 'missing-target', sourceNodeId: 'load', targetNodeId: 'missing' }),
      ],
    });

    expect(issues).toContainEqual({ code: 'DANGLING_EDGE', edgeId: 'missing-target' });
  });

  it('reports source and target ports that the connected nodes do not expose', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      edges: [
        ...graph.edges,
        edge({
          id: 'typoed-branch',
          sourceNodeId: 'gate',
          sourcePortId: 'accpeted',
          targetNodeId: 'join',
        }),
        edge({
          id: 'typoed-target-port',
          sourceNodeId: 'extract',
          targetNodeId: 'join',
          targetPortId: 'join-input',
        }),
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        { code: 'INVALID_SOURCE_PORT', edgeId: 'typoed-branch' },
        { code: 'INVALID_TARGET_PORT', edgeId: 'typoed-target-port' },
      ]),
    );
  });

  it('reports jobs that cannot be reached from the trigger', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: [...graph.nodes, node({ id: 'orphan', type: 'PIPELINE' })],
    });

    expect(issues).toContainEqual({ code: 'UNREACHABLE_NODE', nodeId: 'orphan' });
  });

  it('reports fan-in to non-join nodes', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      edges: [
        ...graph.edges,
        edge({ id: 'extract-load', sourceNodeId: 'extract', targetNodeId: 'load' }),
      ],
    });

    expect(issues).toContainEqual({ code: 'ILLEGAL_FAN_IN', nodeId: 'load' });
  });

  it('reports a condition that references an unavailable node', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === 'gate'
          ? node({
              id: 'gate',
              type: 'CONDITIONAL_SPLIT',
              branches: [
                {
                  id: 'accepted',
                  condition: { op: 'eq', path: ['missing', 'status'], value: 'accepted' },
                },
              ],
              mode: 'FIRST_MATCH',
            })
          : candidate,
      ),
    });

    expect(issues).toContainEqual({
      code: 'CONDITION_REFERENCE_UNAVAILABLE',
      nodeId: 'gate',
    });
  });

  it('reports duplicate conditional branch ids', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === 'gate'
          ? node({
              id: 'gate',
              type: 'CONDITIONAL_SPLIT',
              branches: [
                { id: 'accepted', condition: accepted },
                { id: 'accepted', condition: accepted },
              ],
              mode: 'FIRST_MATCH',
            })
          : candidate,
      ),
    });

    expect(issues).toContainEqual({ code: 'DUPLICATE_BRANCH_ID', nodeId: 'gate' });
  });

  it('accepts one final fallback branch and rejects ambiguous fallback placement', () => {
    const graph = validGraph();
    const withFallback: WorkflowGraph = {
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === 'gate'
          ? node({
              id: 'gate',
              type: 'CONDITIONAL_SPLIT',
              branches: [
                { id: 'accepted', condition: accepted },
                { id: 'otherwise', fallback: true },
              ],
              mode: 'FIRST_MATCH',
            })
          : candidate,
      ),
      edges: [
        ...graph.edges,
        edge({
          id: 'gate-fallback-join',
          sourceNodeId: 'gate',
          sourcePortId: 'otherwise',
          targetNodeId: 'join',
        }),
      ],
    };

    expect(validateWorkflowGraph(withFallback)).toEqual([]);
    const malformed = {
      ...withFallback,
      nodes: withFallback.nodes.map((candidate) =>
        candidate.id === 'gate' && candidate.type === 'CONDITIONAL_SPLIT'
          ? {
              ...candidate,
              conditionKind: undefined,
              branches: [
                { id: 'otherwise', fallback: true as const },
                { id: 'accepted', condition: accepted },
                { id: 'also-otherwise', fallback: true as const },
              ],
            }
          : candidate,
      ),
    } satisfies WorkflowGraph;

    expect(validateWorkflowGraph(malformed)).toEqual(
      expect.arrayContaining([
        { code: 'DUPLICATE_FALLBACK_BRANCH', nodeId: 'gate' },
        { code: 'FALLBACK_BRANCH_NOT_LAST', nodeId: 'gate' },
      ]),
    );
  });

  it('reports a condition that references a non-ancestor node', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      edges: [
        ...graph.edges,
        edge({ id: 'trigger-side-job', sourceNodeId: 'trigger', targetNodeId: 'side-job' }),
      ],
      nodes: [...graph.nodes, node({ id: 'side-job', type: 'PIPELINE' })].map((candidate) =>
        candidate.id === 'gate'
          ? node({
              id: 'gate',
              type: 'CONDITIONAL_SPLIT',
              branches: [
                {
                  id: 'accepted',
                  condition: { op: 'eq', path: ['side-job', 'status'], value: 'accepted' },
                },
              ],
              mode: 'FIRST_MATCH',
            })
          : candidate,
      ),
    });

    expect(issues).toContainEqual({
      code: 'CONDITION_REFERENCE_NOT_ANCESTOR',
      nodeId: 'gate',
    });
  });

  it('reports a condition that references its own conditional split', () => {
    const graph = validGraph();
    const issues = validateWorkflowGraph({
      ...graph,
      nodes: graph.nodes.map((candidate) =>
        candidate.id === 'gate'
          ? node({
              id: 'gate',
              type: 'CONDITIONAL_SPLIT',
              branches: [
                {
                  id: 'accepted',
                  condition: { op: 'eq', path: ['gate', 'status'], value: 'accepted' },
                },
              ],
              mode: 'FIRST_MATCH',
            })
          : candidate,
      ),
    });

    expect(issues).toContainEqual({
      code: 'CONDITION_REFERENCE_NOT_ANCESTOR',
      nodeId: 'gate',
    });
  });
});
