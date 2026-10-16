import { AdvanceWorkflowRunService } from '@application/data-workflow/advance-workflow-run.service';
import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWorkflowPipelineExecutor,
  WorkflowPreparedPipelineRequest,
} from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type { WorkflowNodeAttemptIdentity } from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import type { IWorkflowRepository } from '@application/data-workflow/interfaces/i-workflow-repository';
import type {
  IWorkflowRunRepository,
  WorkflowRunSnapshot,
} from '@application/data-workflow/interfaces/i-workflow-run-repository';
import { RetryWorkflowNodeUseCase } from '@application/data-workflow/retry-workflow-node.use-case';
import { StartWorkflowRunUseCase } from '@application/data-workflow/start-workflow-run.use-case';
import { WorkflowRunErrorCode } from '@application/data-workflow/workflow-run.error';
import type {
  DataWorkflow,
  DataWorkflowVersion,
} from '@domain/data-workflow/models/workflow-persistence';

const now = new Date('2026-09-17T10:00:00.000Z');
const actor = { organizationId: 'organization-1', identityId: 'identity-1' };
const graph = {
  nodes: [
    { id: 'trigger', type: 'TRIGGER' as const },
    { id: 'load', type: 'PIPELINE' as const, pipelineId: 'pipeline-1', versionNumber: 1 },
  ],
  edges: [
    {
      id: 'trigger-load',
      sourceNodeId: 'trigger',
      sourcePortId: 'out',
      targetNodeId: 'load',
      targetPortId: 'in',
    },
  ],
};
const workflow: DataWorkflow = {
  id: 'workflow-1',
  organizationId: actor.organizationId,
  name: 'Load',
  draft: graph,
  revision: 2,
  publishedVersion: 1,
  paused: true,
  createdAt: now,
  updatedAt: now,
};
const version: DataWorkflowVersion = {
  id: 'version-1',
  organizationId: actor.organizationId,
  workflowId: workflow.id,
  versionNumber: 1,
  graph,
  trigger: { triggerNodeId: 'trigger' },
  publishedAt: now,
};

function snapshot(overrides: Partial<WorkflowRunSnapshot> = {}): WorkflowRunSnapshot {
  return {
    run: {
      id: 'run-1',
      organizationId: actor.organizationId,
      workflowId: workflow.id,
      versionId: version.id,
      actor: actor.identityId,
      parameters: {},
      triggerContext: {},
      status: 'RUNNING',
      revision: 4,
      leaseOwner: 'worker-1',
      leaseToken: 'lease-1',
      leaseExpiresAt: new Date(now.getTime() + 30_000),
      nextReconciliationAt: now,
      createdAt: now,
      updatedAt: now,
    },
    nodeAttempts: [],
    edgeStates: [],
    ...overrides,
  };
}

