import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';
import { planWorkflowTransition } from '@domain/data-workflow/services/plan-workflow-transition';

const graph: WorkflowGraph = {
  nodes: [
    { id: 'trigger', type: 'TRIGGER' },
    { id: 'split', type: 'PARALLEL_SPLIT' },
    { id: 'a', type: 'PIPELINE', pipelineId: 'pipeline-a', versionNumber: 1 },
    { id: 'b', type: 'PIPELINE', pipelineId: 'pipeline-b', versionNumber: 1 },
    { id: 'join', type: 'JOIN' },
    { id: 'c', type: 'PIPELINE', pipelineId: 'pipeline-c', versionNumber: 1 },
  ],
  edges: [
    {
      id: 'trigger-split',
      sourceNodeId: 'trigger',
      sourcePortId: 'out',
      targetNodeId: 'split',
      targetPortId: 'in',
    },
    {
      id: 'split-a',
      sourceNodeId: 'split',
      sourcePortId: 'out',
      targetNodeId: 'a',
      targetPortId: 'in',
    },
    {
      id: 'split-b',
      sourceNodeId: 'split',
      sourcePortId: 'out',
      targetNodeId: 'b',
      targetPortId: 'in',
    },
    {
      id: 'a-join',
      sourceNodeId: 'a',
      sourcePortId: 'out',
      targetNodeId: 'join',
      targetPortId: 'in',
    },
    {
      id: 'b-join',
      sourceNodeId: 'b',
      sourcePortId: 'out',
      targetNodeId: 'join',
      targetPortId: 'in',
    },
    {
      id: 'join-c',
      sourceNodeId: 'join',
      sourcePortId: 'out',
      targetNodeId: 'c',
      targetPortId: 'in',
    },
  ],
};

