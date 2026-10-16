import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import type { WorkflowPipelineRunDataFacts } from '@domain/data-workflow/models/workflow-run-data-facts';
import type { DataWorkflowNodeAttempt } from '@domain/data-workflow/models/workflow-persistence';
import { planWorkflowTransition } from '@domain/data-workflow/services/plan-workflow-transition';

const graph: WorkflowGraph = {
  nodes: [
    { id: 'trigger', type: 'TRIGGER' },
    { id: 'source', type: 'PIPELINE', pipelineId: 'pipeline-source', versionNumber: 3 },
    {
      id: 'gate',
      type: 'CONDITIONAL_SPLIT',
      conditionKind: 'RUN_DATA',
      mode: 'FIRST_MATCH',
      branches: [
        {
          id: 'any-large-order',
          runDataCondition: {
            targetNodeId: 'orders-target',
            quantifier: 'ANY',
            predicate: { column: 'amount', operator: 'GT', value: 100 },
          },
        },
        {
          id: 'count-large-orders',
          runDataCondition: {
            targetNodeId: 'orders-target',
            quantifier: 'COUNT',
            predicate: { column: 'amount', operator: 'GT', value: 100 },
            count: { operator: 'GTE', threshold: 2 },
          },
        },
        { id: 'otherwise', fallback: true },
      ],
    },
    { id: 'any-job', type: 'PIPELINE', pipelineId: 'pipeline-any', versionNumber: 1 },
    { id: 'count-job', type: 'PIPELINE', pipelineId: 'pipeline-count', versionNumber: 1 },
    { id: 'fallback-job', type: 'PIPELINE', pipelineId: 'pipeline-fallback', versionNumber: 1 },
  ],
  edges: [
    {
      id: 'trigger-source',
      sourceNodeId: 'trigger',
      sourcePortId: 'out',
      targetNodeId: 'source',
      targetPortId: 'in',
    },
    {
      id: 'source-gate',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: 'gate',
      targetPortId: 'in',
    },
    {
      id: 'gate-any',
      sourceNodeId: 'gate',
      sourcePortId: 'any-large-order',
      targetNodeId: 'any-job',
      targetPortId: 'in',
    },
    {
      id: 'gate-count',
      sourceNodeId: 'gate',
      sourcePortId: 'count-large-orders',
      targetNodeId: 'count-job',
      targetPortId: 'in',
    },
    {
      id: 'gate-fallback',
      sourceNodeId: 'gate',
      sourcePortId: 'otherwise',
      targetNodeId: 'fallback-job',
      targetPortId: 'in',
    },
  ],
};

function sourceAttempt(executionId: string): DataWorkflowNodeAttempt {
  return {
    id: `source-attempt-${executionId}`,
    organizationId: 'organization-1',
    runId: 'run-1',
    nodeId: 'source',
    attemptNumber: 2,
    executionId,
    state: 'SUCCEEDED',
    createdAt: new Date('2026-09-24T09:00:00.000Z'),
    updatedAt: new Date('2026-09-24T09:01:00.000Z'),
  };
}

function facts(
  executionId: string,
  overrides: Partial<WorkflowPipelineRunDataFacts['targets'][number]> = {},
): Readonly<Record<string, WorkflowPipelineRunDataFacts>> {
  return {
    source: {
      executionId,
      targets: [
        {
          targetNodeId: 'orders-target',
          totalRows: 4,
          matchesByBranchId: { 'any-large-order': 2, 'count-large-orders': 2 },
          ...overrides,
        },
      ],
    },
  };
}

function transition(
  nodeAttempts: readonly DataWorkflowNodeAttempt[],
  runDataFacts?: Readonly<Record<string, WorkflowPipelineRunDataFacts>>,
  workflowGraph: WorkflowGraph = graph,
) {
  return planWorkflowTransition({
    graph: workflowGraph,
    organizationId: 'organization-1',
    runId: 'run-1',
    nodeAttempts,
    edgeStates: [],
    triggerContext: {},
    parameters: {},
    runDataFacts,
    now: new Date('2026-09-24T09:02:00.000Z'),
    nextId: (() => {
      let id = 0;
      return () => `generated-${++id}`;
    })(),
  });
}

describe('workflow planner run-data split', () => {
  it('routes the fallback when all run-data conditions have been removed', () => {
    const fallbackOnlyGraph: WorkflowGraph = {
      ...graph,
      nodes: graph.nodes
        .filter((node) => node.id !== 'any-job' && node.id !== 'count-job')
        .map((node) =>
          node.id === 'gate' && node.type === 'CONDITIONAL_SPLIT'
            ? { ...node, branches: [{ id: 'otherwise', fallback: true }] }
            : node,
        ),
      edges: graph.edges.filter(
        (edge) => edge.sourceNodeId !== 'gate' || edge.sourcePortId === 'otherwise',
      ),
    };

    const result = transition([sourceAttempt('execution-current')], undefined, fallbackOnlyGraph);

    expect(result.eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual(['fallback-job']);
  });
  it('selects the first matching condition using the connected pipeline execution facts', () => {
    const result = transition([sourceAttempt('execution-current')], facts('execution-current'));

    expect(result.eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual(['any-job']);
    expect(result.edgeStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeId: 'gate-any', state: 'SUCCEEDED' }),
        expect.objectContaining({ edgeId: 'gate-count', state: 'SKIPPED' }),
        expect.objectContaining({ edgeId: 'gate-fallback', state: 'SKIPPED' }),
      ]),
    );
  });

  it('selects all matching condition branches in ALL_MATCH mode and uses Count facts', () => {
    const allMatchGraph: WorkflowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === 'gate' && node.type === 'CONDITIONAL_SPLIT'
          ? { ...node, mode: 'ALL_MATCH' as const }
          : node,
      ),
    };
    const result = transition(
      [sourceAttempt('execution-current')],
      facts('execution-current'),
      allMatchGraph,
    );

    expect(result.eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual([
      'any-job',
      'count-job',
    ]);
    expect(result.edgeStates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeId: 'gate-any', state: 'SUCCEEDED' }),
        expect.objectContaining({ edgeId: 'gate-count', state: 'SUCCEEDED' }),
        expect.objectContaining({ edgeId: 'gate-fallback', state: 'SKIPPED' }),
      ]),
    );
  });

  it.each([
    ['missing facts', undefined],
    ['facts from an older retry', facts('execution-old')],
    ['missing target facts', facts('execution-current', { targetNodeId: 'other-target' })],
    [
      'missing branch facts',
      facts('execution-current', { matchesByBranchId: { 'any-large-order': 2 } }),
    ],
  ])(
    'fails closed when run-data facts are absent or do not match the latest execution (%s)',
    (_label, runFacts) => {
      const result = transition([sourceAttempt('execution-current')], runFacts);

      expect(result.status).toBe('FAILED');
      expect(result.eligiblePipelineNodes).toEqual([]);
      expect(result.edgeStates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ edgeId: 'gate-any', state: 'FAILED' }),
          expect.objectContaining({ edgeId: 'gate-count', state: 'FAILED' }),
          expect.objectContaining({ edgeId: 'gate-fallback', state: 'FAILED' }),
        ]),
      );
    },
  );

  it('fails closed when bounded counts are invalid', () => {
    const result = transition(
      [sourceAttempt('execution-current')],
      facts('execution-current', { totalRows: 1, matchesByBranchId: { 'any-large-order': 2 } }),
    );

    expect(result.status).toBe('FAILED');
    expect(result.eligiblePipelineNodes).toEqual([]);
  });
});