describe('workflow run recovery', () => {
  it('never advances or dispatches a cancelled workflow through an Error route', async () => {
    const initial = snapshot();
    const cancelled = snapshot({ run: { ...initial.run, status: 'CANCELLED' } });
    const saveTransition = jest.fn();
    const enqueuePrepared = jest.fn();
    const service = new AdvanceWorkflowRunService(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      {
        lockSnapshot: jest.fn(async () => cancelled),
        saveTransition,
      } as unknown as IWorkflowRunRepository,
      {
        prepare: jest.fn(),
        enqueuePrepared,
        read: jest.fn(),
        readResult: jest.fn(async () => ({ status: 'PENDING' as const })),
      },
      { now: () => now },
      { next: () => 'unused' },
    );
    await expect(service.tick({ runId: 'run-1', leaseToken: 'lease-1' })).rejects.toMatchObject({
      code: WorkflowRunErrorCode.LEASE_MISMATCH,
    });
    expect(saveTransition).not.toHaveBeenCalled();
    expect(enqueuePrepared).not.toHaveBeenCalled();
  });

  it('starts a paused published workflow, but rejects invalid JSON and an active-run race', async () => {
    const runs = {
      findActive: jest.fn(async () => undefined),
      createRun: jest.fn(async () => ({ id: 'run-created' })),
    } as unknown as IWorkflowRunRepository;
    const start = new StartWorkflowRunUseCase(
      {
        find: jest.fn(async () => workflow),
        findVersion: jest.fn(async () => version),
      } as unknown as IWorkflowRepository,
      runs,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { now: () => now },
      { next: () => 'run-created' },
    );
    await expect(
      start.execute({ actor, workflowId: workflow.id, parameters: { batch: { size: 10 } } }),
    ).resolves.toEqual({ runId: 'run-created', status: 'QUEUED' });
    expect((runs.createRun as jest.Mock).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        actor: actor.identityId,
        versionId: version.id,
        parameters: { batch: { size: 10 } },
      }),
    );
    await expect(
      start.execute({ actor, workflowId: workflow.id, parameters: ['invalid'] }),
    ).rejects.toMatchObject({
      code: WorkflowRunErrorCode.INVALID_PARAMETERS,
    });
    const conflict = new StartWorkflowRunUseCase(
      {
        find: jest.fn(async () => workflow),
        findVersion: jest.fn(async () => version),
      } as unknown as IWorkflowRepository,
      {
        findActive: jest.fn(async () => undefined),
        createRun: jest.fn(async () => false),
      } as unknown as IWorkflowRunRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { now: () => now },
      { next: () => 'run-created' },
    );
    await expect(
      conflict.execute({ actor, workflowId: workflow.id, parameters: {} }),
    ).rejects.toMatchObject({
      code: WorkflowRunErrorCode.ACTIVE_RUN_CONFLICT,
    });
  });

  it('fences stale workers and persists the attempt before Task 4 dispatch', async () => {
    const locked = snapshot();
    const runs = {
      lockSnapshot: jest.fn(async () => locked),
      saveTransition: jest.fn(async () => true),
    } as unknown as IWorkflowRunRepository;
    const enqueuePrepared = jest.fn(
      async (_attempt: WorkflowNodeAttemptIdentity, _request: WorkflowPreparedPipelineRequest) => ({
        executionId: 'execution-1',
        status: 'QUEUED' as const,
      }),
    );
    const executor: IWorkflowPipelineExecutor = {
      prepare: async (_actor, _pipeline) => ({ workload: {} as never }),
      enqueuePrepared,
      read: async (_executionId) => 'PENDING',
      readResult: async (_executionId) => ({ status: 'PENDING' }),
    };
    const service = new AdvanceWorkflowRunService(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      runs,
      executor,
      { now: () => now },
      { next: jest.fn(() => 'attempt-1') },
    );
    await expect(service.tick({ runId: locked.run.id, leaseToken: 'stale' })).rejects.toMatchObject(
      { code: WorkflowRunErrorCode.LEASE_MISMATCH },
    );
    await service.tick({ runId: locked.run.id, leaseToken: 'lease-1' });
    expect((runs.saveTransition as jest.Mock).mock.calls[0]?.[3]).toEqual({
      owner: 'worker-1',
      token: 'lease-1',
    });
    expect((runs.saveTransition as jest.Mock).mock.calls[0]?.[2].nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'load', state: 'RUNNING' }),
    );
    expect(enqueuePrepared).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'load', attemptNumber: 1 }),
      expect.anything(),
    );
  });

  it('fails an undispatched attempt when pipeline preparation fails', async () => {
    const initial = snapshot();
    const persistedAttempt = {
      id: 'attempt-1',
      organizationId: actor.organizationId,
      runId: initial.run.id,
      nodeId: 'load',
      attemptNumber: 1,
      state: 'RUNNING' as const,
      createdAt: now,
      updatedAt: now,
    };
    const afterInitialTransition = snapshot({
      run: { ...initial.run, revision: initial.run.revision + 1 },
      nodeAttempts: [persistedAttempt],
    });
    const saveTransition = jest.fn(async () => true);
    const runs = {
      lockSnapshot: jest
        .fn()
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(afterInitialTransition),
      saveTransition,
    } as unknown as IWorkflowRunRepository;
    const prepare = jest.fn(async () => {
      throw new Error('TARGET_SCHEMA_UNAVAILABLE password=do-not-store');
    });
    const enqueuePrepared = jest.fn();
    const service = new AdvanceWorkflowRunService(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      runs,
      {
        prepare,
        enqueuePrepared,
        read: jest.fn(),
        readResult: jest.fn(async () => ({ status: 'PENDING' as const })),
      },
      { now: () => now },
      { next: jest.fn(() => 'attempt-1') },
    );

    await expect(service.tick({ runId: initial.run.id, leaseToken: 'lease-1' })).resolves.toBe(
      undefined,
    );

    expect(enqueuePrepared).not.toHaveBeenCalled();
    expect(saveTransition).toHaveBeenCalledTimes(2);
    expect((saveTransition as jest.Mock).mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        nodeAttempts: [
          expect.objectContaining({
            id: 'attempt-1',
            state: 'FAILED',
            error: 'TARGET_SCHEMA_UNAVAILABLE password=[REDACTED]',
          }),
        ],
      }),
    );
  });

  it('requires acknowledgement and only retries a settled failed attempt', async () => {
    const failed = snapshot({
      nodeAttempts: [
        {
          id: 'attempt-1',
          organizationId: actor.organizationId,
          runId: 'run-1',
          nodeId: 'load',
          attemptNumber: 1,
          state: 'FAILED',
          executionId: 'execution-1',
          createdAt: now,
          updatedAt: now,
        },
      ],
      edgeStates: [
        {
          id: 'edge-state-1',
          organizationId: actor.organizationId,
          runId: 'run-1',
          edgeId: 'trigger-load',
          state: 'FAILED',
          updatedAt: now,
        },
      ],
    });
    const runs = {
      lockSnapshot: jest.fn(async () => failed),
      saveTransition: jest.fn(async () => true),
    } as unknown as IWorkflowRunRepository;
    const retry = new RetryWorkflowNodeUseCase(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      runs,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { read: jest.fn(async () => 'FAILED') } as unknown as IWorkflowPipelineExecutor,
      { now: () => now },
      { next: () => 'attempt-2' },
    );
    await expect(
      retry.execute({
        actor,
        runId: 'run-1',
        nodeId: 'load',
        expectedRevision: 4,
        acknowledgeWriteRisk: false,
      }),
    ).rejects.toMatchObject({ code: WorkflowRunErrorCode.RETRY_ACKNOWLEDGEMENT_REQUIRED });
    await retry.execute({
      actor,
      runId: 'run-1',
      nodeId: 'load',
      expectedRevision: 4,
      acknowledgeWriteRisk: true,
    });
    expect((runs.saveTransition as jest.Mock).mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ status: 'QUEUED' }),
    );
    expect((runs.saveTransition as jest.Mock).mock.calls[0]?.[2].nodeAttempts).toContainEqual(
      expect.objectContaining({ nodeId: 'load', attemptNumber: 2, state: 'RUNNING' }),
    );
    expect((runs.saveTransition as jest.Mock).mock.calls[0]?.[2].retryAcknowledgements).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        nodeId: 'load',
        attemptNumber: 2,
        approvedBy: actor.identityId,
        acknowledgementSignal: true,
        purpose: 'DUPLICATE_APPEND_WRITE_RISK',
      }),
    ]);
    expect(failed.run.actor).toBe('identity-1');

    const writing = new RetryWorkflowNodeUseCase(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      { lockSnapshot: jest.fn(async () => failed) } as unknown as IWorkflowRunRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { read: jest.fn(async () => 'RUNNING') } as unknown as IWorkflowPipelineExecutor,
      { now: () => now },
      { next: () => 'attempt-3' },
    );
    await expect(
      writing.execute({
        actor,
        runId: 'run-1',
        nodeId: 'load',
        expectedRevision: 4,
        acknowledgeWriteRisk: true,
      }),
    ).rejects.toMatchObject({ code: WorkflowRunErrorCode.RETRY_NOT_ALLOWED });

    const inconsistentHistory = snapshot({
      nodeAttempts: [
        {
          id: 'attempt-0',
          organizationId: actor.organizationId,
          runId: 'run-1',
          nodeId: 'load',
          attemptNumber: 0,
          state: 'RUNNING',
          executionId: 'execution-0',
          createdAt: now,
          updatedAt: now,
        },
        ...failed.nodeAttempts,
      ],
    });
    const unsafeHistory = new RetryWorkflowNodeUseCase(
      { findVersionById: jest.fn(async () => version) } as unknown as IWorkflowRepository,
      {
        lockSnapshot: jest.fn(async () => inconsistentHistory),
      } as unknown as IWorkflowRunRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { read: jest.fn(async () => 'RUNNING') } as unknown as IWorkflowPipelineExecutor,
      { now: () => now },
      { next: () => 'attempt-3' },
    );
    await expect(
      unsafeHistory.execute({
        actor,
        runId: 'run-1',
        nodeId: 'load',
        expectedRevision: 4,
        acknowledgeWriteRisk: true,
      }),
    ).rejects.toMatchObject({ code: WorkflowRunErrorCode.RETRY_NOT_ALLOWED });
  });

  it('rejects an upstream retry after an Outcome Error job has already run', async () => {
    const routedVersion: DataWorkflowVersion = {
      ...version,
      graph: {
        nodes: [
          ...graph.nodes,
          { id: 'outcome', type: 'PIPELINE_OUTCOME' },
          { id: 'recover', type: 'PIPELINE', pipelineId: 'pipeline-2', versionNumber: 1 },
        ],
        edges: [
          ...graph.edges,
          {
            id: 'load-outcome',
            sourceNodeId: 'load',
            sourcePortId: 'out',
            targetNodeId: 'outcome',
            targetPortId: 'in',
          },
          {
            id: 'error-route',
            sourceNodeId: 'outcome',
            sourcePortId: 'error',
            targetNodeId: 'recover',
            targetPortId: 'in',
          },
        ],
      },
    };
    const failed = snapshot({
      nodeAttempts: [
        {
          id: 'load-1',
          organizationId: actor.organizationId,
          runId: 'run-1',
          nodeId: 'load',
          attemptNumber: 1,
          state: 'FAILED',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'recover-1',
          organizationId: actor.organizationId,
          runId: 'run-1',
          nodeId: 'recover',
          attemptNumber: 1,
          state: 'FAILED',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const retry = new RetryWorkflowNodeUseCase(
      { findVersionById: jest.fn(async () => routedVersion) } as unknown as IWorkflowRepository,
      {
        lockSnapshot: jest.fn(async () => failed),
        saveTransition: jest.fn(),
      } as unknown as IWorkflowRunRepository,
      { require: jest.fn() } as unknown as IWorkflowAccess,
      { read: jest.fn() } as unknown as IWorkflowPipelineExecutor,
      { now: () => now },
      { next: () => 'attempt-2' },
    );
    await expect(
      retry.execute({
        actor,
        runId: 'run-1',
        nodeId: 'load',
        expectedRevision: failed.run.revision,
        acknowledgeWriteRisk: true,
      }),
    ).rejects.toMatchObject({ code: WorkflowRunErrorCode.RETRY_NOT_ALLOWED });
  });
});
