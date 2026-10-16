import type { IConnectionReferenceProvider } from '@application/database-service/interfaces/i-connection-reference-provider';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { IExecutionRepository } from '@application/execution-orchestration/interfaces/i-execution-repository';
import { toExecutionOutboxMessage } from '@application/execution-orchestration/execution-outbox.mapper';
import type { IClock } from '@application/shared/interfaces/i-clock';
import type { IIdGenerator } from '@application/shared/interfaces/i-id-generator';
import type { IUnitOfWork, RecordedEvents } from '@application/shared/interfaces/i-unit-of-work';
import { Execution } from '@domain/execution-orchestration/aggregates/execution';
import type { ExecutionWorkload } from '@domain/execution-orchestration/models/execution-workload';
import {
  validateExecutionOutputConditionPlan,
  type ExecutionOutputConditionPlan,
} from '@domain/execution-orchestration/models/execution-output-facts';
import {
  ExecutionId,
  LogLocation,
  ResourceProfile,
  type ResourceProfileState,
} from '@domain/execution-orchestration/value-objects/execution-value-objects';

export interface PreparedExecutionRequest {
  readonly workload: ExecutionWorkload;
  readonly connectionId?: string;
  readonly authorizationIdentityId?: string;
  readonly outputConditionPlan?: ExecutionOutputConditionPlan;
}

export interface EnqueuedPreparedExecution {
  readonly executionId: string;
  readonly status: 'QUEUED';
}

const MAX_OUTPUT_CONDITION_PLAN_BYTES = 512 * 1024;

export class PreparedExecutionRequestService {
  private readonly resourceProfile: ResourceProfile;

  public constructor(
    private readonly repository: IExecutionRepository,
    private readonly connectionReferences: IConnectionReferenceProvider,
    private readonly unitOfWork: IUnitOfWork,
    private readonly clock: IClock,
    private readonly idGenerator: IIdGenerator,
    private readonly artifactsBucket: string,
    resourceProfile: ResourceProfileState,
  ) {
    this.resourceProfile = ResourceProfile.create(resourceProfile);
  }

  public async prepare(
    executable: Awaited<ReturnType<IExecutableWorkloadProvider['resolve']>>,
    authorizationIdentityId?: string,
    outputConditionPlan?: ExecutionOutputConditionPlan,
  ): Promise<PreparedExecutionRequest> {
    const validatedPlan =
      outputConditionPlan === undefined
        ? undefined
        : validateExecutionOutputConditionPlan(outputConditionPlan);
    if (
      validatedPlan !== undefined &&
      Buffer.byteLength(JSON.stringify(validatedPlan), 'utf8') > MAX_OUTPUT_CONDITION_PLAN_BYTES
    ) {
      throw new Error('Output condition plan exceeds the supported size bound.');
    }
    if (outputConditionPlan !== undefined && executable.workload.kind !== 'PIPELINE') {
      throw new Error('Execution output facts require a pipeline workload.');
    }
    if (executable.connectionId !== undefined) {
      await this.connectionReferences.requireActive(executable.connectionId);
    }
    return {
      workload: executable.workload,
      ...(executable.connectionId === undefined ? {} : { connectionId: executable.connectionId }),
      ...(authorizationIdentityId === undefined ? {} : { authorizationIdentityId }),
      ...(validatedPlan === undefined ? {} : { outputConditionPlan: validatedPlan }),
    };
  }

  public async enqueue(request: PreparedExecutionRequest): Promise<EnqueuedPreparedExecution> {
    return this.unitOfWork.commit((events) => this.enqueueInTransaction(request, events));
  }

  /**
   * Adds the execution and its outbox event to the caller's unit of work.  A
   * workflow dispatch uses this to make the execution row and node-attempt
   * association inseparable; direct execution requests keep using {@link enqueue}.
   */
  public async enqueueInTransaction(
    request: PreparedExecutionRequest,
    events: RecordedEvents,
  ): Promise<EnqueuedPreparedExecution> {
    const id = ExecutionId.from(this.idGenerator.next());
    const now = this.clock.now();
    const execution = Execution.request(
      {
        id,
        workload: request.workload,
        connectionId: request.connectionId,
        authorizationIdentityId: request.authorizationIdentityId,
        outputConditionPlan: request.outputConditionPlan,
        resourceProfile: this.resourceProfile,
        logLocation: LogLocation.forExecution(this.artifactsBucket, id),
        queuedAt: now,
      },
      this.idGenerator.next(),
    );
    await this.repository.create(execution);
    events.record(...execution.pullDomainEvents().map(toExecutionOutboxMessage));

    return { executionId: id.value, status: 'QUEUED' };
  }
}
