import { backgroundContexts } from '../administration/background-principal.fixture';
import { ExecutionWorkerService } from '@application/execution-orchestration/execution-worker.service';
import type { ExecutionWorkerLogger } from '@application/execution-orchestration/execution-worker.logger';
import type {
  QueuedExecutionCandidate,
  IExecutionDispatcher,
} from '@application/execution-orchestration/interfaces/i-execution-dispatcher';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import type { ISparkExecutionGateway } from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import type { SparkSubmissionSupervisor } from '@application/execution-orchestration/spark-submission.supervisor';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import { ExecutionEventName } from '@domain/execution-orchestration/events/execution.events';
import {
  ExecutionId,
  ExecutionStatusValue,
  LogLocation,
  ResourceProfile,
  isTerminalStatus,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { FixedClock, SequentialIdGenerator } from '@tests/support/deterministic-ports';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';
import type { AuthenticatedContextStore } from '@application/administration/authenticated-context';

/**
 * Queue claiming, which changed shape in this refactor.
 *
 * It used to be a raw `UPDATE ... SET status = 'PREPARING'` inside the dispatcher,
 * with its own hand-written outbox insert. `Execution.startPreparing()` existed but
 * was never called, and the transition table was never consulted. Claiming now goes
 * through the aggregate, and exclusivity comes from the same status-guarded update
 * every other transition already used.
 *
 * That makes the guard's return value load-bearing, so these tests focus on it:
 * winning a claim, losing one, and never mistaking a lost race for an error.
 * Most tests cover claim and reap. The capacity case exercises the preparation
 * boundary with port doubles so a saturated Spark cluster cannot regress into a
 * long-running submission timeout.
 */

const QUEUED_AT = new Date('2026-08-04T09:00:00.000Z');
const ARTIFACTS_BUCKET = 'celesnity-artifacts';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

function candidate(id: string): QueuedExecutionCandidate {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    workload: {
      kind: 'SCRIPT',
      scriptId: '33333333-3333-4333-8333-333333333333',
      scriptVersionId: '44444444-4444-4444-8444-444444444444',
      versionNumber: 1,
    },
    connectionId: '55555555-5555-4555-8555-555555555555',
  };
}

function executionId(suffix: number): string {
  return `22222222-2222-4222-8222-${suffix.toString().padStart(12, '0')}`;
}

function at(id: string, status: ExecutionStatusValue): Execution {
  return Execution.rehydrate({
    id: ExecutionId.from(id),
    scriptId: '33333333-3333-4333-8333-333333333333',
    scriptVersionId: '44444444-4444-4444-8444-444444444444',
    connectionId: '55555555-5555-4555-8555-555555555555',
    status,
    resourceProfile: ResourceProfile.create({
      driverMemory: '1g',
      executorMemory: '1g',
      executorCores: 1,
      maxCores: 2,
    }),
    logLocation: LogLocation.forExecution(ARTIFACTS_BUCKET, ExecutionId.from(id)),
    queuedAt: QUEUED_AT,
    finishedAt: isTerminalStatus(status) ? QUEUED_AT : undefined,
    updatedAt: QUEUED_AT,
  });
}

class FakeDispatcher implements IExecutionDispatcher {
  public candidates: QueuedExecutionCandidate[] = [];
  public abandoned: { readonly id: string; readonly organizationId: string }[] = [];
  public queuedLimits: number[] = [];
  public excludedSeen: readonly string[] = [];

  public listQueuedCandidates(limit: number): Promise<readonly QueuedExecutionCandidate[]> {
    this.queuedLimits.push(limit);
    return Promise.resolve(this.candidates);
  }

  public listAbandonedCancellations(
    _limit: number,
    excludeIds: readonly string[],
  ): Promise<readonly { readonly id: string; readonly organizationId: string }[]> {
    this.excludedSeen = excludeIds;
    return Promise.resolve(this.abandoned);
  }
}

class FakeRepository implements IExecutionRepository {
  public readonly stored = new Map<string, Execution>();
  public readonly organizationsSeen: (string | undefined)[] = [];
  /** Ids whose guarded update should report a lost race. */
  public loseGuardFor = new Set<string>();
  public readonly updates: { readonly id: string; readonly expected: ExecutionStatusValue }[] = [];

  public constructor(private readonly contexts?: AuthenticatedContextStore) {}

  public create(): Promise<void> {
    return Promise.resolve();
  }

  public update(execution: Execution, expectedStatus: ExecutionStatusValue): Promise<boolean> {
    this.organizationsSeen.push(this.contexts?.current()?.organizationId);
    this.updates.push({ id: execution.id.value, expected: expectedStatus });
    return Promise.resolve(!this.loseGuardFor.has(execution.id.value));
  }

  public findById(id: ExecutionId): Promise<Execution | undefined> {
    return Promise.resolve(this.stored.get(id.value));
  }
}

const SILENT_LOGGER: ExecutionWorkerLogger = {
  warn: () => undefined,
  error: () => undefined,
};