describe('workflow run transition planner', () => {
  it('persists attempts before dispatching both parallel branches and waits for their join', () => {
    let next = 0;
    const initial = planWorkflowTransition({
      graph,
      organizationId: 'organization-1',
      runId: 'run-1',
      nodeAttempts: [],
      edgeStates: [],
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-17T10:00:00.000Z'),
      nextId: () => `id-${++next}`,
    });

    expect(initial.eligiblePipelineNodes.map((item) => item.nodeId)).toEqual(['a', 'b']);
    expect(initial.nodeAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'a', attemptNumber: 1, state: 'RUNNING' }),
        expect.objectContaining({ nodeId: 'b', attemptNumber: 1, state: 'RUNNING' }),
      ]),
    );

    const afterA = planWorkflowTransition({
      graph,
      organizationId: 'organization-1',
      runId: 'run-1',
      nodeAttempts: initial.nodeAttempts.map((attempt) =>
        attempt.nodeId === 'a' ? { ...attempt, state: 'SUCCEEDED' as const } : attempt,
      ),
      edgeStates: initial.edgeStates,
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-17T10:01:00.000Z'),
      nextId: () => `id-${++next}`,
    });

    expect(afterA.eligiblePipelineNodes.map((item) => item.nodeId)).not.toContain('c');
    expect(afterA.nodeAttempts.some((attempt) => attempt.nodeId === 'c')).toBe(false);

    const afterBoth = planWorkflowTransition({
      graph,
      organizationId: 'organization-1',
      runId: 'run-1',
      nodeAttempts: initial.nodeAttempts.map((attempt) => ({
        ...attempt,
        state: 'SUCCEEDED' as const,
      })),
      edgeStates: initial.edgeStates,
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-17T10:02:00.000Z'),
      nextId: () => `id-${++next}`,
    });
    expect(afterBoth.eligiblePipelineNodes.map((item) => item.nodeId)).toContain('c');
    expect(afterBoth.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'c', attemptNumber: 1, state: 'RUNNING' }),
    );
  });

  it('selects only the first matching conditional branch and skips unselected work', () => {
    const conditional: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        {
          id: 'gate',
          type: 'CONDITIONAL_SPLIT',
          mode: 'FIRST_MATCH',
          branches: [
            { id: 'first', condition: { op: 'eq', path: ['trigger', 'enabled'], value: true } },
            { id: 'second', condition: { op: 'eq', path: ['trigger', 'enabled'], value: true } },
          ],
        },
        { id: 'first-job', type: 'PIPELINE', pipelineId: 'first', versionNumber: 1 },
        { id: 'second-job', type: 'PIPELINE', pipelineId: 'second', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'trigger-gate',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'gate',
          targetPortId: 'in',
        },
        {
          id: 'gate-first',
          sourceNodeId: 'gate',
          sourcePortId: 'first',
          targetNodeId: 'first-job',
          targetPortId: 'in',
        },
        {
          id: 'gate-second',
          sourceNodeId: 'gate',
          sourcePortId: 'second',
          targetNodeId: 'second-job',
          targetPortId: 'in',
        },
      ],
    };
    let next = 0;
    const plan = planWorkflowTransition({
      graph: conditional,
      organizationId: 'organization-1',
      runId: 'run-1',
      nodeAttempts: [],
      edgeStates: [],
      triggerContext: { enabled: true },
      parameters: {},
      now: new Date('2026-09-17T10:00:00.000Z'),
      nextId: () => `id-${++next}`,
    });

    expect(plan.eligiblePipelineNodes.map((item) => item.nodeId)).toEqual(['first-job']);
    expect(plan.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'second-job', state: 'SKIPPED' }),
    );

    const allMatch = planWorkflowTransition({
      graph: {
        ...conditional,
        nodes: conditional.nodes.map((node) =>
          node.id === 'gate' && node.type === 'CONDITIONAL_SPLIT'
            ? { ...node, mode: 'ALL_MATCH' as const }
            : node,
        ),
      },
      organizationId: 'organization-1',
      runId: 'run-2',
      nodeAttempts: [],
      edgeStates: [],
      triggerContext: { enabled: true },
      parameters: {},
      now: new Date('2026-09-17T10:00:00.000Z'),
      nextId: () => `id-${++next}`,
    });
    expect(allMatch.eligiblePipelineNodes.map((item) => item.nodeId)).toEqual([
      'first-job',
      'second-job',
    ]);

    const noMatch = planWorkflowTransition({
      graph: conditional,
      organizationId: 'organization-1',
      runId: 'run-3',
      nodeAttempts: [],
      edgeStates: [],
      triggerContext: { enabled: false },
      parameters: {},
      now: new Date('2026-09-17T10:00:00.000Z'),
      nextId: () => `id-${++next}`,
    });
    expect(noMatch.eligiblePipelineNodes).toEqual([]);
    expect(noMatch.nodeAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'first-job', state: 'SKIPPED' }),
        expect.objectContaining({ nodeId: 'second-job', state: 'SKIPPED' }),
      ]),
    );
  });

  it('runs the explicit fallback only when no condition matches in either conditional mode', () => {
    const conditional: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        {
          id: 'gate',
          type: 'CONDITIONAL_SPLIT',
          mode: 'FIRST_MATCH',
          branches: [
            { id: 'matched', condition: { op: 'eq', path: ['trigger', 'enabled'], value: true } },
            { id: 'otherwise', fallback: true },
          ],
        },
        { id: 'matched-job', type: 'PIPELINE', pipelineId: 'matched', versionNumber: 1 },
        { id: 'fallback-job', type: 'PIPELINE', pipelineId: 'fallback', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'trigger-gate',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'gate',
          targetPortId: 'in',
        },
        {
          id: 'gate-matched',
          sourceNodeId: 'gate',
          sourcePortId: 'matched',
          targetNodeId: 'matched-job',
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
    const plan = (mode: 'FIRST_MATCH' | 'ALL_MATCH', enabled: boolean) =>
      planWorkflowTransition({
        graph: {
          ...conditional,
          nodes: conditional.nodes.map((node) =>
            node.id === 'gate' && node.type === 'CONDITIONAL_SPLIT' ? { ...node, mode } : node,
          ),
        },
        organizationId: 'organization-1',
        runId: `run-${mode}-${String(enabled)}`,
        nodeAttempts: [],
        edgeStates: [],
        triggerContext: { enabled },
        parameters: {},
        now: new Date('2026-09-17T10:00:00.000Z'),
        nextId: () => crypto.randomUUID(),
      });

    expect(plan('FIRST_MATCH', false).eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual([
      'fallback-job',
    ]);
    expect(plan('ALL_MATCH', false).eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual([
      'fallback-job',
    ]);
    expect(plan('ALL_MATCH', true).eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual([
      'matched-job',
    ]);
  });

  it('stops new dispatch after a selected branch has failed while other work settles', () => {
    const plan = planWorkflowTransition({
      graph,
      organizationId: 'organization-1',
      runId: 'run-1',
      nodeAttempts: [
        {
          id: 'a-1',
          organizationId: 'organization-1',
          runId: 'run-1',
          nodeId: 'a',
          attemptNumber: 1,
          state: 'FAILED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'b-1',
          organizationId: 'organization-1',
          runId: 'run-1',
          nodeId: 'b',
          attemptNumber: 1,
          state: 'RUNNING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      edgeStates: [
        {
          id: 'trigger-split',
          organizationId: 'organization-1',
          runId: 'run-1',
          edgeId: 'trigger-split',
          state: 'SUCCEEDED',
          updatedAt: new Date(),
        },
        {
          id: 'split-a',
          organizationId: 'organization-1',
          runId: 'run-1',
          edgeId: 'split-a',
          state: 'SUCCEEDED',
          updatedAt: new Date(),
        },
        {
          id: 'split-b',
          organizationId: 'organization-1',
          runId: 'run-1',
          edgeId: 'split-b',
          state: 'SUCCEEDED',
          updatedAt: new Date(),
        },
      ],
      triggerContext: {},
      parameters: {},
      now: new Date(),
      nextId: () => 'new-id',
    });
    expect(plan.status).toBe('FAILED');
    expect(plan.eligiblePipelineNodes).toEqual([]);
    expect(plan.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'b', state: 'SKIPPED' }),
    );
  });
});

// Every tick consumes persisted attempts/edges; execution IDs emulate committed dispatch.
describe('pipeline outcome routes with independent parallel work', () => {
  const outcomeGraph: WorkflowGraph = {
    nodes: [
      { id: 'trigger', type: 'TRIGGER' },
      { id: 'split', type: 'PARALLEL_SPLIT' },
      ...['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        type: 'PIPELINE' as const,
        pipelineId: `pipeline-${id}`,
        versionNumber: 1,
      })),
      { id: 'join', type: 'JOIN' },
      { id: 'outcome', type: 'PIPELINE_OUTCOME' },
    ],
    edges: [
      ['trigger', 'split', 'out'],
      ['split', 'a', 'out'],
      ['split', 'b', 'out'],
      ['split', 'c', 'out'],
      ['a', 'join', 'out'],
      ['b', 'join', 'out'],
      ['join', 'd', 'out'],
      ['c', 'outcome', 'out'],
      ['outcome', 'e', 'error'],
    ].map(([sourceNodeId, targetNodeId, sourcePortId]) => ({
      id: `${sourceNodeId}-${targetNodeId}`,
      sourceNodeId: sourceNodeId!,
      targetNodeId: targetNodeId!,
      sourcePortId: sourcePortId!,
      targetPortId: 'in',
    })),
  };
  type Plan = ReturnType<typeof planWorkflowTransition>;
  type State = 'SUCCEEDED' | 'FAILED' | 'RUNNING';
  let next = 0;
  const tick = (
    previous?: Plan,
    states: Record<string, State> = {},
    selectedGraph = outcomeGraph,
  ) =>
    planWorkflowTransition({
      graph: selectedGraph,
      organizationId: 'org',
      runId: 'run',
      nodeAttempts: (previous?.nodeAttempts ?? []).map((attempt) => ({
        ...attempt,
        executionId: `execution-${attempt.nodeId}`,
        state: states[attempt.nodeId] ?? attempt.state,
      })),
      edgeStates: previous?.edgeStates ?? [],
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-24T00:00:00Z'),
      nextId: () => `outcome-${++next}`,
    });
  const eligible = (plan: Plan) => plan.eligiblePipelineNodes.map(({ nodeId }) => nodeId);

  it('runs D once after A/B succeed while C is running, then skips E on C success', () => {
    const initial = tick();
    expect(eligible(initial)).toEqual(['a', 'b', 'c']);
    const ready = tick(initial, { a: 'SUCCEEDED', b: 'SUCCEEDED' });
    expect(eligible(ready)).toEqual(['d']);
    const settled = tick(ready, { c: 'SUCCEEDED', d: 'SUCCEEDED' });
    expect(settled.status).toBe('SUCCEEDED');
    expect(eligible(settled)).toEqual([]);
    expect(settled.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'e', state: 'SKIPPED' }),
    );
    expect(settled.nodeAttempts.filter(({ nodeId }) => nodeId === 'd')).toHaveLength(1);
  });

  it('starts E after C fails while A/B run, later starts D, and retains failed C on recovery', () => {
    const recovery = tick(tick(), { c: 'FAILED' });
    expect(eligible(recovery)).toEqual(['e']);
    expect(recovery.status).toBe('RUNNING');
    expect(recovery.edgeStates).toContainEqual(
      expect.objectContaining({ edgeId: 'outcome-e', state: 'SUCCEEDED' }),
    );
    const joined = tick(recovery, { a: 'SUCCEEDED', b: 'SUCCEEDED', e: 'SUCCEEDED' });
    expect(eligible(joined)).toEqual(['d']);
    expect(joined.status).toBe('RUNNING');
    const settled = tick(joined, { d: 'SUCCEEDED' });
    expect(settled.status).toBe('SUCCEEDED');
    expect(settled.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'c', state: 'FAILED' }),
    );
    expect(eligible(tick(settled))).toEqual([]);
    expect(settled.nodeAttempts.filter(({ nodeId }) => nodeId === 'e')).toHaveLength(1);
  });

  it('does not start D or recover an unhandled A failure when C succeeds', () => {
    const settled = tick(tick(), { a: 'FAILED', b: 'SUCCEEDED', c: 'SUCCEEDED' });
    expect(eligible(settled)).toEqual([]);
    expect(settled.status).toBe('FAILED');
  });

  it('suppresses an independently eligible pipeline after an unhandled failure and settles its attempt', () => {
    const graphWithIndependentBranch: WorkflowGraph = {
      ...outcomeGraph,
      nodes: [
        ...outcomeGraph.nodes,
        { id: 'f', type: 'PIPELINE', pipelineId: 'pipeline-f', versionNumber: 1 },
      ],
      edges: [
        ...outcomeGraph.edges,
        {
          id: 'b-f',
          sourceNodeId: 'b',
          sourcePortId: 'out',
          targetNodeId: 'f',
          targetPortId: 'in',
        },
      ],
    };
    const initial = tick(undefined, {}, graphWithIndependentBranch);
    const afterUnhandledFailure = tick(
      initial,
      { a: 'FAILED', b: 'SUCCEEDED' },
      graphWithIndependentBranch,
    );

    expect(eligible(afterUnhandledFailure)).toEqual([]);
    expect(afterUnhandledFailure.status).toBe('RUNNING');
    expect(afterUnhandledFailure.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'f', state: 'SKIPPED' }),
    );
    expect(
      afterUnhandledFailure.nodeAttempts.find((attempt) => attempt.nodeId === 'f')?.executionId,
    ).toBeUndefined();
    expect(afterUnhandledFailure.nodeAttempts).not.toContainEqual(
      expect.objectContaining({ nodeId: 'f', state: 'RUNNING' }),
    );
    expect(afterUnhandledFailure.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'c', state: 'RUNNING', executionId: 'execution-c' }),
    );
  });

  it('keeps independent work eligible while an Outcome waits to resolve a recoverable failure', () => {
    const graphWithWaitingOutcome: WorkflowGraph = {
      ...outcomeGraph,
      nodes: [
        ...outcomeGraph.nodes,
        { id: 'f', type: 'PIPELINE', pipelineId: 'pipeline-f', versionNumber: 1 },
      ],
      edges: [
        ...outcomeGraph.edges,
        {
          id: 'b-outcome',
          sourceNodeId: 'b',
          sourcePortId: 'out',
          targetNodeId: 'outcome',
          targetPortId: 'in',
        },
        {
          id: 'a-f',
          sourceNodeId: 'a',
          sourcePortId: 'out',
          targetNodeId: 'f',
          targetPortId: 'in',
        },
      ],
    };
    const initial = tick(undefined, {}, graphWithWaitingOutcome);
    const waiting = tick(initial, { a: 'SUCCEEDED', c: 'FAILED' }, graphWithWaitingOutcome);

    expect(eligible(waiting)).toEqual(['f']);
    expect(waiting.status).toBe('RUNNING');
    expect(waiting.edgeStates.some(({ edgeId }) => edgeId === 'outcome-e')).toBe(false);
  });

  it('fails when E fails even if D succeeds', () => {
    const ready = tick(tick(), { a: 'SUCCEEDED', b: 'SUCCEEDED', c: 'FAILED' });
    expect(eligible(ready)).toEqual(['d', 'e']);
    expect(tick(ready, { d: 'SUCCEEDED', e: 'FAILED' }).status).toBe('FAILED');
  });

  it('does not recover a failure when only the Success port is connected', () => {
    const selectedGraph = {
      ...outcomeGraph,
      edges: outcomeGraph.edges.map((edge) =>
        edge.sourceNodeId === 'outcome' ? { ...edge, sourcePortId: 'success' } : edge,
      ),
    };
    const ready = tick(
      tick(undefined, {}, selectedGraph),
      { a: 'SUCCEEDED', b: 'SUCCEEDED', c: 'FAILED' },
      selectedGraph,
    );
    expect(eligible(ready)).toEqual([]);
    expect(ready.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'd', state: 'SKIPPED' }),
    );
    expect(ready.edgeStates).toContainEqual(
      expect.objectContaining({ edgeId: 'outcome-e', state: 'SKIPPED' }),
    );
    expect(tick(ready, { d: 'SUCCEEDED' }, selectedGraph).status).toBe('FAILED');
  });

  it('waits for every selected input even after one fails', () => {
    const selectedGraph = {
      ...outcomeGraph,
      edges: [
        ...outcomeGraph.edges,
        {
          id: 'b-outcome',
          sourceNodeId: 'b',
          sourcePortId: 'out',
          targetNodeId: 'outcome',
          targetPortId: 'in',
        },
      ],
    };
    const waiting = tick(tick(undefined, {}, selectedGraph), { c: 'FAILED' }, selectedGraph);
    expect(eligible(waiting)).toEqual([]);
    expect(waiting.edgeStates.some(({ edgeId }) => edgeId === 'outcome-e')).toBe(false);
    const ready = tick(waiting, { b: 'SUCCEEDED' }, selectedGraph);
    expect(eligible(ready)).toEqual(['e']);
  });

  it('does not route Error for a pipeline blocked by an upstream failure that never ran', () => {
    const selectedGraph = {
      ...outcomeGraph,
      edges: outcomeGraph.edges.map((edge) =>
        edge.id === 'c-outcome' ? { ...edge, sourceNodeId: 'd' } : edge,
      ),
    };
    const settled = tick(
      tick(undefined, {}, selectedGraph),
      {
        a: 'FAILED',
        b: 'SUCCEEDED',
        c: 'SUCCEEDED',
      },
      selectedGraph,
    );
    expect(eligible(settled)).toEqual([]);
    expect(settled.status).toBe('FAILED');
  });

  it('does not recover a cancelled pipeline execution through the Error route', () => {
    const initial = tick();
    const cancelled = planWorkflowTransition({
      graph: outcomeGraph,
      organizationId: 'org',
      runId: 'run',
      nodeAttempts: initial.nodeAttempts.map((attempt) =>
        attempt.nodeId === 'c'
          ? { ...attempt, state: 'FAILED' as const, failureKind: 'CANCELLED' as const }
          : { ...attempt, state: 'SUCCEEDED' as const },
      ),
      edgeStates: initial.edgeStates,
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-24T00:00:00Z'),
      nextId: () => `cancelled-${++next}`,
    });
    expect(cancelled.status).toBe('FAILED');
    expect(eligible(cancelled)).toEqual([]);
    expect(cancelled.edgeStates).not.toContainEqual(
      expect.objectContaining({ edgeId: 'outcome-e', state: 'SUCCEEDED' }),
    );
  });

  it('settles undispatched sibling attempts when cancellation prevents new work', () => {
    const initial = tick();
    const cancelled = planWorkflowTransition({
      graph: outcomeGraph,
      organizationId: 'org',
      runId: 'run',
      nodeAttempts: initial.nodeAttempts.map((attempt) =>
        attempt.nodeId === 'c'
          ? { ...attempt, state: 'FAILED' as const, failureKind: 'CANCELLED' as const }
          : attempt,
      ),
      edgeStates: initial.edgeStates,
      triggerContext: {},
      parameters: {},
      now: new Date('2026-09-24T00:00:00Z'),
      nextId: () => `cancelled-sibling-${++next}`,
    });
    expect(cancelled.status).toBe('FAILED');
    expect(eligible(cancelled)).toEqual([]);
    expect(cancelled.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'a', state: 'SKIPPED' }),
    );
    expect(cancelled.nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'b', state: 'SKIPPED' }),
    );
  });

  it('reopens a previously skipped Success job after an acknowledged upstream retry succeeds', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'trigger', type: 'TRIGGER' },
        { id: 'a', type: 'PIPELINE', pipelineId: 'pipeline-a', versionNumber: 1 },
        { id: 'outcome', type: 'PIPELINE_OUTCOME' },
        { id: 'success', type: 'PIPELINE', pipelineId: 'pipeline-success', versionNumber: 1 },
        { id: 'error', type: 'PIPELINE', pipelineId: 'pipeline-error', versionNumber: 1 },
      ],
      edges: [
        {
          id: 'start',
          sourceNodeId: 'trigger',
          sourcePortId: 'out',
          targetNodeId: 'a',
          targetPortId: 'in',
        },
        {
          id: 'inspect',
          sourceNodeId: 'a',
          sourcePortId: 'out',
          targetNodeId: 'outcome',
          targetPortId: 'in',
        },
        {
          id: 'success-route',
          sourceNodeId: 'outcome',
          sourcePortId: 'success',
          targetNodeId: 'success',
          targetPortId: 'in',
        },
        {
          id: 'error-route',
          sourceNodeId: 'outcome',
          sourcePortId: 'error',
          targetNodeId: 'error',
          targetPortId: 'in',
        },
      ],
    };
    const date = new Date('2026-09-24T00:00:00Z');
    const attempt = (
      nodeId: string,
      attemptNumber: number,
      state: 'FAILED' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED',
    ) => ({
      id: `${nodeId}-${attemptNumber}`,
      organizationId: 'org',
      runId: 'run',
      nodeId,
      attemptNumber,
      state,
      createdAt: date,
      updatedAt: date,
    });
    const edge = (edgeId: string, state: 'PENDING' | 'SUCCEEDED') => ({
      id: edgeId,
      organizationId: 'org',
      runId: 'run',
      edgeId,
      state,
      updatedAt: date,
    });
    const input = {
      graph,
      organizationId: 'org',
      runId: 'run',
      edgeStates: [
        edge('start', 'SUCCEEDED'),
        edge('inspect', 'PENDING'),
        edge('success-route', 'PENDING'),
        edge('error-route', 'PENDING'),
      ],
      triggerContext: {},
      parameters: {},
      now: date,
      nextId: () => 'next',
    };
    const history = [
      attempt('a', 1, 'FAILED'),
      attempt('a', 2, 'RUNNING'),
      attempt('success', 1, 'SKIPPED'),
      attempt('error', 1, 'SUCCEEDED'),
    ];
    const waiting = planWorkflowTransition({ ...input, nodeAttempts: history });
    expect(waiting.eligiblePipelineNodes.map(({ nodeId }) => nodeId)).toEqual(['a']);
    const succeeded = planWorkflowTransition({
      ...input,
      nodeAttempts: history.map((item) =>
        item.id === 'a-2' ? { ...item, state: 'SUCCEEDED' as const } : item,
      ),
    });
    expect(succeeded.eligiblePipelineNodes).toContainEqual(
      expect.objectContaining({
        nodeId: 'success',
        attemptNumber: 2,
      }),
    );
  });

  it('selects Error and skips Success when both ports are connected', () => {
    const selectedGraph: WorkflowGraph = {
      nodes: [
        ...outcomeGraph.nodes,
        { id: 'success-job', type: 'PIPELINE', pipelineId: 'success', versionNumber: 1 },
      ],
      edges: [
        ...outcomeGraph.edges,
        {
          id: 'outcome-success',
          sourceNodeId: 'outcome',
          sourcePortId: 'success',
          targetNodeId: 'success-job',
          targetPortId: 'in',
        },
      ],
    };
    const routed = tick(tick(undefined, {}, selectedGraph), { c: 'FAILED' }, selectedGraph);
    expect(eligible(routed)).toEqual(['e']);
    expect(routed.edgeStates).toContainEqual(
      expect.objectContaining({ edgeId: 'outcome-success', state: 'SKIPPED' }),
    );
  });
});
