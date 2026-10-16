import { Inject, Injectable } from '@nestjs/common';

import type {
  IWorkflowAccess,
  PipelineReference,
  WorkflowActor,
} from '@application/data-workflow/interfaces/i-workflow-access';
import type {
  IWorkflowPipelineExecutor,
  WorkflowPipelineStatus,
  WorkflowPipelineReadResult,
  WorkflowPreparedPipelineRequest,
} from '@application/data-workflow/interfaces/i-workflow-pipeline-executor';
import type {
  IWorkflowNodeAttemptExecutionRepository,
  WorkflowNodeAttemptIdentity,
} from '@application/data-workflow/interfaces/i-workflow-node-attempt-execution-repository';
import { PreparedExecutionRequestService } from '@application/execution-orchestration/prepared-execution-request.service';
import type { IExecutableWorkloadProvider } from '@application/execution-orchestration/interfaces/i-executable-workload-provider';
import type { IExecutionReader } from '@application/execution-orchestration/interfaces/i-execution-reader';
import {
  WORKFLOW_ACCESS,
  WORKFLOW_NODE_ATTEMPT_EXECUTION_REPOSITORY,
} from '@application/data-workflow/tokens';
import type { IUnitOfWork } from '@application/shared/interfaces/i-unit-of-work';
import { UNIT_OF_WORK } from '@application/shared/tokens';
import {
  EXECUTION_READER,
  EXECUTABLE_WORKLOAD_PROVIDER,
} from '@application/execution-orchestration/tokens';
import { ExecutionError } from '@domain/execution-orchestration/errors/execution.errors';
import { ExecutionStatusValue } from '@domain/execution-orchestration/value-objects/execution-value-objects';
import type { ExecutionOutputConditionPlan } from '@domain/execution-orchestration/models/execution-output-facts';

@Injectable()
export class WorkflowPipelineExecutorAdapter implements IWorkflowPipelineExecutor {
  public constructor(
    @Inject(WORKFLOW_ACCESS)
    private readonly access: IWorkflowAccess,
    @Inject(EXECUTABLE_WORKLOAD_PROVIDER)
    private readonly workloads: IExecutableWorkloadProvider,
    private readonly requests: PreparedExecutionRequestService,
    @Inject(EXECUTION_READER)
    private readonly reader: IExecutionReader,
    @Inject(WORKFLOW_NODE_ATTEMPT_EXECUTION_REPOSITORY)
    private readonly attempts: IWorkflowNodeAttemptExecutionRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  public async prepare(
    actor: WorkflowActor,
    pipeline: PipelineReference,
    outputConditionPlan?: ExecutionOutputConditionPlan,
  ): Promise<WorkflowPreparedPipelineRequest> {
    await this.access.requirePipeline(actor, pipeline);
    const executable = await this.workloads.resolvePipeline(
      pipeline.pipelineId,
      pipeline.versionNumber,
      { includeOutputFacts: outputConditionPlan !== undefined },
    );
    return this.requests.prepare(executable, actor.identityId, outputConditionPlan);
  }

  public async enqueuePrepared(
    attempt: WorkflowNodeAttemptIdentity,
    request: WorkflowPreparedPipelineRequest,
  ): Promise<Awaited<ReturnType<IWorkflowPipelineExecutor['enqueuePrepared']>>> {
    return this.unitOfWork.commit(async (events) => {
      const persisted = await this.attempts.lock(attempt);
      if (persisted === undefined) {
        throw new Error('Data workflow node attempt was not found.');
      }
      if (persisted.executionId !== undefined) {
        return { executionId: persisted.executionId, status: 'QUEUED' };
      }

      const queued = await this.requests.enqueueInTransaction(request, events);
      const associated = await this.attempts.associate(attempt, queued.executionId);
      if (!associated) {
        throw new Error('Data workflow node attempt execution association was lost.');
      }
      return queued;
    });
  }

  public async read(executionId: string): Promise<WorkflowPipelineStatus> {
    return (await this.readResult(executionId)).status;
  }

  public async readResult(executionId: string): Promise<WorkflowPipelineReadResult> {
    const execution = await this.reader.findById(executionId);
    if (execution === undefined) throw ExecutionError.notFound();
    const facts = execution.outputFacts;
    const factsError = execution.outputFactsError;
    const status = mapStatus(execution.status);
    if (execution.outputConditionPlan !== undefined && status === 'SUCCEEDED' && facts === undefined) {
      return {
        status: 'FAILED',
        outputFactsError: factsError ?? 'AMBIGUOUS_OUTPUT_FACTS: committed pipeline output has no facts.',
      };
    }
    return {
      status,
      ...(facts === undefined ? {} : { outputFacts: facts }),
      ...(factsError === undefined ? {} : { outputFactsError: factsError }),
    };
  }
}

function mapStatus(status: ExecutionStatusValue): WorkflowPipelineStatus {
    switch (status) {
      case ExecutionStatusValue.QUEUED:
      case ExecutionStatusValue.PREPARING:
      case ExecutionStatusValue.SUBMITTED:
        return 'PENDING';
      case ExecutionStatusValue.RUNNING:
      case ExecutionStatusValue.CANCELLING:
        return 'RUNNING';
      case ExecutionStatusValue.SUCCEEDED:
        return 'SUCCEEDED';
      case ExecutionStatusValue.FAILED:
      case ExecutionStatusValue.TIMED_OUT:
        return 'FAILED';
      case ExecutionStatusValue.CANCELLED:
        return 'CANCELLED';
    }
    throw new Error('Unsupported execution status for workflow pipeline.');
}
