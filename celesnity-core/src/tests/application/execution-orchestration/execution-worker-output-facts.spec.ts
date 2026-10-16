import type { IConnectionExecutionProfileProvider } from '@application/database-service/interfaces/i-connection-execution-profile-provider';
import { backgroundContexts } from '@tests/application/administration/background-principal.fixture';
import { ExecutionWorkerService } from '@application/execution-orchestration/execution-worker.service';
import type { ExecutionWorkerLogger } from '@application/execution-orchestration/execution-worker.logger';
import type { IExecutionDispatcher } from '@application/execution-orchestration/interfaces/i-execution-dispatcher';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import type { ISparkExecutionGateway } from '@application/execution-orchestration/interfaces/i-spark-execution-gateway';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type {
  SparkSubmissionRequest,
  SparkSubmissionSupervisor,
} from '@application/execution-orchestration/spark-submission.supervisor';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type {
  ExecutionOutputConditionPlan,
  ExecutionOutputFacts,
} from '@domain/execution-orchestration/models/execution-output-facts';
import {
  ExecutionId,
  ExecutionStatusValue,
  LogLocation,
  ResourceProfile,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';
import { FakeUnitOfWork } from '@tests/support/unit-of-work.double';
import { FixedClock, SequentialIdGenerator } from '@tests/support/deterministic-ports';
import type { QueuedExecutionCandidate } from '@application/execution-orchestration/interfaces/i-execution-dispatcher';

const EXECUTION_ID = '22222222-2222-4222-8222-000000000007';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const PIPELINE_ID = '33333333-3333-4333-8333-333333333333';
const PIPELINE_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const QUEUED_AT = new Date('2026-09-24T09:00:00.000Z');
const PLAN: ExecutionOutputConditionPlan = {
  targets: [
    {
      targetNodeId: 'target',
      predicates: [{ branchId: 'large-orders', column: 'amount', operator: 'GT', value: 10_000 }],
    },
  ],
};
const FACTS: ExecutionOutputFacts = {
  executionId: EXECUTION_ID,
  targets: [{ targetNodeId: 'target', totalRows: 4, matchesByBranchId: { 'large-orders': 2 } }],
};

const logger: ExecutionWorkerLogger = { warn: () => undefined, error: () => undefined };

function fixture(outputFacts: ExecutionOutputFacts | undefined) {
  const contexts = backgroundContexts();
  const execution = Execution.rehydrate({
    id: ExecutionId.from(EXECUTION_ID),
    workload: {
      kind: 'PIPELINE',
      pipelineId: PIPELINE_ID,
      pipelineVersionId: PIPELINE_VERSION_ID,
      versionNumber: 4,
    },
    status: ExecutionStatusValue.PREPARING,
    resourceProfile: ResourceProfile.create({
      driverMemory: '1g',
      executorMemory: '1g',
      executorCores: 1,
      maxCores: 2,
    }),
    logLocation: LogLocation.forExecution('celesnity-artifacts', ExecutionId.from(EXECUTION_ID)),
    outputConditionPlan: PLAN,
    queuedAt: QUEUED_AT,
    updatedAt: QUEUED_AT,
  });
  const repository: IExecutionRepository = {
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockImplementation(async () => execution),
  };
  const stagedSourceRef = '/tmp/execution.py';
  const runtimeConfigRef = '/tmp/execution-runtime.json';
  const gateway: ISparkExecutionGateway = {
    stageSource: jest.fn().mockResolvedValue(stagedSourceRef),
    stageRuntimeConfig: jest.fn().mockResolvedValue(runtimeConfigRef),
    validatePythonSyntax: jest.fn().mockResolvedValue({ ok: true, output: '' }),
    submit: jest.fn(),
    cleanup: jest.fn().mockResolvedValue(undefined),
    cleanupRuntimeConfig: jest.fn().mockResolvedValue(undefined),
  };
  const source = new TextEncoder().encode('# generated test pipeline');
  const workloads: IExecutableWorkloadProvider = {
    resolve: jest.fn().mockResolvedValue({
      workload: {
        kind: 'PIPELINE',
        pipelineId: PIPELINE_ID,
        pipelineVersionId: PIPELINE_VERSION_ID,
        versionNumber: 4,
      },
      source,
    }),
    resolveScript: jest.fn(),
    resolvePipeline: jest.fn().mockResolvedValue({
      workload: {
        kind: 'PIPELINE',
        pipelineId: PIPELINE_ID,
        pipelineVersionId: PIPELINE_VERSION_ID,
        versionNumber: 4,
      },
      source,
    }),
  };
  const submissions = {
    run: jest.fn(
      async (request: SparkSubmissionRequest, hooks: { onStarted: () => Promise<void> }) => {
        expect(request.outputConditionPlan).toEqual(PLAN);
        expect(request.runtimeConfigRef).toBe(runtimeConfigRef);
        await hooks.onStarted();
        return {
          exitCode: 0,
          sparkApplicationId: undefined,
          timedOut: false,
          cancelRequested: false,
          ...(outputFacts === undefined ? {} : { outputFacts }),
        };
      },
    ),
  } as unknown as SparkSubmissionSupervisor;
  const connectionProfiles = {} as IConnectionExecutionProfileProvider;
  const unitOfWork = new FakeUnitOfWork();
  const service = new ExecutionWorkerService(
    repository,
    {} as IExecutionDispatcher,
    gateway,
    submissions,
    workloads,
    connectionProfiles,
    unitOfWork,
    new FixedClock('2026-09-24T10:00:00.000Z'),
    new SequentialIdGenerator(),
    contexts,
    { maxAttempts: 3, artifactsBucket: 'celesnity-artifacts' },
    logger,
  );
  const claimed: QueuedExecutionCandidate = {
    id: EXECUTION_ID,
    organizationId: ORGANIZATION_ID,
    workload: {
      kind: 'PIPELINE',
      pipelineId: PIPELINE_ID,
      pipelineVersionId: PIPELINE_VERSION_ID,
      versionNumber: 4,
    },
  };

  return { service, execution, gateway, workloads, submissions, claimed, runtimeConfigRef };
}

describe('ExecutionWorkerService output facts', () => {
  it('stages the condition plan and persists facts from the same successful execution', async () => {
    const { service, execution, gateway, workloads, submissions, claimed, runtimeConfigRef } =
      fixture(FACTS);

    await service.process(claimed);

    expect(workloads.resolve).toHaveBeenCalledWith(claimed.workload, { includeOutputFacts: true });
    expect(gateway.stageRuntimeConfig).toHaveBeenCalledWith(
      EXECUTION_ID,
      Buffer.from(JSON.stringify(PLAN), 'utf8'),
    );
    expect(submissions.run).toHaveBeenCalledWith(
      expect.objectContaining({ outputConditionPlan: PLAN, runtimeConfigRef }),
      expect.any(Object),
    );
    expect(execution.status).toBe(ExecutionStatusValue.SUCCEEDED);
    expect(execution.outputFacts).toEqual(FACTS);
    expect(gateway.cleanupRuntimeConfig).toHaveBeenCalledWith(runtimeConfigRef);
  });

  it('fails closed when a zero-exit execution has no complete facts', async () => {
    const { service, execution, claimed } = fixture(undefined);

    await service.process(claimed);

    expect(execution.status).toBe(ExecutionStatusValue.FAILED);
    expect(execution.failure?.summary).toContain('AMBIGUOUS_OUTPUT_FACTS');
    expect(execution.outputFacts).toBeUndefined();
  });
});
