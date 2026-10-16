import type { IWorkflowAccess } from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWorkflowNodeAttemptExecutionRepository,
  WorkflowNodeAttemptIdentity,
} from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import { WorkflowPipelineExecutorAdapter } from '@infrastructure/data-workflow/workflow-pipeline-executor.adapter';
import type {
  ExecutableWorkload,
  IExecutableWorkloadProvider,
} from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { IExecutionReader } from '@application/execution-orchestration/interfaces/i-execution-reader';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import { PreparedExecutionRequestService } from '@application/execution-orchestration/prepared-execution-request.service';
import type { IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import type { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type { OutboxMessage } from '@application/shared/outbox-message';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';

const actor = {
  organizationId: '22222222-2222-4222-8222-222222222222',
  identityId: 'identity-1',
};
const pipeline = {
  pipelineId: '33333333-3333-4333-8333-333333333333',
  versionNumber: 7,
};
const nodeAttempt: WorkflowNodeAttemptIdentity = {
  organizationId: actor.organizationId,
  runId: '88888888-8888-4888-8888-888888888888',
  nodeId: 'load-orders',
  attemptNumber: 1,
  leaseOwner: 'worker-1',
  leaseToken: '77777777-7777-4777-8777-777777777777',
};
const workload = {
  workload: {
    kind: 'PIPELINE' as const,
    pipelineId: pipeline.pipelineId,
    pipelineVersionId: '44444444-4444-4444-8444-444444444444',
    versionNumber: pipeline.versionNumber,
  },
  connectionId: '55555555-5555-4555-8555-555555555555',
  source: new Uint8Array([1, 2, 3]),
};

class ExecutionRepositoryDouble implements IExecutionRepository {
  public readonly created: Execution[] = [];

  public async create(execution: Execution): Promise<void> {
    this.created.push(execution);
  }

  public update(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public findById(): Promise<Execution | undefined> {
    return Promise.resolve(undefined);
  }
}

class UnitOfWorkDouble implements IUnitOfWork {
  public readonly messages: OutboxMessage[] = [];
  public commits = 0;

  public async commit<T>(work: (events: RecordedEvents) => Promise<T>): Promise<T> {
    this.commits += 1;
    return work({ record: (...messages): void => void this.messages.push(...messages) });
  }
}

class NodeAttemptExecutionsDouble implements IWorkflowNodeAttemptExecutionRepository {
  public readonly associated: Array<{
    identity: WorkflowNodeAttemptIdentity;
    executionId: string;
  }> = [];

  public constructor(private readonly executionId?: string) {}

  public lock(
    _identity: WorkflowNodeAttemptIdentity,
  ): Promise<{ readonly executionId?: string } | undefined> {
    return Promise.resolve(this.executionId === undefined ? {} : { executionId: this.executionId });
  }

  public associate(identity: WorkflowNodeAttemptIdentity, executionId: string): Promise<boolean> {
    this.associated.push({ identity, executionId });
    return Promise.resolve(true);
  }
}

describe('workflow pipeline dispatch', () => {
  it('prepares connection-checked execution requests and enqueues execution plus outbox atomically', async () => {
    const repository = new ExecutionRepositoryDouble();
    const unitOfWork = new UnitOfWorkDouble();
    const connections: jest.Mocked<IConnectionReferenceProvider> = {
      requireActive: jest.fn(),
    };
    const ids = {
      next: jest
        .fn()
        .mockReturnValueOnce('66666666-6666-4666-8666-666666666666')
        .mockReturnValueOnce('77777777-7777-4777-8777-777777777777'),
    };
    const service = new PreparedExecutionRequestService(
      repository,
      connections,
      unitOfWork,
      { now: () => new Date('2026-09-17T08:00:00.000Z') },
      ids,
      'artifacts',
      {
        driverMemory: '1g',
        executorMemory: '2g',
        executorCores: 1,
        maxCores: 2,
      },
    );

    const prepared = await service.prepare(workload);
    const queued = await service.enqueue(prepared);

    expect(connections.requireActive).toHaveBeenCalledWith(workload.connectionId);
    expect(queued).toEqual({
      executionId: '66666666-6666-4666-8666-666666666666',
      status: 'QUEUED',
    });
    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]?.workload).toEqual(workload.workload);
    expect(repository.created[0]?.connectionId).toBe(workload.connectionId);
    expect(unitOfWork.commits).toBe(1);
    expect(unitOfWork.messages).toHaveLength(1);
  });

  it('authorizes the pinned workflow pipeline before resolving a prepared request', async () => {
    const access: jest.Mocked<IWorkflowAccess> = {
      require: jest.fn(),
      requirePipeline: jest.fn(async (_actor, _pipeline) => {
        calls.push('authorize');
      }),
    };
    const calls: string[] = [];
    const workloads: jest.Mocked<Pick<IExecutableWorkloadProvider, 'resolvePipeline'>> = {
      resolvePipeline: jest.fn(async (_pipelineId, _versionNumber): Promise<ExecutableWorkload> => {
        calls.push('resolve');
        return workload;
      }),
    };
    const requests = {
      prepare: jest.fn(async () => {
        calls.push('prepare');
        return { workload: workload.workload, connectionId: workload.connectionId };
      }),
      enqueue: jest.fn(),
    };
    const reader = { findById: jest.fn() };
    const adapter = new WorkflowPipelineExecutorAdapter(
      access,
      workloads as unknown as IExecutableWorkloadProvider,
      requests as never,
      reader as never,
      {} as IWorkflowNodeAttemptExecutionRepository,
      new UnitOfWorkDouble(),
    );

    await expect(adapter.prepare(actor, pipeline)).resolves.toEqual({
      workload: workload.workload,
      connectionId: workload.connectionId,
    });
    expect(access.requirePipeline).toHaveBeenCalledWith(actor, pipeline);
    expect(workloads.resolvePipeline).toHaveBeenCalledWith(
      pipeline.pipelineId,
      pipeline.versionNumber,
      { includeOutputFacts: false },
    );
    expect(requests.prepare).toHaveBeenCalledWith(workload, actor.identityId, undefined);
    expect(calls).toEqual(['authorize', 'resolve', 'prepare']);
  });

  it('reuses an execution already associated with the durable node attempt', async () => {
    const attempts = new NodeAttemptExecutionsDouble('99999999-9999-4999-8999-999999999999');
    const requests = { enqueueInTransaction: jest.fn() };
    const adapter = new WorkflowPipelineExecutorAdapter(
      {} as IWorkflowAccess,
      {} as IExecutableWorkloadProvider,
      requests as never,
      {} as IExecutionReader,
      attempts,
      new UnitOfWorkDouble(),
    );

    await expect(
      adapter.enqueuePrepared(nodeAttempt, { workload: workload.workload }),
    ).resolves.toEqual({
      executionId: '99999999-9999-4999-8999-999999999999',
      status: 'QUEUED',
    });

    expect(requests.enqueueInTransaction).not.toHaveBeenCalled();
    expect(attempts.associated).toEqual([]);
  });

  it('persists an execution association in the same unit of work as its outbox request', async () => {
    const attempts = new NodeAttemptExecutionsDouble();
    const unitOfWork = new UnitOfWorkDouble();
    const requests = {
      enqueueInTransaction: jest.fn(async () => ({
        executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'QUEUED' as const,
      })),
    };
    const adapter = new WorkflowPipelineExecutorAdapter(
      {} as IWorkflowAccess,
      {} as IExecutableWorkloadProvider,
      requests as never,
      {} as IExecutionReader,
      attempts,
      unitOfWork,
    );

    await expect(
      adapter.enqueuePrepared(nodeAttempt, { workload: workload.workload }),
    ).resolves.toEqual({
      executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'QUEUED',
    });

    expect(unitOfWork.commits).toBe(1);
    expect(requests.enqueueInTransaction).toHaveBeenCalledTimes(1);
    expect(attempts.associated).toEqual([
      { identity: nodeAttempt, executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ]);
  });

  it('fails the transaction when the locked attempt cannot be associated', async () => {
    const attempts: IWorkflowNodeAttemptExecutionRepository = {
      lock: jest.fn(async () => ({})),
      associate: jest.fn(async () => false),
    };
    const requests = {
      enqueueInTransaction: jest.fn(async () => ({
        executionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'QUEUED' as const,
      })),
    };
    const adapter = new WorkflowPipelineExecutorAdapter(
      {} as IWorkflowAccess,
      {} as IExecutableWorkloadProvider,
      requests as never,
      {} as IExecutionReader,
      attempts,
      new UnitOfWorkDouble(),
    );

    await expect(
      adapter.enqueuePrepared(nodeAttempt, { workload: workload.workload }),
    ).rejects.toThrow('Data workflow node attempt execution association was lost.');
  });

  it('does not submit an execution when the run lease was revoked before atomic dispatch', async () => {
    const requests = {
      enqueueInTransaction: jest.fn(),
    };
    const attempts: IWorkflowNodeAttemptExecutionRepository = {
      lock: jest.fn(async (identity) => (identity.leaseToken === 'revoked-token' ? undefined : {})),
      associate: jest.fn(),
    };
    const adapter = new WorkflowPipelineExecutorAdapter(
      {} as IWorkflowAccess,
      {} as IExecutableWorkloadProvider,
      requests as never,
      {} as IExecutionReader,
      attempts,
      new UnitOfWorkDouble(),
    );

    await expect(
      adapter.enqueuePrepared(
        { ...nodeAttempt, leaseToken: 'revoked-token' },
        { workload: workload.workload },
      ),
    ).rejects.toThrow('Data workflow node attempt was not found.');
    expect(requests.enqueueInTransaction).not.toHaveBeenCalled();
    expect(attempts.associate).not.toHaveBeenCalled();
  });

  it.each([
    [ExecutionStatusValue.QUEUED, 'PENDING'],
    [ExecutionStatusValue.PREPARING, 'PENDING'],
    [ExecutionStatusValue.SUBMITTED, 'PENDING'],
    [ExecutionStatusValue.RUNNING, 'RUNNING'],
    [ExecutionStatusValue.CANCELLING, 'RUNNING'],
    [ExecutionStatusValue.SUCCEEDED, 'SUCCEEDED'],
    [ExecutionStatusValue.FAILED, 'FAILED'],
    [ExecutionStatusValue.TIMED_OUT, 'FAILED'],
    [ExecutionStatusValue.CANCELLED, 'CANCELLED'],
  ] as const)(
    'maps execution status %s to workflow status %s',
    async (executionStatus, workflowStatus) => {
      const adapter = new WorkflowPipelineExecutorAdapter(
        { require: jest.fn(), requirePipeline: jest.fn() },
        {} as IExecutableWorkloadProvider,
        {} as PreparedExecutionRequestService,
        {
          findById: jest.fn(async () => ({ id: 'execution-1', status: executionStatus })),
        } as unknown as IExecutionReader,
        {} as IWorkflowNodeAttemptExecutionRepository,
        new UnitOfWorkDouble(),
      );

      await expect(adapter.read('execution-1')).resolves.toBe(workflowStatus);
    },
  );
});