interface Harness {
  readonly service: ExecutionWorkerService;
  readonly dispatcher: FakeDispatcher;
  readonly repository: FakeRepository;
  readonly unitOfWork: FakeUnitOfWork;
}

function harness(): Harness {
  const dispatcher = new FakeDispatcher();
  const contexts = backgroundContexts();
  const repository = new FakeRepository(contexts);
  const unitOfWork = new FakeUnitOfWork();
  const service = new ExecutionWorkerService(
    repository,
    dispatcher,
    // The gateway and supervisor are never reached by claim or reap.
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    unitOfWork,
    new FixedClock('2026-08-04T10:00:00.000Z'),
    new SequentialIdGenerator(),
    contexts,
    { maxAttempts: 3, artifactsBucket: ARTIFACTS_BUCKET },
    SILENT_LOGGER,
  );
  return { service, dispatcher, repository, unitOfWork };
}

describe('ExecutionWorkerService.claim', () => {
  it('returns nothing when the queue is empty', async () => {
    const { service } = harness();

    await expect(service.claim(5)).resolves.toEqual([]);
  });

  it('asks the dispatcher for exactly the requested number of candidates', async () => {
    const { service, dispatcher } = harness();

    await service.claim(7);

    expect(dispatcher.queuedLimits).toEqual([7]);
  });

  it('claims a queued execution by transitioning it to PREPARING', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));

    const claimed = await service.claim(1);

    expect(claimed.map((entry) => entry.id)).toEqual([id]);
    expect(repository.stored.get(id)?.status).toBe(ExecutionStatusValue.PREPARING);
    expect(repository.organizationsSeen).toEqual([ORGANIZATION_ID]);
  });

  it('guards the claim on the QUEUED status, which is what makes it exclusive', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));

    await service.claim(1);

    expect(repository.updates).toEqual([{ id, expected: ExecutionStatusValue.QUEUED }]);
  });

  it('stages an ExecutionPreparing message through the aggregate, not by hand', async () => {
    const { service, dispatcher, repository, unitOfWork } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));

    await service.claim(1);

    expect(unitOfWork.recordedEventNames).toEqual([ExecutionEventName.Preparing]);
    expect(unitOfWork.recorded[0]?.aggregateType).toBe('Execution');
  });

  it('does not return a candidate whose guard was lost to another worker', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));
    repository.loseGuardFor.add(id);

    await expect(service.claim(1)).resolves.toEqual([]);
  });

  it('stages nothing when the guard was lost', async () => {
    // A transition that did not land must not announce itself.
    const { service, dispatcher, repository, unitOfWork } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));
    repository.loseGuardFor.add(id);

    await service.claim(1);

    expect(unitOfWork.recorded).toHaveLength(0);
  });

  it('treats a lost race as an ordinary outcome rather than an error', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));
    repository.loseGuardFor.add(id);

    await expect(service.claim(1)).resolves.toBeDefined();
  });

  it('claims the winners and skips the losers within one batch', async () => {
    const { service, dispatcher, repository } = harness();
    const won = executionId(1);
    const lost = executionId(2);
    const alsoWon = executionId(3);
    dispatcher.candidates = [candidate(won), candidate(lost), candidate(alsoWon)];
    for (const id of [won, lost, alsoWon]) {
      repository.stored.set(id, at(id, ExecutionStatusValue.QUEUED));
    }
    repository.loseGuardFor.add(lost);

    const claimed = await service.claim(3);

    expect(claimed.map((entry) => entry.id)).toEqual([won, alsoWon]);
  });

  it('skips a candidate that vanished between the read and the claim', async () => {
    const { service, dispatcher } = harness();
    dispatcher.candidates = [candidate(executionId(1))];

    await expect(service.claim(1)).resolves.toEqual([]);
  });

  it.each([
    ExecutionStatusValue.PREPARING,
    ExecutionStatusValue.SUBMITTED,
    ExecutionStatusValue.RUNNING,
    ExecutionStatusValue.CANCELLING,
    ExecutionStatusValue.SUCCEEDED,
    ExecutionStatusValue.CANCELLED,
  ])('skips a candidate already moved to %s, without attempting a transition', async (status) => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.candidates = [candidate(id)];
    repository.stored.set(id, at(id, status));

    await expect(service.claim(1)).resolves.toEqual([]);
    // Checking the status first avoids raising a transition error for what is a
    // normal, expected race.
    expect(repository.updates).toEqual([]);
  });
});

