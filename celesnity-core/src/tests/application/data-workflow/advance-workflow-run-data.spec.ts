import { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import type { IWorkflowPipelineExecutor } from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type { IWorkflowRunRepository } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { DataWorkflowVersion } from '@domain/data-workflow/models/workflow-persistence';
import type { WorkflowRunSnapshot } from '@application/data-workflow/interfaces/i-workflow-run-repository';
import type { WorkflowGraph } from '@domain/data-workflow/models/workflow-graph';

const now = new Date('2026-09-24T07:00:00.000Z');
const actor = { organizationId: 'organization-1', identityId: 'identity-1' };

const graph: WorkflowGraph = {
  nodes: [
    { id: 'trigger', type: 'TRIGGER' },
    { id: 'load', type: 'PIPELINE', pipelineId: 'pipeline-load', versionNumber: 3 },
    {
      id: 'route',
      type: 'CONDITIONAL_SPLIT',
      conditionKind: 'RUN_DATA',
      mode: 'FIRST_MATCH',
      branches: [
        {
          id: 'large-order',
          runDataCondition: {
            targetNodeId: 'target-orders',
            quantifier: 'ANY',
            predicate: { column: 'amount', operator: 'GTE', value: 100 },
          },
        },
        { id: 'other', fallback: true },
      ],
    },
    { id: 'selected', type: 'PIPELINE', pipelineId: 'pipeline-selected', versionNumber: 2 },
    { id: 'fallback', type: 'PIPELINE', pipelineId: 'pipeline-fallback', versionNumber: 1 },
  ],
  edges: [
    {
      id: 'start',
      sourceNodeId: 'trigger',
      sourcePortId: 'out',
      targetNodeId: 'load',
      targetPortId: 'in',
    },
    {
      id: 'load-route',
      sourceNodeId: 'load',
      sourcePortId: 'out',
      targetNodeId: 'route',
      targetPortId: 'in',
    },
    {
      id: 'route-selected',
      sourceNodeId: 'route',
      sourcePortId: 'large-order',
      targetNodeId: 'selected',
      targetPortId: 'in',
    },
    {
      id: 'route-fallback',
      sourceNodeId: 'route',
      sourcePortId: 'other',
      targetNodeId: 'fallback',
      targetPortId: 'in',
    },
  ],
};

const version: DataWorkflowVersion = {
  id: 'version-1',
  organizationId: actor.organizationId,
  workflowId: 'workflow-1',
  versionNumber: 1,
  graph,
  trigger: { triggerNodeId: 'trigger' },
  publishedAt: now,
};

describe('AdvanceWorkflowRunService run-data facts', () => {
  it('requests facts for the exact pipeline execution and routes only its matching branch', async () => {
    const firstSnapshot = createSnapshot();
    const secondSnapshot = createSnapshot({
      run: { ...firstSnapshot.run, revision: firstSnapshot.run.revision + 1 },
      nodeAttempts: [
        {
          id: 'attempt-load',
          organizationId: actor.organizationId,
          runId: firstSnapshot.run.id,
          nodeId: 'load',
          attemptNumber: 1,
          state: 'RUNNING',
          executionId: 'execution-load',
          createdAt: now,
          updatedAt: now,
        },
      ],
      edgeStates: [
        {
          id: 'start-state',
          organizationId: actor.organizationId,
          runId: firstSnapshot.run.id,
          edgeId: 'start',
          state: 'SUCCEEDED',
          updatedAt: now,
        },
      ],
    });
    const runs = {
      lockSnapshot: jest
        .fn()
        .mockResolvedValueOnce(firstSnapshot)
        .mockResolvedValueOnce(secondSnapshot),
      saveTransition: jest.fn(async () => true),
    } as unknown as IWorkflowRunRepository;
    const prepare = jest.fn(async () => ({ workload: {} as never }));
    const enqueuePrepared = jest.fn(async () => ({
      executionId: 'execution-queued',
      status: 'QUEUED' as const,
    }));
    const executor: IWorkflowPipelineExecutor = {
      prepare,
      enqueuePrepared,
      read: async () => 'SUCCEEDED',
      readResult: async () => ({
        status: 'SUCCEEDED',
        outputFacts: {
          executionId: 'execution-load',
          targets: [
            {
              targetNodeId: 'target-orders',
              totalRows: 3,
              matchesByBranchId: { 'large-order': 1 },
            },
          ],
        },
      }),
    };
    const service = new AdvanceWorkflowRunService(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      runs,
      executor,
      { now: () => now },
      { next: jest.fn(() => 'attempt-next') },
    );

    await service.tick({ runId: firstSnapshot.run.id, leaseToken: 'lease-1' });

    expect(prepare).toHaveBeenNthCalledWith(
      1,
      actor,
      { pipelineId: 'pipeline-load', versionNumber: 3 },
      {
        targets: [
          {
            targetNodeId: 'target-orders',
            predicates: [
              {
                branchId: 'large-order',
                column: 'amount',
                operator: 'GTE',
                value: 100,
              },
            ],
          },
        ],
      },
    );

    await service.tick({ runId: secondSnapshot.run.id, leaseToken: 'lease-1' });

    expect(prepare).toHaveBeenNthCalledWith(
      2,
      actor,
      { pipelineId: 'pipeline-selected', versionNumber: 2 },
      undefined,
    );
    expect(enqueuePrepared).toHaveBeenCalledTimes(2);
    expect(runs.saveTransition).toHaveBeenLastCalledWith(
      secondSnapshot.run,
      secondSnapshot.run.revision,
      expect.objectContaining({
        nodeAttempts: expect.arrayContaining([
          expect.objectContaining({ nodeId: 'selected', state: 'RUNNING' }),
          expect.objectContaining({ nodeId: 'fallback', state: 'SKIPPED' }),
        ]),
        edgeStates: expect.arrayContaining([
          expect.objectContaining({ edgeId: 'route-selected', state: 'SUCCEEDED' }),
          expect.objectContaining({ edgeId: 'route-fallback', state: 'SKIPPED' }),
        ]),
      }),
      { owner: 'worker-1', token: 'lease-1' },
    );
  });
});

function createSnapshot(overrides: Partial<WorkflowRunSnapshot> = {}): WorkflowRunSnapshot {
  return {
    run: {
      id: 'run-1',
      organizationId: actor.organizationId,
      workflowId: version.workflowId,
      versionId: version.id,
      actor: actor.identityId,
      parameters: {},
      triggerContext: {},
      status: 'RUNNING',
      revision: 1,
      leaseOwner: 'worker-1',
      leaseToken: 'lease-1',
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      nextReconciliationAt: now,
      createdAt: now,
      updatedAt: now,
    },
    nodeAttempts: [],
    edgeStates: [],
    ...overrides,
  };
}