describe('ExecutionWorkerService.reapCancellations', () => {
  it('finalizes an abandoned cancellation through the aggregate', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.abandoned = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.CANCELLING));

    await expect(service.reapCancellations([])).resolves.toBe(1);
    expect(repository.stored.get(id)?.status).toBe(ExecutionStatusValue.CANCELLED);
    expect(repository.organizationsSeen).toEqual([ORGANIZATION_ID]);
  });

  it('stages an ExecutionCancelled message rather than inserting one directly', async () => {
    const { service, dispatcher, repository, unitOfWork } = harness();
    const id = executionId(1);
    dispatcher.abandoned = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.CANCELLING));

    await service.reapCancellations([]);

    expect(unitOfWork.recordedEventNames).toEqual([ExecutionEventName.Cancelled]);
  });

  it('guards the transition on CANCELLING', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.abandoned = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.CANCELLING));

    await service.reapCancellations([]);

    expect(repository.updates).toEqual([{ id, expected: ExecutionStatusValue.CANCELLING }]);
  });

  it('passes the in-flight ids through so this worker does not reap its own work', async () => {
    const { service, dispatcher } = harness();
    const inFlight = [executionId(9)];

    await service.reapCancellations(inFlight);

    expect(dispatcher.excludedSeen).toEqual(inFlight);
  });

  it('does not count an execution that moved on before it could be reaped', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.abandoned = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.CANCELLED));

    await expect(service.reapCancellations([])).resolves.toBe(0);
  });

  it('does not count one whose guard was lost', async () => {
    const { service, dispatcher, repository } = harness();
    const id = executionId(1);
    dispatcher.abandoned = [candidate(id)];
    repository.stored.set(id, at(id, ExecutionStatusValue.CANCELLING));
    repository.loseGuardFor.add(id);

    await expect(service.reapCancellations([])).resolves.toBe(0);
  });

  it('counts only the ones it actually finalized', async () => {
    const { service, dispatcher, repository } = harness();
    const reaped = executionId(1);
    const raced = executionId(2);
    dispatcher.abandoned = [candidate(reaped), candidate(raced)];
    repository.stored.set(reaped, at(reaped, ExecutionStatusValue.CANCELLING));
    repository.stored.set(raced, at(raced, ExecutionStatusValue.RUNNING));

    await expect(service.reapCancellations([])).resolves.toBe(1);
  });
});

describe('ExecutionWorkerService.process capacity admission', () => {
  it('fails from PREPARING before submission when Spark cannot fit an executor', async () => {
    const dispatcher = new FakeDispatcher();
    const contexts = backgroundContexts();
    const repository = new FakeRepository(contexts);
    const unitOfWork = new FakeUnitOfWork();
    const id = executionId(1);
    const authorizationIdentityId = '77777777-7777-4777-8777-777777777777';
    const claimed = { ...candidate(id), connectionId: undefined, authorizationIdentityId };
    const execution = at(id, ExecutionStatusValue.PREPARING);
    repository.stored.set(id, execution);

    const capacityError = new Error(
      'Spark standalone cluster has no executor slot for 1 core and 1024 MiB.',
    );
    const assertCapacity = jest.fn().mockRejectedValue(capacityError);
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const gateway: ISparkExecutionGateway = {
      stageSource: jest.fn().mockResolvedValue('/tmp/execution.py'),
      stageRuntimeConfig: jest.fn().mockResolvedValue('/tmp/runtime.json'),
      validatePythonSyntax: jest.fn().mockResolvedValue({ ok: true, output: '' }),
      assertCapacity,
      submit: jest.fn(),
      cleanup,
      cleanupRuntimeConfig: jest.fn().mockResolvedValue(undefined),
    };
    const runSubmission = jest.fn();
    const submissions = {
      run: runSubmission,
    } as unknown as SparkSubmissionSupervisor;
    const executable = {
      workload: claimed.workload,
      source: new TextEncoder().encode('print("ready")'),
    };
    const workloads: IExecutableWorkloadProvider = {
      resolve: jest.fn(async () => {
        expect(contexts.require().identityId).toBe(authorizationIdentityId);
        return executable;
      }),
      resolveScript: jest.fn().mockResolvedValue(executable),
      resolvePipeline: jest.fn().mockResolvedValue(executable),
    };
    const connectionProfiles = {
      resolveExecutionProfile: jest.fn(),
    } as unknown as IConnectionExecutionProfileProvider;
    const service = new ExecutionWorkerService(
      repository,
      dispatcher,
      gateway,
      submissions,
      workloads,
      connectionProfiles,
      unitOfWork,
      new FixedClock('2026-08-04T10:00:00.000Z'),
      new SequentialIdGenerator(),
      contexts,
      { maxAttempts: 3, artifactsBucket: ARTIFACTS_BUCKET },
      SILENT_LOGGER,
    );

    await service.process(claimed);

    expect(assertCapacity).toHaveBeenCalledWith(execution.resourceProfile);
    expect(runSubmission).not.toHaveBeenCalled();
    expect(execution.status).toBe(ExecutionStatusValue.FAILED);
    expect(execution.failure?.summary).toBe(capacityError.message);
    expect(repository.updates).toEqual([{ id, expected: ExecutionStatusValue.PREPARING }]);
    expect(cleanup).toHaveBeenCalledWith('/tmp/execution.py');
  });
});
